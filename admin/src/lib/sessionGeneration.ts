// 수업 생성 실행기 — Enrollment 일정으로부터 ClassSession을 "실제로" 만드는 유일한 모듈(과 그 롤백).
//
//   Enrollment → Planner(sessionPlan.ts, 순수) → Candidate Sessions → 안전/충돌 필터(계획기 규칙 + 생성 시점 재검증)
//              → Generation Batch(SessionGenerationBatch/Item) → Atomic Creator(수강 1건 = 트랜잭션 1개) → ClassSession
//
// 이 모듈은 웹 서버 코드에서 import하지 않는다 — 실행은 CLI(scripts/generate-sessions.ts)로만 한다(정적 테스트가 고정).
// 보호장치:
//  - 허용 목록(allow-list): 명시한 수강 id만 대상. PILOT은 최대 5건, FULL은 웨이브 단위 목록.
//  - 계획 지문 게이트: 검토한 계획(planHash, 세션 수)이 실행 시점 재계산과 다르면 어떤 것도 쓰지 않고 중단한다.
//  - 기준 시각(asOf): 실행 시각 30분 이내여야 하고, 만들 세션은 전부 "지금" 이후여야 한다(과거/이미 시작한 수업 금지).
//  - 배치 single-flight: activeLock unique라 동시에 두 배치가 RUNNING일 수 없다.
//  - 수강 단위 트랜잭션 + advisory lock(강사 → 수강 순서 고정) + 락 안에서의 재계획(stale 검사) + 생성 건수 검증.
//  - DB unique(ClassSession.generationKey)가 최후 방어선이다. createMany는 skipDuplicates를 쓰지 않는다 —
//    예상 밖의 중복은 조용히 성공하지 않고 해당 수강의 트랜잭션을 롤백한 뒤 ERROR 항목으로 기록한다.
//  - 충돌/비활성 강사/시각 미검증/제외는 조용히 건너뛰지 않고 배치 항목(Item)에 사유와 함께 남긴다.
import type { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { formatAppDate } from "@/lib/appTime";
import { loadSessionPlanInput, type PlanDb } from "@/lib/sessionPlanData";
import {
  PLANNER_VERSION,
  computePlanHash,
  countGenerationSessions,
  planClassSessions,
  type EnrollmentPlanRow,
  type PlanSummary,
} from "@/lib/sessionPlan";

export const PILOT_MAX_ENROLLMENTS = 5;
export const FULL_MAX_ENROLLMENTS = 500;
/** 계획 기준 시각(asOf)이 실행 시각보다 이만큼 이상 오래되면 계획을 다시 보게 한다. */
export const MAX_ASOF_AGE_MS = 30 * 60 * 1000;
export const ACTIVE_LOCK_VALUE = "SESSION_GENERATION";

// pg_advisory_xact_lock(int, int)의 첫 번째 인자(네임스페이스) — 다른 용도의 락과 섞이지 않게 고정값을 쓴다.
const LOCK_NS_ENROLLMENT = 7001;
const LOCK_NS_TEACHER = 7002;
const LOCK_NS_ROLLBACK = 7003;

export type GenerationMode = "PILOT" | "FULL";

export type GateErrorCode =
  | "INVALID_SCOPE"
  | "TOO_MANY_ENROLLMENTS"
  | "ENROLLMENT_NOT_IN_PLAN"
  | "ASOF_INVALID"
  | "ASOF_TOO_OLD"
  | "ASOF_DATE_MISMATCH"
  | "PLAN_HASH_MISMATCH"
  | "EXPECTED_SESSIONS_MISMATCH"
  | "SLOT_NOT_AFTER_NOW"
  | "PILOT_REQUIRES_ELIGIBLE"
  | "ANOTHER_BATCH_RUNNING"
  | "BATCH_NOT_FOUND"
  | "BATCH_RUNNING";

/** 아무것도 쓰기 전에 실행을 거부하는 경우. */
export class GenerationGateError extends Error {
  constructor(
    public readonly code: GateErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "GenerationGateError";
  }
}

class CountMismatchError extends Error {
  constructor(
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(`createMany count mismatch: expected ${expected}, actual ${actual}`);
    this.name = "CountMismatchError";
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 범위 검증 / 미리보기(읽기 전용)
// ---------------------------------------------------------------------------------------------------------------------

export function validateScope(mode: GenerationMode, enrollmentIds: number[]): number[] {
  if (mode !== "PILOT" && mode !== "FULL") throw new GenerationGateError("INVALID_SCOPE", `unknown mode: ${String(mode)}`);
  if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
    throw new GenerationGateError("INVALID_SCOPE", "허용 목록(enrollment ids)이 비어 있습니다.");
  }
  const ids = [...new Set(enrollmentIds)];
  if (ids.length !== enrollmentIds.length) throw new GenerationGateError("INVALID_SCOPE", "허용 목록에 중복된 수강 id가 있습니다.");
  if (!ids.every((n) => Number.isInteger(n) && n > 0 && n <= 2_147_483_647)) {
    throw new GenerationGateError("INVALID_SCOPE", "수강 id는 1 이상의 정수여야 합니다.");
  }
  const max = mode === "PILOT" ? PILOT_MAX_ENROLLMENTS : FULL_MAX_ENROLLMENTS;
  if (ids.length > max) {
    throw new GenerationGateError("TOO_MANY_ENROLLMENTS", `${mode}는 한 번에 최대 ${max}건까지입니다(요청 ${ids.length}건).`);
  }
  return ids.sort((a, b) => a - b);
}

export interface GenerationPreview {
  asOf: Date;
  planHash: string;
  expectedSessions: number;
  scopeRows: EnrollmentPlanRow[];
  population: PlanSummary;
}

/** 허용 목록 범위의 계획을 계산한다(쓰기 없음). 출력된 planHash/expectedSessions를 검토한 뒤 실행 게이트에 넣는다. */
export async function previewGeneration(
  db: PlanDb,
  args: { mode: GenerationMode; enrollmentIds: number[]; asOf: Date },
): Promise<GenerationPreview> {
  const ids = validateScope(args.mode, args.enrollmentIds);
  const plan = planClassSessions(await loadSessionPlanInput(db, args.asOf));
  const byId = new Map(plan.rows.map((r) => [r.enrollmentId, r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new GenerationGateError("ENROLLMENT_NOT_IN_PLAN", `계획에 없는 수강(없거나 COMPLETED): ${missing.join(", ")}`, { missing });
  }
  const scopeRows = ids.map((id) => byId.get(id)!);
  return {
    asOf: args.asOf,
    planHash: computePlanHash(scopeRows),
    expectedSessions: countGenerationSessions(scopeRows),
    scopeRows,
    population: plan.summary,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------------------------------------------------

export interface ExecuteRequest {
  mode: GenerationMode;
  enrollmentIds: number[];
  asOf: Date;
  expectedPlanHash: string;
  expectedSessions: number;
  actorLabel: string;
  actorAdminId?: number | null;
  /** 오류가 나면 거기서 멈춘다(기본 true). 이미 처리된 수강은 그대로 남고 배치는 PARTIAL/FAILED로 기록된다. */
  stopOnError?: boolean;
  /** 테스트용 시계. */
  now?: () => Date;
  /** 테스트 전용 훅(동시성/stale 시나리오 재현). 운영 CLI는 사용하지 않는다. */
  hooks?: { afterBatchCreated?: (batchId: string) => Promise<void> | void; beforeEnrollmentTx?: (enrollmentId: number) => Promise<void> | void };
}

export type ItemOutcome =
  | "GENERATED"
  | "CONFLICT"
  | "INACTIVE_TEACHER"
  | "TIME_UNVERIFIED"
  | "ALREADY_GENERATED"
  | "EXISTING_SESSIONS"
  | "EXCLUDED"
  | "STALE"
  | "ERROR";

export interface ExecuteItem {
  enrollmentId: number;
  outcome: ItemOutcome;
  reasons: string[];
  plannedCount: number;
  createdCount: number;
}

export interface ExecuteResult {
  batchId: string;
  mode: GenerationMode;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  planHash: string;
  expectedSessions: number;
  createdSessions: number;
  items: ExecuteItem[];
  failureReason: string | null;
}

function rowSignature(r: EnrollmentPlanRow): string {
  return JSON.stringify({
    o: r.outcome,
    g: r.generationEligible,
    v: r.timeVerification,
    u: r.enrollmentUpdatedAt,
    s: r.plannedSessions.map((p) => [p.key, p.scheduledAt.toISOString(), p.durationMin, p.teacherId, p.studentId]),
  });
}

/** 계획 결과 중 "생성하지 않는" 수강의 항목 분류. null이면 생성 대상이다. */
function classifyNotGenerated(r: EnrollmentPlanRow): { outcome: ItemOutcome; reasons: string[]; detail?: unknown } | null {
  if (r.generationEligible) return null;
  if (r.outcome === "CONFLICT") {
    return {
      outcome: "CONFLICT",
      reasons: ["TEACHER_TIME_CONFLICT"],
      detail: r.conflicts.map((c) => ({ kind: c.kind, other: c.otherLabel, weekday: c.weekday, time: c.time, otherTime: c.otherTime, days: c.dates.length })),
    };
  }
  if (r.outcome === "ERROR") return { outcome: "ERROR", reasons: r.errors.map((e) => e.code), detail: r.errors };
  if (r.outcome === "ELIGIBLE") return { outcome: "TIME_UNVERIFIED", reasons: ["MULTI_WEEKDAY_CLASS_TIMES_UNVERIFIED"] };
  if (r.reasons.includes("TEACHER_INACTIVE")) return { outcome: "INACTIVE_TEACHER", reasons: [...r.reasons] };
  if (r.reasons.includes("ALREADY_GENERATED")) return { outcome: "ALREADY_GENERATED", reasons: [...r.reasons] };
  if (r.reasons.includes("ALL_SLOTS_ALREADY_EXIST")) return { outcome: "EXISTING_SESSIONS", reasons: [...r.reasons] };
  return { outcome: "EXCLUDED", reasons: r.reasons.length > 0 ? [...r.reasons] : [`STATUS_${r.status}`] };
}

function safeMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/postgres(ql)?:\/\/\S+/gi, "<url>").slice(0, 500);
}

function errorReasons(e: unknown): string[] {
  if (e instanceof CountMismatchError) return ["COUNT_MISMATCH"];
  const code = (e as { code?: string } | null)?.code;
  if (code === "P2002") return ["DUPLICATE_KEY"];
  return ["UNEXPECTED_ERROR"];
}

export async function executeGeneration(db: PrismaClient, req: ExecuteRequest): Promise<ExecuteResult> {
  const now = (req.now ?? (() => new Date()))();
  const ids = validateScope(req.mode, req.enrollmentIds);

  // ---- 게이트 1: 기준 시각 -------------------------------------------------------------------------------------
  if (!(req.asOf instanceof Date) || Number.isNaN(req.asOf.getTime())) throw new GenerationGateError("ASOF_INVALID", "asOf가 올바른 시각이 아닙니다.");
  const ageMs = now.getTime() - req.asOf.getTime();
  if (ageMs < -5_000) throw new GenerationGateError("ASOF_INVALID", "asOf가 미래 시각입니다.");
  if (ageMs > MAX_ASOF_AGE_MS) throw new GenerationGateError("ASOF_TOO_OLD", `asOf가 실행 시각보다 ${Math.round(ageMs / 60000)}분 전입니다(최대 ${MAX_ASOF_AGE_MS / 60000}분). 미리보기를 다시 실행하세요.`);
  if (formatAppDate(req.asOf) !== formatAppDate(now)) throw new GenerationGateError("ASOF_DATE_MISMATCH", "asOf의 KST 날짜가 오늘과 다릅니다. 미리보기를 다시 실행하세요.");

  // ---- 게이트 2: 계획 재계산 + 지문 ----------------------------------------------------------------------------
  const preview = await previewGeneration(db, { mode: req.mode, enrollmentIds: ids, asOf: req.asOf });
  if (preview.planHash !== req.expectedPlanHash) {
    throw new GenerationGateError("PLAN_HASH_MISMATCH", `계획 지문이 다릅니다(검토 ${req.expectedPlanHash.slice(0, 12)}… / 현재 ${preview.planHash.slice(0, 12)}…). 데이터가 바뀌었으니 미리보기를 다시 검토하세요.`);
  }
  if (preview.expectedSessions !== req.expectedSessions) {
    throw new GenerationGateError("EXPECTED_SESSIONS_MISMATCH", `생성 예정 세션 수가 다릅니다(검토 ${req.expectedSessions} / 현재 ${preview.expectedSessions}).`);
  }
  for (const r of preview.scopeRows) {
    if (!r.generationEligible) continue;
    if (r.plannedSessions.some((p) => p.scheduledAt.getTime() <= now.getTime())) {
      throw new GenerationGateError("SLOT_NOT_AFTER_NOW", `수강 #${r.enrollmentId}에 이미 시작했거나 지금 시작하는 슬롯이 있습니다. 미리보기를 다시 실행하세요.`);
    }
  }
  // PILOT은 허용 목록 전부가 생성 대상이어야 하고, 예상 생성 수와 실제 생성 수가 정확히 같아야 성공이다.
  if (req.mode === "PILOT") {
    const bad = preview.scopeRows.filter((r) => !r.generationEligible);
    if (bad.length > 0) {
      throw new GenerationGateError(
        "PILOT_REQUIRES_ELIGIBLE",
        `PILOT 허용 목록에 생성 대상이 아닌 수강이 있습니다: ${bad.map((r) => `#${r.enrollmentId}(${classifyNotGenerated(r)?.outcome})`).join(", ")}`,
        { ids: bad.map((r) => r.enrollmentId) },
      );
    }
  }

  // ---- 배치 생성(single-flight) ---------------------------------------------------------------------------------
  const skipped = preview.scopeRows.reduce(
    (a, r) => ({
      past: a.past + r.skippedPastDates.length,
      startedToday: a.startedToday + r.skippedStartedToday.length,
      existing: a.existing + r.skippedExisting.length,
      closure: a.closure + r.skippedClosure.length,
      conflict: a.conflict + r.withheldCount,
    }),
    { past: 0, startedToday: 0, existing: 0, closure: 0, conflict: 0 },
  );
  let batchId: string;
  try {
    const batch = await db.sessionGenerationBatch.create({
      data: {
        mode: req.mode,
        status: "RUNNING",
        activeLock: ACTIVE_LOCK_VALUE,
        asOf: req.asOf,
        asOfKstDate: formatAppDate(req.asOf),
        plannerVersion: PLANNER_VERSION,
        planHash: preview.planHash,
        expectedSessions: preview.expectedSessions,
        requestedEnrollmentIds: ids,
        plannedEnrollments: ids.length,
        plannedSessions: preview.expectedSessions,
        skippedPast: skipped.past,
        skippedStartedToday: skipped.startedToday,
        skippedExisting: skipped.existing,
        skippedClosure: skipped.closure,
        withheldByConflict: skipped.conflict,
        populationSummary: JSON.parse(JSON.stringify(preview.population)),
        actorLabel: req.actorLabel,
        actorAdminId: req.actorAdminId ?? null,
      },
      select: { id: true },
    });
    batchId = batch.id;
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "P2002") {
      throw new GenerationGateError("ANOTHER_BATCH_RUNNING", "다른 수업 생성 배치가 실행 중입니다(activeLock). 끝나거나 정리된 뒤 다시 실행하세요.");
    }
    throw e;
  }
  await req.hooks?.afterBatchCreated?.(batchId);

  // ---- 수강별 처리 -----------------------------------------------------------------------------------------------
  const items: ExecuteItem[] = [];
  const failures: string[] = [];
  const stopOnError = req.stopOnError ?? true;
  let created = 0;

  const recordItem = async (it: ExecuteItem, detail?: unknown) => {
    await db.sessionGenerationBatchItem.create({
      data: {
        batchId,
        enrollmentId: it.enrollmentId,
        outcome: it.outcome,
        reasons: it.reasons,
        plannedCount: it.plannedCount,
        createdCount: it.createdCount,
        detail: detail === undefined ? undefined : JSON.parse(JSON.stringify(detail)),
      },
    });
    items.push(it);
  };

  let fatal: unknown = null;
  try {
    for (const row of preview.scopeRows) {
      const notGenerated = classifyNotGenerated(row);
      if (notGenerated) {
        await recordItem(
          { enrollmentId: row.enrollmentId, outcome: notGenerated.outcome, reasons: notGenerated.reasons, plannedCount: row.plannedSessions.length, createdCount: 0 },
          notGenerated.detail,
        );
        if (notGenerated.outcome === "ERROR") {
          failures.push(`#${row.enrollmentId}: ${notGenerated.reasons.join(",")}`);
          if (stopOnError) break;
        }
        continue;
      }

      try {
        await req.hooks?.beforeEnrollmentTx?.(row.enrollmentId);
        const result = await generateOneEnrollment(db, { batchId, row, asOf: req.asOf });
        items.push(result);
        created += result.createdCount;
      } catch (e) {
        const it: ExecuteItem = { enrollmentId: row.enrollmentId, outcome: "ERROR", reasons: errorReasons(e), plannedCount: row.plannedSessions.length, createdCount: 0 };
        failures.push(`#${row.enrollmentId}: ${it.reasons.join(",")} — ${safeMessage(e)}`);
        try {
          await recordItem(it, { message: safeMessage(e) });
        } catch {
          items.push(it);
        }
        if (stopOnError) break;
      }
    }
  } catch (e) {
    // 항목 기록 자체가 실패하는 등 예상 밖의 오류 — 잠금을 남기지 않도록 아래에서 배치를 마무리한 뒤 다시 던진다.
    fatal = e;
    failures.push(`FATAL: ${safeMessage(e)}`);
  }

  // ---- 마무리 ------------------------------------------------------------------------------------------------------
  const countOf = (o: ItemOutcome) => items.filter((i) => i.outcome === o).length;
  const errorCount = countOf("ERROR");
  const allProcessed = items.length === preview.scopeRows.length;
  let status: ExecuteResult["status"];
  let failureReason: string | null = failures.length > 0 ? failures.join(" | ").slice(0, 2000) : null;
  if (req.mode === "PILOT") {
    // 예상 candidate와 실제 생성 수가 정확히 일치해야만 성공.
    const exact = allProcessed && errorCount === 0 && countOf("GENERATED") === items.length && created === preview.expectedSessions;
    status = exact ? "SUCCEEDED" : created > 0 ? "PARTIAL" : "FAILED";
    if (!exact && !failureReason) failureReason = `PILOT 불일치: 예상 ${preview.expectedSessions}건 / 실제 ${created}건`;
  } else {
    const ok = allProcessed && errorCount === 0 && created === preview.expectedSessions;
    status = ok ? "SUCCEEDED" : created > 0 ? "PARTIAL" : "FAILED";
    const stale = countOf("STALE");
    if (!ok && !failureReason) failureReason = stale > 0 ? `계획이 바뀌어 건너뛴 수강 ${stale}건(STALE) — 생성 ${created}/${preview.expectedSessions}건` : `생성 ${created}/${preview.expectedSessions}건`;
  }

  await db.sessionGenerationBatch.update({
    where: { id: batchId },
    data: {
      status,
      activeLock: null,
      finishedAt: new Date(),
      createdSessions: created,
      conflictEnrollments: countOf("CONFLICT"),
      inactiveTeacherEnrollments: countOf("INACTIVE_TEACHER"),
      timeUnverifiedEnrollments: countOf("TIME_UNVERIFIED"),
      errorCount,
      failureReason,
    },
  });
  await db.auditLog.create({
    data: {
      actorRole: "ADMIN",
      actorId: req.actorAdminId ?? null,
      actorName: req.actorLabel,
      action: "SCHEDULE_CREATED",
      targetType: "SessionGenerationBatch",
      targetId: batchId,
      description: `수업 생성 배치 ${req.mode} ${status}: 대상 ${ids.length}건, 생성 ${created}/${preview.expectedSessions}건, 충돌 ${countOf("CONFLICT")}, 비활성 강사 ${countOf("INACTIVE_TEACHER")}, 시각 미검증 ${countOf("TIME_UNVERIFIED")}, 오류 ${errorCount}`,
    },
  });

  if (fatal) throw fatal;
  return { batchId, mode: req.mode, status, planHash: preview.planHash, expectedSessions: preview.expectedSessions, createdSessions: created, items, failureReason };
}

async function generateOneEnrollment(
  db: PrismaClient,
  args: { batchId: string; row: EnrollmentPlanRow; asOf: Date },
): Promise<ExecuteItem> {
  const { batchId, row, asOf } = args;
  const teacherId = row.teacherId!;
  return db.$transaction(
    async (tx) => {
      // 락: 강사 → 수강 순서로 항상 같은 순서로 잡는다(교착 방지). 트랜잭션 단위 락이라 PgBouncer 풀링에서도 유효하다.
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_NS_TEACHER}::int, ${teacherId}::int)) AS t`;
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_NS_ENROLLMENT}::int, ${row.enrollmentId}::int)) AS t`;

      // 락 안에서 "지금 상태"로 다시 계획해 승인된 계획과 대조한다 — 수강 수정, 강사 상태, 기존 세션, 충돌, 휴강, 레벨테스트가
      // 계획 이후 바뀌었으면 만들지 않고 STALE로 기록한다.
      const fresh = planClassSessions(await loadSessionPlanInput(tx, asOf));
      const freshRow = fresh.rows.find((r) => r.enrollmentId === row.enrollmentId);
      if (!freshRow || rowSignature(freshRow) !== rowSignature(row)) {
        const it: ExecuteItem = { enrollmentId: row.enrollmentId, outcome: "STALE", reasons: ["PLAN_CHANGED_SINCE_PREVIEW"], plannedCount: row.plannedSessions.length, createdCount: 0 };
        await tx.sessionGenerationBatchItem.create({
          data: {
            batchId,
            enrollmentId: it.enrollmentId,
            outcome: "STALE",
            reasons: it.reasons,
            plannedCount: it.plannedCount,
            detail: JSON.parse(JSON.stringify({ nowOutcome: freshRow?.outcome ?? "MISSING", nowReasons: freshRow?.reasons ?? [], nowGenerationEligible: freshRow?.generationEligible ?? false })),
          },
        });
        return it;
      }

      const data = row.plannedSessions.map((p) => ({
        siteId: DEFAULT_SITE_ID,
        enrollmentId: p.enrollmentId,
        studentId: p.studentId,
        teacherId: p.teacherId,
        scheduledAt: p.scheduledAt,
        durationMin: p.durationMin,
        status: "SCHEDULED" as const,
        isSupplement: false,
        generationKey: p.key,
        generationBatchId: batchId,
      }));
      // skipDuplicates를 쓰지 않는다: 예상 밖의 중복은 unique 위반으로 이 트랜잭션 전체를 실패시킨다.
      const res = await tx.classSession.createMany({ data });
      if (res.count !== data.length) throw new CountMismatchError(data.length, res.count);

      await tx.sessionGenerationBatchItem.create({
        data: { batchId, enrollmentId: row.enrollmentId, outcome: "GENERATED", reasons: [], plannedCount: data.length, createdCount: res.count },
      });
      return { enrollmentId: row.enrollmentId, outcome: "GENERATED", reasons: [], plannedCount: data.length, createdCount: res.count } as ExecuteItem;
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}

/** 비정상 종료로 남은 RUNNING 배치의 잠금을 사람이 풀 때 쓴다(10분 이상 지난 RUNNING만). */
export async function releaseStaleBatchLock(
  db: PrismaClient,
  args: { batchId: string; now?: Date; minAgeMs?: number },
): Promise<{ released: boolean; reason: string }> {
  const now = args.now ?? new Date();
  const minAge = args.minAgeMs ?? 10 * 60 * 1000;
  const batch = await db.sessionGenerationBatch.findUnique({ where: { id: args.batchId } });
  if (!batch) throw new GenerationGateError("BATCH_NOT_FOUND", "배치를 찾을 수 없습니다.");
  if (batch.status !== "RUNNING") return { released: false, reason: `상태가 ${batch.status}라 풀 잠금이 없습니다.` };
  if (now.getTime() - batch.startedAt.getTime() < minAge) return { released: false, reason: "시작 후 10분이 지나지 않았습니다(아직 실행 중일 수 있음)." };
  const created = await db.classSession.count({ where: { generationBatchId: batch.id } });
  await db.sessionGenerationBatch.update({
    where: { id: batch.id },
    data: { status: created > 0 ? "PARTIAL" : "FAILED", activeLock: null, finishedAt: now, createdSessions: created, failureReason: "비정상 종료 — 잠금을 수동으로 해제함" },
  });
  return { released: true, reason: `잠금 해제(생성된 세션 ${created}건 확인)` };
}

// ---------------------------------------------------------------------------------------------------------------------
// 롤백
// ---------------------------------------------------------------------------------------------------------------------

export interface RollbackCandidate {
  sessionId: number;
  enrollmentId: number;
  scheduledAt: Date;
  deletable: boolean;
  reasons: string[];
}

export interface RollbackResult {
  batchId: string;
  apply: boolean;
  total: number;
  deletable: number;
  kept: number;
  deleted: number;
  candidates: RollbackCandidate[];
  status: string;
}

/**
 * 배치가 만든 세션 중 "아직 아무도 손대지 않은 것"만 지운다.
 * 삭제 조건(모두): 이 배치 생성 · status SCHEDULED · 소프트 삭제 아님 · 미래 시각 · 평가/휴강/녹음 연결 없음 ·
 * 배치 종료 이후 수정되지 않음(updatedAt <= finishedAt). 조건에 안 맞는 세션은 자동 삭제하지 않고 목록으로만 보고한다.
 */
export async function rollbackGeneration(
  db: PrismaClient,
  args: { batchId: string; apply: boolean; actorLabel: string; actorAdminId?: number | null; now?: Date },
): Promise<RollbackResult> {
  const now = args.now ?? new Date();
  const batch = await db.sessionGenerationBatch.findUnique({ where: { id: args.batchId } });
  if (!batch) throw new GenerationGateError("BATCH_NOT_FOUND", "배치를 찾을 수 없습니다.");
  if (batch.status === "RUNNING") throw new GenerationGateError("BATCH_RUNNING", "실행 중인 배치는 롤백할 수 없습니다.");
  const finishedAt = batch.finishedAt ?? now;

  const classify = async (client: PlanDbForRollback): Promise<RollbackCandidate[]> => {
    const sessions = await client.classSession.findMany({
      where: { generationBatchId: batch.id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        enrollmentId: true,
        scheduledAt: true,
        status: true,
        deletedAt: true,
        updatedAt: true,
        evaluation: { select: { id: true } },
        leaveRequest: { select: { id: true } },
        audioRecording: { select: { id: true } },
      },
    });
    return sessions.map((s) => {
      const reasons: string[] = [];
      if (s.status !== "SCHEDULED") reasons.push(`STATUS_${s.status}`);
      if (s.deletedAt) reasons.push("SOFT_DELETED");
      if (s.scheduledAt.getTime() <= now.getTime()) reasons.push("NOT_IN_FUTURE");
      if (s.evaluation) reasons.push("HAS_EVALUATION");
      if (s.leaveRequest) reasons.push("HAS_LEAVE_REQUEST");
      if (s.audioRecording) reasons.push("HAS_RECORDING");
      if (s.updatedAt.getTime() > finishedAt.getTime()) reasons.push("MODIFIED_AFTER_BATCH");
      return { sessionId: s.id, enrollmentId: s.enrollmentId, scheduledAt: s.scheduledAt, deletable: reasons.length === 0, reasons };
    });
  };

  if (!args.apply) {
    const candidates = await classify(db);
    const deletable = candidates.filter((c) => c.deletable).length;
    return { batchId: batch.id, apply: false, total: candidates.length, deletable, kept: candidates.length - deletable, deleted: 0, candidates, status: batch.status };
  }

  const out = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_NS_ROLLBACK}::int, hashtext(${batch.id})::int)) AS t`;
      const candidates = await classify(tx);
      const ids = candidates.filter((c) => c.deletable).map((c) => c.sessionId);
      let deleted = 0;
      if (ids.length > 0) {
        const res = await tx.classSession.deleteMany({ where: { id: { in: ids }, generationBatchId: batch.id, status: "SCHEDULED", deletedAt: null } });
        deleted = res.count;
        if (deleted !== ids.length) throw new CountMismatchError(ids.length, deleted);
      }
      const remaining = candidates.length - deleted;
      const status = remaining === 0 ? "ROLLED_BACK" : "PARTIAL";
      await tx.sessionGenerationBatch.update({
        where: { id: batch.id },
        data: {
          status,
          rolledBackAt: now,
          failureReason: remaining === 0 ? batch.failureReason : `롤백 후 남은 세션 ${remaining}건(수정/연결/지난 수업은 자동 삭제하지 않음)`,
        },
      });
      await tx.auditLog.create({
        data: {
          actorRole: "ADMIN",
          actorId: args.actorAdminId ?? null,
          actorName: args.actorLabel,
          action: "SCHEDULE_CANCELLED",
          targetType: "SessionGenerationBatch",
          targetId: batch.id,
          description: `수업 생성 배치 롤백: 삭제 ${deleted}건, 남김 ${remaining}건`,
        },
      });
      return { candidates, deleted, remaining, status };
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  const deletable = out.candidates.filter((c) => c.deletable).length;
  return { batchId: batch.id, apply: true, total: out.candidates.length, deletable, kept: out.remaining, deleted: out.deleted, candidates: out.candidates, status: out.status };
}

type PlanDbForRollback = Pick<PrismaClient, "classSession">;
