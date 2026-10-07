// 정규 수업 재배치(연기/휴강/강사 홀드/유급휴가)의 단일 구현 — 학생 연기, 관리자 연기, 승인된 강사 홀드, 학원 휴강, 유급휴가 승인이
// 전부 이 파일의 rescheduleSession을 지나간다. 사유(source)·권한·급여·승인은 호출부가 따로 다루고, 여기서는 "정규 회차를 유지하며
// 수업을 뒤로 민다"는 규칙만 한 곳에서 구현한다.
//
// 동작(한 트랜잭션, 강사/수강/학생 advisory lock 아래):
//  1) 대상 수업을 LEAVE로 바꾸고(원래 날짜의 기록 + generationKey 묘비 유지 → 생성기를 다시 돌려도 되살아나지 않는다),
//  2) 그 수강의 정규 시퀀스에서 "연기된 수업 이후 첫 번째 비어 있는 유효 슬롯"에 정규 수업(isSupplement=false) 1개를 배치하고
//     (시퀀스를 한 칸씩 미는 것과 날짜 집합이 같다 — regularSlot.ts 설명, test-regularSlot.ts가 증명),
//  3) 새 슬롯이 수강 종료일보다 뒤면 종료일을 새 슬롯 날짜로 늘린다(단순 "+1일"이 아니다),
//  4) LeaveRequest에 사유/실행자/횟수 영향/대체 수업/이전 종료일을 남긴다(되돌리기와 감사용).
// totalSessions는 건드리지 않고 보충수업도 만들지 않는다.
import type { RescheduleSource, RoleName, SessionStatus } from "../generated/prisma/client";
import { formatAppDate, formatAppTime } from "./appTime";
import { lockAll, type Tx } from "./advisoryLock";
import { checkQuotaAdjustment, checkStudentLeadTime, summarizeLeaveQuota, usedFromLeaveRows, type LeaveQuotaSummary } from "./leavePolicy";
import {
  addDaysIso,
  DEFAULT_SLOT_HORIZON_DAYS,
  endDateToIso,
  extendedEndDate,
  findNextFreeRegularSlot,
  isoToEndDate,
  MS_PER_DAY,
  type BusyInterval,
} from "./regularSlot";
import { parseScheduleDaysLabel } from "./weekdays";

/** 레벨테스트에는 소요시간 필드가 없어 충돌 판정용 고정값을 쓴다(scheduleConflict.ts와 같은 값). */
const LEVEL_TEST_DURATION_MIN = 30;

export type RescheduleErrorCode =
  | "SESSION_NOT_FOUND"
  | "ENROLLMENT_NOT_FOUND"
  | "NOT_OWN_SESSION"
  | "NOT_RESCHEDULABLE_STATUS"
  | "ALREADY_RESCHEDULED"
  | "ALREADY_STARTED"
  | "TOO_LATE"
  | "STUDENT_QUOTA_EXCEEDED"
  | "EVALUATION_EXISTS"
  | "AI_PROCESSING"
  | "NO_SLOT_AVAILABLE"
  | "REVERT_BLOCKED"
  | "NOT_APPROVED"
  | "SUPERSEDED_BY_CLOSURE";

export const RESCHEDULE_ERROR_MESSAGE: Record<RescheduleErrorCode, string> = {
  SESSION_NOT_FOUND: "수업을 찾을 수 없습니다.",
  ENROLLMENT_NOT_FOUND: "연결된 수강신청 정보를 찾을 수 없습니다.",
  NOT_OWN_SESSION: "본인 수업만 연기할 수 있습니다.",
  NOT_RESCHEDULABLE_STATUS: "연기할 수 없는 상태의 수업입니다.",
  ALREADY_RESCHEDULED: "이미 연기·휴강 처리되었거나 처리 중인 수업입니다.",
  ALREADY_STARTED: "이미 시작했거나 지난 수업은 학생이 직접 연기할 수 없습니다.",
  TOO_LATE: "수업 시작 2시간 전까지만 연기할 수 있습니다.",
  STUDENT_QUOTA_EXCEEDED: "이 수강의 학생 연기 가능 횟수를 모두 사용했습니다.",
  EVALUATION_EXISTS: "이미 평가서(녹음 결과 포함)가 있는 수업입니다. 평가서를 초기화한 뒤 연기해 주세요.",
  AI_PROCESSING: "녹음의 AI 분석이 진행 중인 수업은 평가 초기화도 연기도 할 수 없습니다. 처리가 끝난 뒤 다시 시도해 주세요.",
  NO_SLOT_AVAILABLE: "연기된 수업을 배치할 수 있는 다음 정규 수업 슬롯을 찾지 못했습니다(수업 요일·시간 정보를 확인해 주세요).",
  REVERT_BLOCKED: "이 연기로 새로 배치된 수업이 이미 진행/변경되어 되돌릴 수 없습니다. 후속 변경부터 되돌려 주세요.",
  NOT_APPROVED: "실제로 적용된(승인된) 요청만 되돌릴 수 있습니다.",
  SUPERSEDED_BY_CLOSURE: "학원 휴강으로 대체된 연기입니다. 해당 날짜의 학원 휴강을 되돌려 주세요.",
};

export class RescheduleError extends Error {
  constructor(
    public readonly code: RescheduleErrorCode,
    message?: string,
  ) {
    super(message ?? RESCHEDULE_ERROR_MESSAGE[code]);
    this.name = "RescheduleError";
  }
}

export function rescheduleErrorMessage(e: unknown): string | null {
  return e instanceof RescheduleError ? e.message : null;
}

// ── 평가서/AI 처리 상태 ────────────────────────────────────────────────────────────────────────────────────────

/** 녹음이 이 상태면 파이프라인이 돌고 있다(업로드 중 포함) — 평가 초기화도 연기도 막는다. */
export const RECORDING_IN_FLIGHT_STATUSES: ReadonlySet<string> = new Set([
  "UPLOADED",
  "PUBLIC_READY",
  "TRANSCRIBING",
  "TRANSCRIBED",
  "TEACHER_SPEAKER_CONFIRMED",
  "ANALYZING",
]);
/** 평가 초기화가 끝난 녹음의 상태 — 녹음 원본/전사는 보존하고 AI 평가 결과만 비운 상태다. */
export const RECORDING_RESET_STATUS = "EVALUATION_RESET";

export type EvaluationState = "NONE" | "HAS_EVALUATION" | "AI_PROCESSING";

/** 수업의 평가 상태: 처리 중이면 AI_PROCESSING, 평가서/녹음 결과가 있으면 HAS_EVALUATION(초기화 필요), 아니면 NONE. */
export function evaluationStateOf(session: {
  evaluation: unknown | null;
  audioRecording: { processingStatus: string } | null;
}): EvaluationState {
  const rec = session.audioRecording;
  if (rec && RECORDING_IN_FLIGHT_STATUSES.has(rec.processingStatus)) return "AI_PROCESSING";
  if (session.evaluation) return "HAS_EVALUATION";
  if (rec && rec.processingStatus !== RECORDING_RESET_STATUS) return "HAS_EVALUATION";
  return "NONE";
}

// ── 학생 연기 횟수 ─────────────────────────────────────────────────────────────────────────────────────────────

export async function countStudentLeaveUsage(tx: Tx, enrollmentId: number): Promise<number> {
  const rows = await tx.leaveRequest.findMany({
    where: { enrollmentId, status: "APPROVED" },
    select: { status: true, quotaImpact: true, source: true, requestedByRole: true, academyClosureId: true },
  });
  return usedFromLeaveRows(rows);
}

export async function getLeaveQuotaSummary(tx: Tx, enrollmentId: number): Promise<LeaveQuotaSummary | null> {
  const e = await tx.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { scheduleDays: true, packageMonths: true, leaveQuotaAdjustment: true },
  });
  if (!e) return null;
  return summarizeLeaveQuota({
    scheduleDays: e.scheduleDays,
    packageMonths: e.packageMonths,
    adminAdjustment: e.leaveQuotaAdjustment,
    usedCount: await countStudentLeaveUsage(tx, enrollmentId),
  });
}

export interface AuditEntry {
  actor: { role: RoleName; id: number | null; name?: string | null };
  action: "LEAVE_REQUESTED" | "LEAVE_APPROVED" | "LEAVE_REJECTED" | "UPDATE" | "DELETE" | "CREATE";
  targetType: string;
  targetId: number;
  text: string;
  meta?: Record<string, unknown>;
}

/** 트랜잭션 안에서 감사 로그를 남긴다(작업과 같이 커밋/롤백된다). 구조화된 값은 JSON으로 description 뒤에 붙인다. */
export async function auditInTx(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorRole: e.actor.role,
      actorId: e.actor.id,
      actorName: e.actor.name ?? null,
      action: e.action,
      targetType: e.targetType,
      targetId: String(e.targetId),
      description: e.meta ? `${e.text} ${JSON.stringify(e.meta)}` : e.text,
    },
  });
}

/** 관리자가 학생 연기 횟수를 가감한다. 결과 횟수가 음수이거나 이미 쓴 횟수보다 작으면 거부한다. */
export async function adjustLeaveQuota(
  tx: Tx,
  input: { enrollmentId: number; newAdjustment: number; reason: string; actor: { role: RoleName; id: number; name?: string | null } },
): Promise<{ ok: true; summary: LeaveQuotaSummary } | { ok: false; error: string }> {
  if (!Number.isInteger(input.newAdjustment) || Math.abs(input.newAdjustment) > 100) return { ok: false, error: "가감 횟수는 -100~100 사이의 정수여야 합니다." };
  if (!input.reason.trim()) return { ok: false, error: "횟수를 수정하는 사유를 입력해 주세요." };
  await lockAll(tx, { enrollmentIds: [input.enrollmentId] });
  const e = await tx.enrollment.findUnique({
    where: { id: input.enrollmentId },
    select: { id: true, studentId: true, scheduleDays: true, packageMonths: true, leaveQuotaAdjustment: true },
  });
  if (!e) return { ok: false, error: RESCHEDULE_ERROR_MESSAGE.ENROLLMENT_NOT_FOUND };
  const used = await countStudentLeaveUsage(tx, e.id);
  const before = summarizeLeaveQuota({ scheduleDays: e.scheduleDays, packageMonths: e.packageMonths, adminAdjustment: e.leaveQuotaAdjustment, usedCount: used });
  const check = checkQuotaAdjustment({ policyQuota: before.policyQuota, newAdjustment: input.newAdjustment, usedCount: used });
  if (!check.ok) {
    return {
      ok: false,
      error:
        check.error === "NEGATIVE_QUOTA"
          ? `연기 가능 횟수가 0보다 작아질 수 없습니다(기본 ${before.policyQuota}회 기준).`
          : `이미 ${used}회 사용했으므로 연기 가능 횟수를 ${check.effectiveQuota}회로 낮출 수 없습니다.`,
    };
  }
  await tx.enrollment.update({ where: { id: e.id }, data: { leaveQuotaAdjustment: input.newAdjustment } });
  const after = summarizeLeaveQuota({ scheduleDays: e.scheduleDays, packageMonths: e.packageMonths, adminAdjustment: input.newAdjustment, usedCount: used });
  await auditInTx(tx, {
    actor: input.actor,
    action: "UPDATE",
    targetType: "Enrollment",
    targetId: e.id,
    text: "학생 연기 횟수 수정",
    meta: {
      enrollmentId: e.id,
      studentId: e.studentId,
      previousAdjustment: e.leaveQuotaAdjustment,
      newAdjustment: input.newAdjustment,
      previousEffectiveQuota: before.effectiveQuota,
      newEffectiveQuota: after.effectiveQuota,
      usedCount: used,
      reason: input.reason.trim(),
    },
  });
  return { ok: true, summary: after };
}

// ── 재배치 ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RescheduleParams {
  sessionId: number;
  source: RescheduleSource;
  /** 실제로 처리하는 사람. 관리자가 학생 대신 "학생 연기"를 눌러도 source는 STUDENT_POSTPONEMENT이고 actor만 ADMIN이다. */
  actor: { role: RoleName; id: number };
  now: Date;
  reason?: string | null;
  /** 학생이 직접 신청한 경우 true — 2시간 제한과 본인 수업 확인을 적용한다(관리자 실행에는 적용하지 않는다). */
  studentSelfService?: boolean;
  /** 연기할 수 있는 수업 상태. 기본은 SCHEDULED만. */
  allowedStatuses?: readonly SessionStatus[];
  /** 학원 휴강 / 유급휴가 승인으로 만들어지는 건의 연결 */
  closureId?: number;
  paidLeaveId?: number;
  /** 강사 홀드 승인처럼 이미 PENDING LeaveRequest가 있는 경우 그 행을 갱신한다. */
  existingLeaveRequestId?: number;
}

export interface RescheduleResult {
  leaveRequestId: number;
  replacementSessionId: number | null;
  replacementAt: Date | null;
  endDateExtendedTo: Date | null;
  quotaImpact: 0 | 1;
}

function timeOrFallback(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return fallback;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** 수강의 정규 시퀀스에서 연기된 수업을 다음 유효 슬롯으로 옮기는 단일 구현. 반드시 트랜잭션 안에서 호출한다. */
export async function rescheduleSession(tx: Tx, p: RescheduleParams): Promise<RescheduleResult> {
  const head = await tx.classSession.findUnique({ where: { id: p.sessionId }, select: { enrollmentId: true, teacherId: true, studentId: true } });
  if (!head) throw new RescheduleError("SESSION_NOT_FOUND");
  await lockAll(tx, { teacherIds: [head.teacherId], enrollmentIds: [head.enrollmentId], studentIds: [head.studentId] });

  // 락을 잡은 뒤 다시 읽는다 — 그 사이 다른 처리가 끝났을 수 있다.
  const s = await tx.classSession.findUnique({
    where: { id: p.sessionId },
    include: { leaveRequest: true, evaluation: { select: { id: true } }, audioRecording: { select: { processingStatus: true } } },
  });
  if (!s || s.deletedAt) throw new RescheduleError("SESSION_NOT_FOUND");
  const enrollment = await tx.enrollment.findUnique({ where: { id: s.enrollmentId } });
  if (!enrollment) throw new RescheduleError("ENROLLMENT_NOT_FOUND");
  // 학생이 직접 신청하는 경우: 신청한 학생 본인의 수업이어야 한다(수강 소유자이기도 해야 한다).
  if (p.studentSelfService && (s.studentId !== p.actor.id || s.studentId !== enrollment.studentId)) throw new RescheduleError("NOT_OWN_SESSION");

  const allowed = p.allowedStatuses ?? (["SCHEDULED"] as const);
  if (s.status === "LEAVE") throw new RescheduleError("ALREADY_RESCHEDULED");
  if (!allowed.includes(s.status)) throw new RescheduleError("NOT_RESCHEDULABLE_STATUS");
  const existingLr = s.leaveRequest;
  if (existingLr && existingLr.id !== p.existingLeaveRequestId && existingLr.status !== "REJECTED") throw new RescheduleError("ALREADY_RESCHEDULED");

  const evalState = evaluationStateOf(s);
  if (evalState === "AI_PROCESSING") throw new RescheduleError("AI_PROCESSING");
  if (evalState === "HAS_EVALUATION") throw new RescheduleError("EVALUATION_EXISTS");

  if (p.studentSelfService) {
    const lead = checkStudentLeadTime(s.scheduledAt, p.now);
    if (!lead.ok) throw new RescheduleError(lead.error);
  }

  const quotaImpact: 0 | 1 = p.source === "STUDENT_POSTPONEMENT" ? 1 : 0;
  if (quotaImpact === 1) {
    const summary = await getLeaveQuotaSummary(tx, enrollment.id);
    if (!summary || summary.usedCount >= summary.effectiveQuota) throw new RescheduleError("STUDENT_QUOTA_EXCEEDED");
  }

  // ── 다음 유효 슬롯(보충수업은 정규 시퀀스에 속하지 않으므로 슬롯을 만들지 않는다) ──
  let replacement: { id: number; scheduledAt: Date } | null = null;
  let endExt: Date | null = null;
  if (!s.isSupplement) {
    const weekdays = [...new Set(parseScheduleDaysLabel(enrollment.scheduleDays))];
    const fallbackTime = formatAppTime(s.scheduledAt);
    const overrides = enrollment.classTimes && typeof enrollment.classTimes === "object" && !Array.isArray(enrollment.classTimes) ? (enrollment.classTimes as Record<string, unknown>) : {};
    const timeByWeekday = (w: number) => timeOrFallback(overrides[String(w)], timeOrFallback(enrollment.classTime, fallbackTime));

    const lowerBound = new Date(Math.max(s.scheduledAt.getTime(), p.now.getTime()));
    const rangeStart = new Date(lowerBound.getTime() - MS_PER_DAY);
    const rangeEnd = new Date(lowerBound.getTime() + (DEFAULT_SLOT_HORIZON_DAYS + 2) * MS_PER_DAY);

    const [own, teacherSessions, studentSessions, levelTests, student] = await Promise.all([
      tx.classSession.findMany({ where: { enrollmentId: enrollment.id, isSupplement: false }, select: { scheduledAt: true, generationKey: true } }),
      tx.classSession.findMany({
        where: { teacherId: s.teacherId, id: { not: s.id }, deletedAt: null, status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
        select: { scheduledAt: true, durationMin: true },
      }),
      tx.classSession.findMany({
        where: { studentId: s.studentId, id: { not: s.id }, deletedAt: null, status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
        select: { scheduledAt: true, durationMin: true },
      }),
      tx.levelTest.findMany({ where: { teacherId: s.teacherId, scheduledTestDate: { gte: rangeStart, lt: rangeEnd } }, select: { scheduledTestDate: true } }),
      tx.student.findUnique({ where: { id: s.studentId }, select: { agentId: true } }),
    ]);
    const closures = await tx.academyClosure.findMany({
      where: { siteId: s.siteId, date: { gte: new Date(rangeStart.getTime() - MS_PER_DAY) }, OR: [{ agentId: null }, ...(student?.agentId ? [{ agentId: student.agentId }] : [])] },
      select: { date: true },
    });

    // 같은 날짜에 정규 수업이 둘이 되지 않도록, 이 수강의 정규 수업(삭제된 것 포함)과 generationKey가 가진 날짜는 전부 "찬 슬롯"이다.
    const occupiedDates = new Set<string>();
    for (const o of own) {
      occupiedDates.add(formatAppDate(o.scheduledAt));
      const m = o.generationKey ? /:(\d{4}-\d{2}-\d{2})$/.exec(o.generationKey) : null;
      if (m) occupiedDates.add(m[1]);
    }
    const busy: BusyInterval[] = [];
    for (const t of [...teacherSessions, ...studentSessions]) busy.push({ start: t.scheduledAt.getTime(), end: t.scheduledAt.getTime() + t.durationMin * 60_000 });
    for (const lt of levelTests) if (lt.scheduledTestDate) busy.push({ start: lt.scheduledTestDate.getTime(), end: lt.scheduledTestDate.getTime() + LEVEL_TEST_DURATION_MIN * 60_000 });

    const slot = findNextFreeRegularSlot({
      weekdays,
      timeByWeekday,
      durationMin: s.durationMin,
      lowerBound,
      occupiedDates,
      closureDates: new Set(closures.map((c) => formatAppDate(c.date))),
      busy,
    });
    if (!slot) throw new RescheduleError("NO_SLOT_AVAILABLE");

    // generationKey(unique)를 같이 박는다 — 같은 슬롯을 동시에 두 번 채우려 하면 이 unique가 마지막 안전장치다.
    const created = await tx.classSession.create({
      data: {
        siteId: s.siteId,
        enrollmentId: s.enrollmentId,
        studentId: s.studentId,
        teacherId: s.teacherId,
        scheduledAt: slot.scheduledAt,
        durationMin: s.durationMin,
        status: "SCHEDULED",
        isSupplement: false,
        relatedSessionId: s.id,
        generationKey: `${s.enrollmentId}:${slot.date}`,
      },
      select: { id: true, scheduledAt: true },
    });
    replacement = created;
    endExt = extendedEndDate(enrollment.endDate, slot.date);
  }

  await tx.classSession.update({ where: { id: s.id }, data: { status: "LEAVE" } });
  if (endExt) await tx.enrollment.update({ where: { id: enrollment.id }, data: { endDate: endExt } });
  const extendedDays = endExt ? Math.round((endExt.getTime() - enrollment.endDate.getTime()) / MS_PER_DAY) : 0;

  const byStaff = p.actor.role !== "STUDENT" && p.actor.role !== "TEACHER";
  const data = {
    siteId: enrollment.siteId,
    classSessionId: s.id,
    enrollmentId: enrollment.id,
    studentId: s.studentId,
    reason: p.reason?.trim() || null,
    extendedDays,
    status: "APPROVED" as const,
    // 옛 화면(휴강관리 탭 분류)과 호환 — 학생 연기는 관리자가 대신 눌러도 requestedByRole=STUDENT, 실행자는 executedBy*에 남는다.
    requestedByRole: p.source === "STUDENT_POSTPONEMENT" ? ("STUDENT" as const) : p.source === "TEACHER_HOLD" ? ("TEACHER" as const) : p.actor.role,
    approvedById: byStaff ? p.actor.id : null,
    approvedAt: p.now,
    academyClosureId: p.closureId ?? null,
    paidLeaveId: p.paidLeaveId ?? null,
    source: p.source,
    finalSource: p.source,
    quotaImpact,
    executedByRole: p.actor.role,
    executedById: p.actor.id,
    supersededByClosureId: null,
    supersededAt: null,
    replacementSessionId: replacement?.id ?? null,
    previousEndDate: endExt ? enrollment.endDate : null,
  };
  const lr = existingLr
    ? await tx.leaveRequest.update({ where: { id: existingLr.id }, data })
    : await tx.leaveRequest.create({ data });

  return { leaveRequestId: lr.id, replacementSessionId: replacement?.id ?? null, replacementAt: replacement?.scheduledAt ?? null, endDateExtendedTo: endExt, quotaImpact };
}

/**
 * 연기/휴강 되돌리기. 새 방식(replacementSessionId가 있는 건)은 대체 수업을 지우고 종료일을 되돌린다 — 대체 수업이 이미 진행/변경됐으면
 * 거부한다. 옛 방식 건(대체 수업 없음)은 기존처럼 종료일에서 extendedDays를 빼고 수업만 SCHEDULED로 되돌린다.
 * 학생 연기 횟수는 LeaveRequest의 quotaImpact 합으로 세므로 행을 지우면 자동으로 복구된다(별도 카운터가 없어 이중 복구가 없다).
 */
export async function revertReschedule(tx: Tx, leaveRequestId: number): Promise<{ studentId: number; enrollmentId: number }> {
  const lr = await tx.leaveRequest.findUnique({ where: { id: leaveRequestId }, include: { classSession: { select: { teacherId: true } } } });
  if (!lr) throw new RescheduleError("SESSION_NOT_FOUND");
  await lockAll(tx, { teacherIds: [lr.classSession.teacherId], enrollmentIds: [lr.enrollmentId] });
  const fresh = await tx.leaveRequest.findUnique({ where: { id: leaveRequestId } });
  if (!fresh) throw new RescheduleError("SESSION_NOT_FOUND");
  if (fresh.status !== "APPROVED") throw new RescheduleError("NOT_APPROVED");
  if (fresh.supersededByClosureId !== null) throw new RescheduleError("SUPERSEDED_BY_CLOSURE");
  const enrollment = await tx.enrollment.findUnique({ where: { id: fresh.enrollmentId } });
  if (!enrollment) throw new RescheduleError("ENROLLMENT_NOT_FOUND");

  let restoredEnd: Date | null = null;
  if (fresh.replacementSessionId !== null) {
    const rep = await tx.classSession.findUnique({
      where: { id: fresh.replacementSessionId },
      include: { leaveRequest: { select: { id: true } }, evaluation: { select: { id: true } }, audioRecording: { select: { id: true } }, relatedFrom: { select: { id: true } } },
    });
    // 대체 수업이 이미 진행됐거나(SCHEDULED가 아님) 자체가 연기/휴강됐거나 평가·녹음이 붙었으면 되돌리면 데이터가 어긋난다.
    if (!rep || rep.deletedAt || rep.status !== "SCHEDULED" || rep.leaveRequest || rep.evaluation || rep.audioRecording || rep.relatedFrom.length > 0) {
      throw new RescheduleError("REVERT_BLOCKED");
    }
    await tx.classSession.delete({ where: { id: rep.id } });
    if (fresh.previousEndDate && endDateToIso(enrollment.endDate) === formatAppDate(rep.scheduledAt)) {
      // 이 연기가 늘린 종료일이 아직 그대로면 되돌린다. 단 남아 있는 정규 수업이 그 이전 종료일보다 뒤에 있으면 그 날짜까지는 유지한다.
      const last = await tx.classSession.findFirst({
        where: { enrollmentId: enrollment.id, isSupplement: false, deletedAt: null, status: { notIn: ["LEAVE", "CANCELLED"] } },
        orderBy: { scheduledAt: "desc" },
        select: { scheduledAt: true },
      });
      const prevIso = endDateToIso(fresh.previousEndDate);
      const lastIso = last ? formatAppDate(last.scheduledAt) : prevIso;
      restoredEnd = isoToEndDate(lastIso > prevIso ? lastIso : prevIso);
    }
  } else if (fresh.source === null) {
    // 옛 방식(새 필드가 생기기 전의 건): 수업 상태와 종료일(+extendedDays일)만 바꿨다. (새 방식인데 대체 수업이 없는 건 — 보충수업 — 은 종료일을 바꾸지 않았다.)
    const d = new Date(enrollment.endDate);
    d.setDate(d.getDate() - fresh.extendedDays);
    restoredEnd = d;
  }

  await tx.classSession.update({ where: { id: fresh.classSessionId }, data: { status: "SCHEDULED" } });
  if (restoredEnd) await tx.enrollment.update({ where: { id: enrollment.id }, data: { endDate: restoredEnd } });
  await tx.leaveRequest.delete({ where: { id: fresh.id } });
  return { studentId: fresh.studentId, enrollmentId: fresh.enrollmentId };
}

// ── 학원 휴강 ↔ 학생 연기 대체(supersede) ────────────────────────────────────────────────────────────────────────

/**
 * 학원 휴강이 이미 학생 연기로 처리된 수업과 같은 날이면, 그 연기를 "학원 휴강으로 대체"한다: 이력은 지우지 않고 finalSource를
 * ACADEMY_CLOSURE로 바꾸며 횟수 영향을 0으로 만든다(학생 횟수 복구). 수업은 이미 한 번 재배치되었으므로 cascade도 종료일 연장도 다시 하지
 * 않는다 — 하나의 최종 재배치로 처리된다. 대체된 건수를 돌려준다.
 */
export async function supersedeStudentPostponements(
  tx: Tx,
  input: { closureId: number; dayStart: Date; dayEnd: Date; agentScopeId?: number | null; now: Date },
): Promise<number> {
  const rows = await tx.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      supersededByClosureId: null,
      academyClosureId: null,
      OR: [{ finalSource: "STUDENT_POSTPONEMENT" }, { source: null, requestedByRole: "STUDENT" }],
      classSession: { status: "LEAVE", deletedAt: null, scheduledAt: { gte: input.dayStart, lt: input.dayEnd }, ...(input.agentScopeId ? { student: { agentId: input.agentScopeId } } : {}) },
    },
    select: { id: true, enrollmentId: true },
  });
  if (rows.length === 0) return 0;
  await lockAll(tx, { enrollmentIds: rows.map((r) => r.enrollmentId) });
  const res = await tx.leaveRequest.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, supersededByClosureId: null },
    data: { source: "STUDENT_POSTPONEMENT", finalSource: "ACADEMY_CLOSURE", quotaImpact: 0, supersededByClosureId: input.closureId, supersededAt: input.now },
  });
  return res.count;
}

/** 학원 휴강을 되돌릴 때, 그 휴강이 대체했던 학생 연기를 원래대로(횟수 -1) 복원한다. 한 번만 복원된다(supersededByClosureId 조건). */
export async function restoreSupersededStudentPostponements(tx: Tx, closureId: number): Promise<number> {
  const rows = await tx.leaveRequest.findMany({ where: { supersededByClosureId: closureId }, select: { id: true, enrollmentId: true } });
  if (rows.length === 0) return 0;
  await lockAll(tx, { enrollmentIds: rows.map((r) => r.enrollmentId) });
  const res = await tx.leaveRequest.updateMany({
    where: { supersededByClosureId: closureId },
    data: { finalSource: "STUDENT_POSTPONEMENT", quotaImpact: 1, supersededByClosureId: null, supersededAt: null },
  });
  return res.count;
}

// ── 평가 초기화(관리자) ────────────────────────────────────────────────────────────────────────────────────────

/**
 * 평가서가 이미 있는 수업을 연기하기 전의 관리자 초기화. 평가서(LessonEvaluation)를 지우고 녹음의 AI 평가 결과(aiDraft/teacherQcDraft/오류/
 * 분석·검토 시각)만 비운다. 녹음 원본(R2 객체/driveFileId/fileName)과 전사, providerTranscriptId는 그대로 둔다 — 원본을 삭제하지 않는다.
 * AI 처리가 진행 중이면 거부한다.
 */
export async function resetSessionEvaluation(
  tx: Tx,
  input: { sessionId: number; actor: { role: RoleName; id: number; name?: string | null }; reason: string },
): Promise<{ ok: true; hadEvaluation: boolean; hadRecording: boolean } | { ok: false; error: string }> {
  if (!input.reason.trim()) return { ok: false, error: "초기화 사유를 입력해 주세요." };
  const head = await tx.classSession.findUnique({ where: { id: input.sessionId }, select: { enrollmentId: true, teacherId: true } });
  if (!head) return { ok: false, error: RESCHEDULE_ERROR_MESSAGE.SESSION_NOT_FOUND };
  await lockAll(tx, { teacherIds: [head.teacherId], enrollmentIds: [head.enrollmentId] });
  const s = await tx.classSession.findUnique({
    where: { id: input.sessionId },
    include: { evaluation: { select: { id: true, content: true } }, audioRecording: { select: { id: true, processingStatus: true } } },
  });
  if (!s || s.deletedAt) return { ok: false, error: RESCHEDULE_ERROR_MESSAGE.SESSION_NOT_FOUND };
  const state = evaluationStateOf(s);
  if (state === "AI_PROCESSING") return { ok: false, error: RESCHEDULE_ERROR_MESSAGE.AI_PROCESSING };
  if (state === "NONE") return { ok: false, error: "초기화할 평가 결과가 없습니다." };

  const previousRecordingStatus = s.audioRecording?.processingStatus ?? null;
  if (s.evaluation) await tx.lessonEvaluation.delete({ where: { id: s.evaluation.id } });
  if (s.audioRecording) {
    await tx.audioRecording.update({
      where: { id: s.audioRecording.id },
      data: { aiDraft: null, teacherQcDraft: null, errorMessage: null, analyzedAt: null, reviewedAt: null, processingStatus: RECORDING_RESET_STATUS },
    });
  }
  await auditInTx(tx, {
    actor: input.actor,
    action: "UPDATE",
    targetType: "ClassSession",
    targetId: s.id,
    text: "평가 초기화(관리자)",
    meta: {
      sessionId: s.id,
      hadEvaluation: !!s.evaluation,
      deletedEvaluationChars: s.evaluation?.content.length ?? 0,
      hadRecording: !!s.audioRecording,
      previousRecordingStatus,
      originalAudioKept: true,
      reason: input.reason.trim(),
    },
  });
  return { ok: true, hadEvaluation: !!s.evaluation, hadRecording: !!s.audioRecording };
}

export { addDaysIso };
