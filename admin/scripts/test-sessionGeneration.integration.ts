// 수업 생성 실행기 통합 테스트 — 실제 PostgreSQL에서 마이그레이션을 적용한 DB로 검증한다(unique 제약, 트랜잭션, 동시성, 롤백).
//
// 필요한 것: TEST_DATABASE_URL — 마이그레이션이 이미 적용된(`npx prisma migrate deploy`) "버려도 되는" 테스트 DB.
//   · CI: 서비스 컨테이너 postgres의 hifive_test DB(localhost)
//   · 로컬: 격리 스키마 `?schema=gentest_<이름>`을 붙인 URL(테스트가 끝나면 그 스키마만 DROP)
// 안전장치: localhost의 이름에 "test"가 든 DB이거나 schema가 gentest_로 시작할 때만 실행한다 — 그 외에는 거부(운영 DB 보호).
// 테스트는 시작할 때 이 DB의 데이터를 TRUNCATE한다. TEST_DATABASE_URL이 없으면 건너뛴다(CI는 REQUIRE_INTEGRATION=1로 필수화).
// 실행(admin 디렉터리): TEST_DATABASE_URL=... npx tsx scripts/test-sessionGeneration.integration.ts
import { createGenerationClient, parseDbUrl } from "./lib/generationClient";
import {
  ACTIVE_LOCK_VALUE,
  GenerationGateError,
  executeGeneration,
  previewGeneration,
  releaseStaleBatchLock,
  rollbackGeneration,
  type ExecuteRequest,
  type ExecuteResult,
} from "../src/lib/sessionGeneration";
import { countSessionsBlockingDeletion } from "../src/lib/enrollmentDeletion";

const raw = process.env.TEST_DATABASE_URL;
if (!raw) {
  if (process.env.REQUIRE_INTEGRATION === "1") {
    console.error("TEST_DATABASE_URL이 없습니다(CI에서는 필수).");
    process.exit(1);
  }
  console.log("SKIP: TEST_DATABASE_URL이 없어 통합 테스트를 건너뜁니다.");
  process.exit(0);
}
const parsed = parseDbUrl(raw);
const isLocalTestDb = ["localhost", "127.0.0.1"].includes(parsed.host) && /test/i.test(parsed.database);
const isIsolatedSchema = !!parsed.schema && parsed.schema.startsWith("gentest_");
if (!isLocalTestDb && !isIsolatedSchema) {
  console.error("거부: TEST_DATABASE_URL이 테스트 DB로 보이지 않습니다(localhost의 *test* DB 이거나 ?schema=gentest_* 여야 함).");
  process.exit(2);
}

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

// 가상의 "지금": 2026-10-05(월) 10:00 KST. 수업 시각은 이 시각 기준으로 과거/미래가 갈린다.
const NOW = new Date("2026-10-05T10:00:00+09:00");

const SCHEMA = parsed.schema ?? "public";
// 원시 SQL은 search_path에 기대지 않고 스키마를 명시한다(어댑터의 schema 옵션은 Prisma 모델 쿼리에만 적용된다).
const T = (name: string) => `"${SCHEMA}"."${name}"`;
const db = createGenerationClient(raw, { max: 6 });
const dbB = createGenerationClient(raw, { max: 6 });

async function reset() {
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${T("sites")}, ${T("audit_logs")}, ${T("session_generation_batches")} RESTART IDENTITY CASCADE`);
  await db.site.create({ data: { code: "main", name: "test-site" } });
}

let seq = 0;
async function mkAgent() {
  seq++;
  return db.agent.create({ data: { siteId: 1, name: `agent${seq}`, code: `ag${seq}` } });
}
async function mkTeacher(over: { accountStatus?: "ACTIVE" | "INACTIVE"; approvalStatus?: "APPROVED" | "PENDING" } = {}) {
  seq++;
  return db.teacher.create({
    data: { siteId: 1, realName: `T${seq}`, loginId: `t${seq}`, passwordHash: "x", approvalStatus: over.approvalStatus ?? "APPROVED", accountStatus: over.accountStatus ?? "ACTIVE", availableHours: [] },
  });
}
async function mkStudent(agentId?: number) {
  seq++;
  return db.student.create({ data: { siteId: 1, name: `S${seq}`, loginId: `s${seq}`, passwordHash: "x", agentId: agentId ?? null } });
}
async function mkEnrollment(o: {
  teacherId: number;
  studentId: number;
  days: string;
  time: string;
  dur?: number;
  start?: string;
  end?: string;
  classTimes?: Record<string, string>;
  status?: "ACTIVE" | "COMPLETED" | "HOLDING";
}) {
  return db.enrollment.create({
    data: {
      siteId: 1,
      studentId: o.studentId,
      teacherId: o.teacherId,
      packageMonths: 1,
      classMethod: "zoom",
      scheduleDays: o.days,
      classTime: o.time,
      classTimes: o.classTimes,
      classDurationMin: o.dur ?? 25,
      totalSessions: 8,
      startDate: d(o.start ?? "2026-10-05"),
      endDate: d(o.end ?? "2026-11-02"),
      status: o.status ?? "ACTIVE",
    },
  });
}
/** 단일 요일 수강 하나(강사/학생 포함) — 4주(10/5~11/2) 동안 해당 요일 4회. */
async function mkSimple(days: string, time: string, dur = 25, teacherId?: number) {
  const t = teacherId ? { id: teacherId } : await mkTeacher();
  const s = await mkStudent();
  return mkEnrollment({ teacherId: t.id, studentId: s.id, days, time, dur });
}

async function run(mode: "PILOT" | "FULL", ids: number[], over: Partial<ExecuteRequest> = {}, asOf: Date = NOW): Promise<ExecuteResult> {
  const p = await previewGeneration(db, { mode, enrollmentIds: ids, asOf });
  return executeGeneration(db, {
    mode,
    enrollmentIds: ids,
    asOf,
    expectedPlanHash: p.planHash,
    expectedSessions: p.expectedSessions,
    actorLabel: "itest",
    actorAdminId: null,
    now: () => NOW,
    ...over,
  });
}
const counts = async () => ({
  sessions: await db.classSession.count(),
  batches: await db.sessionGenerationBatch.count(),
  items: await db.sessionGenerationBatchItem.count(),
});
const gateCode = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return "NO_ERROR";
  } catch (e) {
    return e instanceof GenerationGateError ? e.code : `OTHER:${(e as Error).message.slice(0, 80)}`;
  }
};

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

// ---------------------------------------------------------------------------------------------------------------------
test("스키마: generationKey unique 인덱스와 배치 테이블이 마이그레이션으로 존재", async () => {
  await reset();
  const idx = await db.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE schemaname = '${SCHEMA}' AND indexname IN ('class_sessions_generationKey_key','session_generation_batches_activeLock_key')`);
  check("두 unique 인덱스 존재", idx.length === 2, JSON.stringify(idx));
  const e1 = await mkSimple("화", "19:00");
  const tch = await mkTeacher();
  const stu = await mkStudent();
  // 같은 NULL 키 여러 개(수동/보충 세션)는 허용된다
  const base = { siteId: 1, enrollmentId: e1.id, studentId: stu.id, teacherId: tch.id, durationMin: 25 };
  await db.classSession.createMany({ data: [{ ...base, scheduledAt: new Date("2026-10-13T10:00:00Z") }, { ...base, scheduledAt: new Date("2026-10-13T10:00:00Z"), isSupplement: true }, { ...base, scheduledAt: new Date("2026-10-13T11:00:00Z") }] });
  check("키가 NULL인 세션(수동/보충)은 같은 수강·같은 날에 여러 개 공존", (await db.classSession.count({ where: { generationKey: null } })) === 3);
});

test("생성 키 호환성: 수동/보충/삭제/50분 세션과 공존, 홀드 해제 이동(+7일 반복)과 충돌 없음, 삭제 후 재생성 안 됨", async () => {
  await reset();
  const t = await mkTeacher();
  const stu = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: stu.id, days: "화", time: "19:00", dur: 50 });
  const base = { siteId: 1, enrollmentId: e.id, studentId: stu.id, teacherId: t.id };
  // 10/13(화)에 수동 정규 세션(다른 시각이 아니라 같은 날) — 계획기는 이 날짜를 건너뛴다
  const manual = await db.classSession.create({ data: { ...base, scheduledAt: new Date("2026-10-13T10:00:00Z"), durationMin: 50 } });
  // 10/20(화)에 보충수업(날짜를 막지 않음) + 소프트 삭제된 세션(날짜를 막지 않음)
  await db.classSession.create({ data: { ...base, scheduledAt: new Date("2026-10-20T12:00:00Z"), durationMin: 25, isSupplement: true } });
  await db.classSession.create({ data: { ...base, scheduledAt: new Date("2026-10-27T10:00:00Z"), durationMin: 50, deletedAt: new Date("2026-10-01T00:00:00Z") } });

  const r = await run("PILOT", [e.id]);
  check("파일럿 성공", r.status === "SUCCEEDED", JSON.stringify([r.status, r.failureReason]));
  const gen = await db.classSession.findMany({ where: { generationBatchId: r.batchId }, orderBy: { scheduledAt: "asc" } });
  check("수동 세션이 있는 10/13은 건너뛰고 10/6, 10/20, 10/27 생성(보충/삭제 세션은 날짜를 막지 않음)", gen.map((g) => g.generationKey).join() === `${e.id}:2026-10-06,${e.id}:2026-10-20,${e.id}:2026-10-27`, gen.map((g) => g.generationKey).join());
  check("50분 수업은 durationMin=50 세션 1개로 표현", gen.every((g) => g.durationMin === 50 && g.status === "SCHEDULED" && g.isSupplement === false));
  check("생성 세션: KST 19:00 = 10:00Z, 강사/학생/수강 복사", gen[0].scheduledAt.toISOString() === "2026-10-06T10:00:00.000Z" && gen.every((g) => g.teacherId === t.id && g.studentId === stu.id && g.siteId === 1));
  check("수동 세션은 키/배치가 NULL 그대로", (await db.classSession.findUnique({ where: { id: manual.id } }))?.generationKey === null);

  // 홀드 해제(holdApply.releaseHold)와 같은 방식: HOLD 세션을 오름차순으로 한 행씩 +7일 이동 — 키가 immutable이라 충돌하지 않는다.
  await db.classSession.updateMany({ where: { generationBatchId: r.batchId }, data: { status: "HOLD" } });
  const held = await db.classSession.findMany({ where: { generationBatchId: r.batchId, status: "HOLD" }, orderBy: { scheduledAt: "asc" } });
  let moved = true;
  try {
    for (const s of held) {
      const nd = new Date(s.scheduledAt);
      nd.setUTCDate(nd.getUTCDate() + 7);
      await db.classSession.update({ where: { id: s.id }, data: { scheduledAt: nd, status: "SCHEDULED" } });
    }
  } catch {
    moved = false;
  }
  check("홀드 해제처럼 +7일씩 순차 이동해도 generationKey unique와 충돌하지 않음", moved);

  // (설계 근거) 날짜 기준 부분 unique 인덱스(U1)였다면 같은 순차 이동에서 즉시 위반한다 — 임시 인덱스로 재현하고 바로 지운다.
  await db.classSession.deleteMany({ where: { enrollmentId: e.id } });
  const rows = [0, 1, 2].map((i) => ({ siteId: 1, enrollmentId: e.id, studentId: stu.id, teacherId: t.id, durationMin: 25, status: "HOLD" as const, scheduledAt: new Date(`2026-10-${13 + i * 7}T10:00:00Z`) }));
  await db.classSession.createMany({ data: rows });
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX "tmp_u1_probe" ON ${T("class_sessions")} ("enrollmentId", ((("scheduledAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::date)) WHERE "deletedAt" IS NULL AND "isSupplement" = false`);
  let u1Violated = false;
  try {
    const hs = await db.classSession.findMany({ where: { enrollmentId: e.id }, orderBy: { scheduledAt: "asc" } });
    for (const s of hs) {
      const nd = new Date(s.scheduledAt);
      nd.setUTCDate(nd.getUTCDate() + 7);
      await db.classSession.update({ where: { id: s.id }, data: { scheduledAt: nd } });
    }
  } catch {
    u1Violated = true;
  }
  await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "${SCHEMA}"."tmp_u1_probe"`);
  check("(설계 근거) 날짜 기준 부분 unique 인덱스였다면 같은 +7일 순차 이동이 즉시 위반됨", u1Violated);
});

test("삭제(소프트)/이동된 생성 세션의 원래 날짜는 재생성되지 않음(키가 묘비 역할) + 이미 생성된 수강은 다시 생성하지 않음", async () => {
  await reset();
  const e = await mkSimple("화", "19:00");
  const r1 = await run("PILOT", [e.id]);
  check("1차 생성 4건", r1.status === "SUCCEEDED" && r1.createdSessions === 4);
  const first = await db.classSession.findFirstOrThrow({ where: { enrollmentId: e.id }, orderBy: { scheduledAt: "asc" } });
  await db.classSession.update({ where: { id: first.id }, data: { deletedAt: new Date("2026-10-05T00:00:00Z") } });
  const r2 = await run("FULL", [e.id]);
  check("재실행: ALREADY_GENERATED로 기록, 새 세션 0건", r2.items[0]?.outcome === "ALREADY_GENERATED" && r2.createdSessions === 0 && (await db.classSession.count({ where: { enrollmentId: e.id } })) === 4);
  let dupViolated = false;
  try {
    await db.classSession.create({ data: { siteId: 1, enrollmentId: e.id, studentId: first.studentId, teacherId: first.teacherId, scheduledAt: first.scheduledAt, durationMin: 25, generationKey: first.generationKey } });
  } catch (err) {
    dupViolated = (err as { code?: string }).code === "P2002";
  }
  check("같은 generationKey를 직접 넣으면 DB가 거부(P2002)", dupViolated);
});

test("PILOT: 예상 생성 수와 실제 생성 수가 정확히 일치해야 성공 + 배치/항목/감사 로그 기록", async () => {
  await reset();
  const e1 = await mkSimple("화", "19:00", 25);
  const e2 = await mkSimple("목", "20:00", 50);
  const e3 = await mkSimple("금", "17:30", 25);
  const bystander = await mkSimple("수", "18:00");
  const r = await run("PILOT", [e1.id, e2.id, e3.id]);
  check("성공 + 12건 생성", r.status === "SUCCEEDED" && r.createdSessions === 12 && r.expectedSessions === 12, JSON.stringify([r.status, r.createdSessions, r.failureReason]));
  const batch = await db.sessionGenerationBatch.findUniqueOrThrow({ where: { id: r.batchId }, include: { items: true } });
  check("배치: 상태/모드/카운터/지문/기준일/요청 목록", batch.status === "SUCCEEDED" && batch.mode === "PILOT" && batch.createdSessions === 12 && batch.plannedSessions === 12 && batch.plannedEnrollments === 3 && batch.asOfKstDate === "2026-10-05" && batch.planHash === r.planHash && eqArr(batch.requestedEnrollmentIds, [e1.id, e2.id, e3.id]) && batch.activeLock === null && batch.finishedAt !== null && batch.errorCount === 0);
  check("항목 3건 모두 GENERATED(예정=생성=4)", batch.items.length === 3 && batch.items.every((i) => i.outcome === "GENERATED" && i.plannedCount === 4 && i.createdCount === 4));
  check("허용 목록 밖 수강은 건드리지 않음(세션 0, 항목 없음)", (await db.classSession.count({ where: { enrollmentId: bystander.id } })) === 0 && !batch.items.some((i) => i.enrollmentId === bystander.id));
  const audit = await db.auditLog.findMany({ where: { targetType: "SessionGenerationBatch", targetId: r.batchId } });
  check("감사 로그 1행(SCHEDULE_CREATED, 요약 포함)", audit.length === 1 && audit[0].action === "SCHEDULE_CREATED" && (audit[0].description ?? "").includes("생성 12/12"));
  check("populationSummary가 저장됨", batch.populationSummary !== null && typeof batch.populationSummary === "object");
});

test("PILOT 불일치/오류: 예상 밖 중복(unique)은 조용히 성공하지 않고 해당 수강을 롤백 + ERROR 기록 + 배치 FAILED", async () => {
  await reset();
  const e = await mkSimple("화", "19:00");
  const stu = await mkStudent();
  const t = await mkTeacher();
  // 삭제된 세션이 같은 generationKey를 쥐고 있는 상태(계획기는 삭제된 세션을 '없는 것'으로 보므로 그 날짜를 계획한다)
  await db.classSession.create({ data: { siteId: 1, enrollmentId: e.id, studentId: stu.id, teacherId: t.id, scheduledAt: new Date("2026-10-13T10:00:00Z"), durationMin: 25, generationKey: `${e.id}:2026-10-13`, deletedAt: new Date("2026-10-01T00:00:00Z") } });
  const before = await db.classSession.count();
  const r = await run("PILOT", [e.id]);
  check("배치 FAILED, 생성 0건", r.status === "FAILED" && r.createdSessions === 0, JSON.stringify([r.status, r.createdSessions]));
  check("항목은 ERROR(DUPLICATE_KEY)로 기록되고 사유가 남음", r.items[0]?.outcome === "ERROR" && r.items[0].reasons.includes("DUPLICATE_KEY") && !!r.failureReason);
  check("트랜잭션 롤백: 그 수강의 세션은 하나도 추가되지 않음(부분 생성 없음)", (await db.classSession.count()) === before);
  const b = await db.sessionGenerationBatch.findUniqueOrThrow({ where: { id: r.batchId } });
  check("배치 errorCount=1, activeLock 해제", b.errorCount === 1 && b.activeLock === null && b.status === "FAILED");
});

test("게이트: 잘못된 지문/예상 수/오래된 asOf/다른 날짜/PILOT 6건/비대상 포함/이미 시작한 슬롯 — 전부 아무것도 쓰지 않고 거부", async () => {
  await reset();
  const e1 = await mkSimple("화", "19:00");
  const e2 = await mkSimple("목", "19:00");
  const multi = await mkSimple("월수", "19:00");
  const ids = [e1.id, e2.id];
  const p = await previewGeneration(db, { mode: "PILOT", enrollmentIds: ids, asOf: NOW });
  const base: ExecuteRequest = { mode: "PILOT", enrollmentIds: ids, asOf: NOW, expectedPlanHash: p.planHash, expectedSessions: p.expectedSessions, actorLabel: "itest", now: () => NOW };
  const before = await counts();
  check("지문 불일치 → PLAN_HASH_MISMATCH", (await gateCode(() => executeGeneration(db, { ...base, expectedPlanHash: "0".repeat(64) }))) === "PLAN_HASH_MISMATCH");
  check("예상 세션 수 불일치 → EXPECTED_SESSIONS_MISMATCH", (await gateCode(() => executeGeneration(db, { ...base, expectedSessions: p.expectedSessions + 1 }))) === "EXPECTED_SESSIONS_MISMATCH");
  check("asOf가 30분보다 오래됨 → ASOF_TOO_OLD", (await gateCode(() => executeGeneration(db, { ...base, asOf: new Date(NOW.getTime() - 2 * 3600_000) }))) === "ASOF_TOO_OLD");
  check("asOf가 미래 → ASOF_INVALID", (await gateCode(() => executeGeneration(db, { ...base, asOf: new Date(NOW.getTime() + 3600_000) }))) === "ASOF_INVALID");
  // 자정 직후에 실행했는데 asOf는 전날 밤(15분 전)인 경우 — 나이는 30분 이내지만 KST 날짜가 다르다.
  check(
    "asOf의 KST 날짜가 오늘과 다름 → ASOF_DATE_MISMATCH",
    (await gateCode(() => executeGeneration(db, { ...base, asOf: new Date("2026-10-04T23:55:00+09:00"), now: () => new Date("2026-10-05T00:10:00+09:00") }))) === "ASOF_DATE_MISMATCH",
  );
  check("PILOT 6건 → TOO_MANY_ENROLLMENTS", (await gateCode(() => executeGeneration(db, { ...base, enrollmentIds: [1, 2, 3, 4, 5, 6] }))) === "TOO_MANY_ENROLLMENTS");
  check("계획에 없는 수강 → ENROLLMENT_NOT_IN_PLAN", (await gateCode(() => executeGeneration(db, { ...base, enrollmentIds: [e1.id, 999999] }))) === "ENROLLMENT_NOT_IN_PLAN");
  const pm = await previewGeneration(db, { mode: "PILOT", enrollmentIds: [e1.id, multi.id], asOf: NOW });
  check("PILOT에 시각 미검증(다요일) 수강 포함 → PILOT_REQUIRES_ELIGIBLE", (await gateCode(() => executeGeneration(db, { ...base, enrollmentIds: [e1.id, multi.id], expectedPlanHash: pm.planHash, expectedSessions: pm.expectedSessions }))) === "PILOT_REQUIRES_ELIGIBLE");
  // 계획 이후 시각이 지나 슬롯이 '지금' 이전이 된 경우
  const early = await mkSimple("월", "09:55");
  const asOfEarly = new Date("2026-10-05T09:50:00+09:00");
  const pe = await previewGeneration(db, { mode: "PILOT", enrollmentIds: [early.id], asOf: asOfEarly });
  check("(전제) 09:55 슬롯이 asOf(09:50) 이후라 계획에는 포함", pe.scopeRows[0].plannedSessions.some((x) => x.date === "2026-10-05"));
  check("실행 시각(10:00)에는 이미 시작한 슬롯 → SLOT_NOT_AFTER_NOW", (await gateCode(() => executeGeneration(db, { ...base, enrollmentIds: [early.id], asOf: asOfEarly, expectedPlanHash: pe.planHash, expectedSessions: pe.expectedSessions }))) === "SLOT_NOT_AFTER_NOW");
  const after = await counts();
  check("모든 거부에서 DB에 아무것도 쓰지 않음(세션/배치/항목 불변)", after.sessions === before.sessions && after.batches === before.batches && after.items === before.items, JSON.stringify([before, after]));
});

test("FULL: 충돌/비활성 강사/시각 미검증/기타 제외를 조용히 건너뛰지 않고 항목으로 기록하고, 검증된 수강만 생성", async () => {
  await reset();
  const shared = await mkTeacher();
  const cA = await mkSimple("수", "19:00", 25, shared.id);
  const cB = await mkSimple("수", "19:00", 25, shared.id);
  const inactiveT = await mkTeacher({ accountStatus: "INACTIVE" });
  const inactive = await mkSimple("금", "19:00", 25, inactiveT.id);
  const multiNo = await mkSimple("월수", "20:00");
  const tm = await mkTeacher();
  const sm = await mkStudent();
  const multiOk = await mkEnrollment({ teacherId: tm.id, studentId: sm.id, days: "월수", time: "20:00", classTimes: { "1": "20:00", "3": "20:30" } });
  const ok = await mkSimple("목", "18:00");
  const holding = await mkSimple("화", "10:30");
  await db.enrollment.update({ where: { id: holding.id }, data: { status: "HOLDING" } });
  const ids = [cA.id, cB.id, inactive.id, multiNo.id, multiOk.id, ok.id, holding.id];
  const r = await run("FULL", ids);
  const byId = new Map(r.items.map((i) => [i.enrollmentId, i]));
  check("충돌 2건은 CONFLICT(보류)", byId.get(cA.id)?.outcome === "CONFLICT" && byId.get(cB.id)?.outcome === "CONFLICT");
  check("비활성 강사는 INACTIVE_TEACHER", byId.get(inactive.id)?.outcome === "INACTIVE_TEACHER");
  check("다요일 + classTimes 없음은 TIME_UNVERIFIED", byId.get(multiNo.id)?.outcome === "TIME_UNVERIFIED");
  check("다요일 + 모든 요일 classTimes는 생성(요일별 시각 적용)", byId.get(multiOk.id)?.outcome === "GENERATED" && (await db.classSession.findMany({ where: { enrollmentId: multiOk.id }, orderBy: { scheduledAt: "asc" } })).slice(0, 2).map((s) => s.scheduledAt.toISOString()).join() === "2026-10-05T11:00:00.000Z,2026-10-07T11:30:00.000Z");
  check("단일 요일 정상 수강은 GENERATED", byId.get(ok.id)?.outcome === "GENERATED");
  check("HOLDING 수강은 EXCLUDED로 기록", byId.get(holding.id)?.outcome === "EXCLUDED" && byId.get(holding.id)!.reasons.includes("STATUS_HOLDING"));
  const b = await db.sessionGenerationBatch.findUniqueOrThrow({ where: { id: r.batchId } });
  check("배치 카운터: 충돌 2 · 비활성 강사 1 · 시각 미검증 1 · 오류 0", b.conflictEnrollments === 2 && b.inactiveTeacherEnrollments === 1 && b.timeUnverifiedEnrollments === 1 && b.errorCount === 0);
  check("충돌/비활성/미검증/제외 수강의 세션은 하나도 없음", (await db.classSession.count({ where: { enrollmentId: { in: [cA.id, cB.id, inactive.id, multiNo.id, holding.id] } } })) === 0);
  check("상태 SUCCEEDED, 생성 수 = 예상 수", r.status === "SUCCEEDED" && r.createdSessions === r.expectedSessions && b.withheldByConflict > 0);
  const conflictItem = await db.sessionGenerationBatchItem.findFirstOrThrow({ where: { batchId: r.batchId, enrollmentId: cA.id } });
  check("충돌 항목에 상세(상대 수강/요일/시각)가 남음", Array.isArray(conflictItem.detail) && (conflictItem.detail as unknown[]).length > 0);
});

test("오늘 이미 시작한 슬롯과 휴강일은 만들지 않고 배치에 집계", async () => {
  await reset();
  const early = await mkSimple("월", "09:00"); // 오늘(10/5) 09:00은 NOW(10:00)보다 이전
  const late = await mkSimple("월", "11:00"); // 오늘 11:00은 대상
  await db.academyClosure.create({ data: { siteId: 1, date: new Date("2026-10-12T00:00:00+09:00"), reason: "test closure" } });
  const r = await run("FULL", [early.id, late.id]);
  const sEarly = (await db.classSession.findMany({ where: { enrollmentId: early.id }, orderBy: { scheduledAt: "asc" } })).map((s) => s.generationKey?.split(":")[1]);
  const sLate = (await db.classSession.findMany({ where: { enrollmentId: late.id }, orderBy: { scheduledAt: "asc" } })).map((s) => s.generationKey?.split(":")[1]);
  check("09:00 수강: 오늘 슬롯 제외, 휴강일(10/12) 제외 → 10/19, 10/26, 11/2", sEarly.join() === "2026-10-19,2026-10-26,2026-11-02", sEarly.join());
  check("11:00 수강: 오늘 11:00 슬롯은 포함, 휴강일(10/12) 제외", sLate.join() === "2026-10-05,2026-10-19,2026-10-26,2026-11-02", sLate.join());
  const b = await db.sessionGenerationBatch.findUniqueOrThrow({ where: { id: r.batchId } });
  check("배치: skippedStartedToday=1, skippedClosure=2", b.skippedStartedToday === 1 && b.skippedClosure === 2, JSON.stringify([b.skippedStartedToday, b.skippedClosure]));
});

test("계획 이후 수강이 바뀌면(STALE) 생성하지 않고 기록 — 락 안 재계획", async () => {
  await reset();
  const e1 = await mkSimple("화", "19:00");
  const e2 = await mkSimple("목", "19:00");
  const r = await run("FULL", [e1.id, e2.id], {
    hooks: {
      beforeEnrollmentTx: async (id) => {
        if (id === e1.id) await db.enrollment.update({ where: { id }, data: { classTime: "20:00" } }); // 미리보기 이후 시각이 바뀜
      },
    },
  });
  const byId = new Map(r.items.map((i) => [i.enrollmentId, i]));
  check("바뀐 수강은 STALE, 세션 0건", byId.get(e1.id)?.outcome === "STALE" && (await db.classSession.count({ where: { enrollmentId: e1.id } })) === 0);
  check("바뀌지 않은 수강은 정상 생성", byId.get(e2.id)?.outcome === "GENERATED" && (await db.classSession.count({ where: { enrollmentId: e2.id } })) === 4);
  check("배치는 PARTIAL(예상보다 적게 생성)이고 사유에 STALE 언급", r.status === "PARTIAL" && (r.failureReason ?? "").includes("STALE"), JSON.stringify([r.status, r.failureReason]));
});

test("동시 실행: 두 번째 배치는 activeLock(single-flight)으로 거부되고 중복 생성은 없음", async () => {
  await reset();
  const e1 = await mkSimple("화", "19:00");
  const e2 = await mkSimple("목", "19:00");
  const ids = [e1.id, e2.id];
  const p = await previewGeneration(db, { mode: "PILOT", enrollmentIds: ids, asOf: NOW });
  const req: ExecuteRequest = { mode: "PILOT", enrollmentIds: ids, asOf: NOW, expectedPlanHash: p.planHash, expectedSessions: p.expectedSessions, actorLabel: "itest", now: () => NOW };
  let releaseA!: () => void;
  const gate = new Promise<void>((r) => (releaseA = r));
  let aStarted!: () => void;
  const started = new Promise<void>((r) => (aStarted = r));
  const runA = executeGeneration(db, { ...req, hooks: { afterBatchCreated: async () => { aStarted(); await gate; } } });
  await started;
  const codeB = await gateCode(() => executeGeneration(dbB, req));
  check("두 번째 실행은 ANOTHER_BATCH_RUNNING", codeB === "ANOTHER_BATCH_RUNNING", codeB);
  check("첫 번째 배치가 RUNNING + 잠금 보유 중", (await db.sessionGenerationBatch.count({ where: { status: "RUNNING", activeLock: ACTIVE_LOCK_VALUE } })) === 1);
  releaseA();
  const resA = await runA;
  check("첫 번째는 정상 완료(8건)", resA.status === "SUCCEEDED" && resA.createdSessions === 8);
  check("세션이 정확히 8건(중복 없음) + 잠금 해제", (await db.classSession.count()) === 8 && (await db.sessionGenerationBatch.count({ where: { activeLock: { not: null } } })) === 0);
  const after = await run("FULL", ids, {}, NOW);
  check("끝난 뒤 다시 실행하면 ALREADY_GENERATED(새 세션 0)", after.items.every((i) => i.outcome === "ALREADY_GENERATED") && (await db.classSession.count()) === 8);
});

test("DB 레벨 최후 방어선: 락을 거치지 않은 동시 INSERT도 generationKey unique가 하나만 통과시킴", async () => {
  await reset();
  const e = await mkSimple("화", "19:00");
  const enr = await db.enrollment.findUniqueOrThrow({ where: { id: e.id } });
  const mk = (n: number) => ({ siteId: 1, enrollmentId: enr.id, studentId: enr.studentId, teacherId: enr.teacherId!, scheduledAt: new Date("2026-10-06T10:00:00Z"), durationMin: 25, generationKey: `${enr.id}:2026-10-06`, progressNote: `w${n}` });
  const t1 = db.$transaction(async (tx) => {
    await tx.classSession.create({ data: mk(1) });
    await sleep(900); // 커밋 전에 두 번째가 같은 키를 시도하게 둔다
  });
  const t2 = (async () => {
    await sleep(250);
    return dbB.$transaction(async (tx) => {
      await tx.classSession.create({ data: mk(2) });
    });
  })();
  const [r1, r2] = await Promise.allSettled([t1, t2]);
  check("하나는 성공, 하나는 unique 위반(P2002)으로 실패", r1.status === "fulfilled" && r2.status === "rejected" && (r2.reason as { code?: string }).code === "P2002", JSON.stringify([r1.status, r2.status]));
  check("행은 정확히 1개", (await db.classSession.count({ where: { generationKey: `${enr.id}:2026-10-06` } })) === 1);
});

test("롤백: 미리보기는 지우지 않고, 수정/홀드/삭제된 세션은 남기며, 나머지만 삭제 + 배치 상태/감사 로그", async () => {
  await reset();
  const e1 = await mkSimple("화", "19:00");
  const e2 = await mkSimple("목", "19:00");
  const r = await run("PILOT", [e1.id, e2.id]);
  const dry = await rollbackGeneration(db, { batchId: r.batchId, apply: false, actorLabel: "itest", now: NOW });
  check("미리보기: 8건 전부 삭제 가능, 아무것도 지우지 않음", dry.total === 8 && dry.deletable === 8 && dry.deleted === 0 && (await db.classSession.count()) === 8);
  const sessions = await db.classSession.findMany({ where: { generationBatchId: r.batchId }, orderBy: { id: "asc" } });
  await sleep(30);
  await db.classSession.update({ where: { id: sessions[0].id }, data: { durationMin: 50 } }); // 배치 이후 수정됨
  await db.classSession.update({ where: { id: sessions[1].id }, data: { status: "HOLD" } });
  await db.classSession.update({ where: { id: sessions[2].id }, data: { deletedAt: new Date("2026-10-05T00:00:00Z") } });
  const dry2 = await rollbackGeneration(db, { batchId: r.batchId, apply: false, actorLabel: "itest", now: NOW });
  const why = (id: number) => dry2.candidates.find((c) => c.sessionId === id)?.reasons ?? [];
  // 상태 변경/삭제도 updatedAt을 바꾸므로 MODIFIED_AFTER_BATCH가 함께 보고된다 — 각 사유가 들어 있는지 본다.
  check(
    "수정/홀드/삭제된 세션은 삭제 불가 사유와 함께 보고",
    dry2.deletable === 5 && why(sessions[0].id).includes("MODIFIED_AFTER_BATCH") && why(sessions[1].id).includes("STATUS_HOLD") && why(sessions[2].id).includes("SOFT_DELETED"),
    JSON.stringify(dry2.candidates.filter((c) => !c.deletable).map((c) => c.reasons)),
  );
  const applied = await rollbackGeneration(db, { batchId: r.batchId, apply: true, actorLabel: "itest", actorAdminId: null, now: NOW });
  check("적용: 5건 삭제, 3건 남김", applied.deleted === 5 && applied.kept === 3 && (await db.classSession.count()) === 3);
  const b = await db.sessionGenerationBatch.findUniqueOrThrow({ where: { id: r.batchId } });
  check("배치 상태 PARTIAL + rolledBackAt + 남은 세션 안내", b.status === "PARTIAL" && b.rolledBackAt !== null && (b.failureReason ?? "").includes("3건"));
  check("롤백 감사 로그 기록", (await db.auditLog.count({ where: { action: "SCHEDULE_CANCELLED", targetId: r.batchId } })) === 1);
  // 깨끗한 배치는 전부 롤백 → ROLLED_BACK
  const e3 = await mkSimple("금", "17:00");
  const r3 = await run("PILOT", [e3.id]);
  const full = await rollbackGeneration(db, { batchId: r3.batchId, apply: true, actorLabel: "itest", now: NOW });
  const b3 = await db.sessionGenerationBatch.findUniqueOrThrow({ where: { id: r3.batchId } });
  check("수정 없는 배치는 전부 삭제되고 ROLLED_BACK", full.deleted === 4 && b3.status === "ROLLED_BACK" && (await db.classSession.count({ where: { enrollmentId: e3.id } })) === 0);
  check("롤백 후에는 같은 수강을 다시 생성할 수 있음(키 해제)", (await run("PILOT", [e3.id])).status === "SUCCEEDED");
  check("지난 수업(과거 시각)은 롤백하지 않음", (await rollbackGeneration(db, { batchId: r3.batchId, apply: false, actorLabel: "itest", now: new Date("2027-01-01T00:00:00Z") })).deletable === 0);
});

test("비정상 종료 복구: RUNNING 배치가 있으면 새 실행 거부, 10분 지난 뒤 잠금 해제하면 실행 가능", async () => {
  await reset();
  const e = await mkSimple("화", "19:00");
  const stale = await db.sessionGenerationBatch.create({
    data: { mode: "FULL", status: "RUNNING", activeLock: ACTIVE_LOCK_VALUE, asOf: NOW, asOfKstDate: "2026-10-05", plannerVersion: "x", planHash: "h", expectedSessions: 0, actorLabel: "crashed", startedAt: new Date(NOW.getTime() - 60 * 60_000) },
  });
  check("RUNNING 잠금이 남아 있으면 새 실행 거부", (await gateCode(() => run("PILOT", [e.id]))) === "ANOTHER_BATCH_RUNNING");
  const tooSoon = await releaseStaleBatchLock(db, { batchId: stale.id, now: new Date(stale.startedAt.getTime() + 60_000) });
  check("시작 후 10분이 안 지났으면 해제하지 않음", tooSoon.released === false);
  const rel = await releaseStaleBatchLock(db, { batchId: stale.id, now: NOW });
  check("10분 지난 RUNNING은 해제(FAILED)", rel.released === true && (await db.sessionGenerationBatch.findUniqueOrThrow({ where: { id: stale.id } })).activeLock === null);
  check("해제 후에는 정상 실행", (await run("PILOT", [e.id])).status === "SUCCEEDED");
});

test("수강 삭제 가드: 소프트 삭제된 세션 포함 세션이 있으면 개수를 알려주고, FK(RESTRICT)로도 막혀 있음", async () => {
  await reset();
  const e = await mkSimple("화", "19:00");
  check("세션이 없으면 0 → 삭제 가능", (await countSessionsBlockingDeletion(db, e.id)) === 0);
  const r = await run("PILOT", [e.id]);
  check("생성 후 4건", r.status === "SUCCEEDED" && (await countSessionsBlockingDeletion(db, e.id)) === 4);
  await db.classSession.updateMany({ where: { enrollmentId: e.id }, data: { deletedAt: new Date("2026-10-05T00:00:00Z") } });
  check("전부 소프트 삭제돼도 행이 남아 있으므로 계속 차단(FK 때문에 어차피 삭제 불가)", (await countSessionsBlockingDeletion(db, e.id)) === 4);
  let fkBlocked = false;
  try {
    await db.enrollment.delete({ where: { id: e.id } });
  } catch {
    fkBlocked = true;
  }
  check("가드 없이 삭제를 시도하면 FK가 막음(안내 메시지가 필요한 이유)", fkBlocked);
});

// ---------------------------------------------------------------------------------------------------------------------
function eqArr(a: number[], b: number[]): boolean {
  return JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));
}

async function main() {
  let code = 0;
  try {
    for (const [name, fn] of tests) {
      const before = failed;
      try {
        await fn();
      } catch (e) {
        failed++;
        console.log(`FAIL: [${name}] 예외 — ${(e as Error).stack?.split("\n").slice(0, 4).join(" | ") ?? String(e)}`);
      }
      console.log(`${failed === before ? "ok  " : "FAIL"} ${name}`);
    }
  } finally {
    if (isIsolatedSchema) {
      try {
        await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${parsed.schema}" CASCADE`);
      } catch {
        // 정리 실패는 테스트 결과에 영향을 주지 않는다
      }
    }
    await db.$disconnect();
    await dbB.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    code = failed === 0 ? 0 : 1;
  }
  process.exit(code);
}

main();
