// 연기 / 정규 수업 cascade / 학원 휴강 / 보충수업 / 유급휴가 / 평가 초기화 / 학생 연기 횟수 통합 테스트 — 실제 PostgreSQL에서 검증한다
// (unique 제약, advisory lock, 트랜잭션, 동시성). 마이그레이션이 적용된(또는 `prisma db push`한) "버려도 되는" 테스트 DB가 필요하다.
//   · CI: 서비스 컨테이너 postgres의 hifive_test DB(localhost)
//   · 로컬: 격리 스키마 `?schema=gentest_<이름>`을 붙인 URL(테스트가 끝나면 그 스키마만 DROP)
// 안전장치: localhost의 이름에 "test"가 든 DB이거나 schema가 gentest_로 시작할 때만 실행한다(운영 DB 거부). 시작할 때 이 DB의 데이터를 TRUNCATE한다.
// TEST_DATABASE_URL이 없으면 건너뛴다(CI는 REQUIRE_INTEGRATION=1로 필수 실행).
// 실행(admin 디렉터리): TEST_DATABASE_URL=... npx tsx scripts/test-postponementFlow.integration.ts
import { createGenerationClient, parseDbUrl } from "./lib/generationClient";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Tx } from "../src/lib/advisoryLock";
import { formatAppDate } from "../src/lib/appTime";
import { countLessons } from "../src/lib/lessonCounts";
import { registerAcademyClosure, revertAcademyClosure, ClosureError } from "../src/lib/academyClosureFlow";
import { adjustLeaveQuota, getLeaveQuotaSummary, RescheduleError, rescheduleSession, resetSessionEvaluation, revertReschedule, type RescheduleParams } from "../src/lib/reschedule";
import { createSupplementSession } from "../src/lib/supplement";
import { HoldReleaseError, releaseHoldInTx } from "../src/lib/holdApply";
import { approvePaidLeave, requestPaidLeave, revokePaidLeave, PaidLeaveSessionError } from "../src/lib/teacherPaidLeave";

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
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const kst = (iso: string, time = "20:00") => new Date(`${iso}T${time}:00+09:00`);

// 가상의 "지금": 2026-10-05(월) 10:00 KST
const NOW = new Date("2026-10-05T10:00:00+09:00");
const ADMIN = { role: "ADMIN" as const, id: 1, name: "admin" };

const SCHEMA = parsed.schema ?? "public";
const T = (name: string) => `"${SCHEMA}"."${name}"`;
const db = createGenerationClient(raw, { max: 8 });
const dbB = createGenerationClient(raw, { max: 8 });

const run = <R>(client: PrismaClient, fn: (tx: Tx) => Promise<R>): Promise<R> => client.$transaction((tx) => fn(tx), { timeout: 60_000, maxWait: 30_000 });
const codeOf = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
    return "NO_ERROR";
  } catch (e) {
    if (e instanceof RescheduleError) return e.code;
    if (e instanceof ClosureError || e instanceof PaidLeaveSessionError) return "FLOW:" + e.message.slice(0, 40);
    return `OTHER:${(e as Error).message.slice(0, 120)}`;
  }
};

async function reset() {
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${T("sites")}, ${T("audit_logs")}, ${T("session_generation_batches")} RESTART IDENTITY CASCADE`);
  await db.site.create({ data: { code: "main", name: "test-site" } });
}

let seq = 0;
async function mkAgent() {
  seq++;
  return db.agent.create({ data: { siteId: 1, name: `agent${seq}`, code: `ag${seq}` } });
}
async function mkTeacher(over: { regular?: boolean } = {}) {
  seq++;
  return db.teacher.create({
    data: { siteId: 1, realName: `T${seq}`, loginId: `t${seq}`, passwordHash: "x", approvalStatus: "APPROVED", accountStatus: "ACTIVE", availableHours: [], employmentType: over.regular ? "REGULAR" : "NON_REGULAR" },
  });
}
async function mkStudent(agentId?: number) {
  seq++;
  return db.student.create({ data: { siteId: 1, name: `S${seq}`, loginId: `s${seq}`, passwordHash: "x", agentId: agentId ?? null } });
}
interface EnrOpts {
  teacherId: number;
  studentId: number;
  days: string;
  time?: string;
  months?: number;
  total?: number;
  start?: string;
  end: string;
  dur?: number;
  classTimes?: Record<string, string>;
}
async function mkEnrollment(o: EnrOpts) {
  return db.enrollment.create({
    data: {
      siteId: 1,
      studentId: o.studentId,
      teacherId: o.teacherId,
      packageMonths: o.months ?? 1,
      classMethod: "zoom",
      scheduleDays: o.days,
      classTime: o.time ?? "20:00",
      classTimes: o.classTimes,
      classDurationMin: o.dur ?? 25,
      totalSessions: o.total ?? 8,
      startDate: d(o.start ?? "2026-10-05"),
      endDate: d(o.end),
      status: "ACTIVE",
    },
  });
}
/** 수강에 정규 수업 시퀀스를 깐다(생성기와 같은 generationKey). */
async function mkSeq(e: { id: number; studentId: number; teacherId: number | null }, dates: string[], time = "20:00", status: "SCHEDULED" | "COMPLETED" = "SCHEDULED") {
  const out = [];
  for (const iso of dates) {
    out.push(
      await db.classSession.create({
        data: { siteId: 1, enrollmentId: e.id, studentId: e.studentId, teacherId: e.teacherId!, scheduledAt: kst(iso, time), durationMin: 25, status, isSupplement: false, generationKey: `${e.id}:${iso}` },
      }),
    );
  }
  return out;
}
/** 정규(비보충) 수업 중 실제 수업으로 남은 것(LEAVE/CANCELLED 제외)의 KST 날짜, 오름차순. */
async function activeRegular(enrollmentId: number): Promise<string[]> {
  const rows = await db.classSession.findMany({ where: { enrollmentId, isSupplement: false, deletedAt: null, status: { notIn: ["LEAVE", "CANCELLED"] } }, select: { scheduledAt: true } });
  return rows.map((r) => formatAppDate(r.scheduledAt)).sort();
}
const endIso = async (enrollmentId: number) => (await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).endDate.toISOString().slice(0, 10);
const usage = async (enrollmentId: number) => (await run(db, (tx) => getLeaveQuotaSummary(tx, enrollmentId)))!.usedCount;

const student = (id: number) => ({ role: "STUDENT" as const, id });
const postpone = (client: PrismaClient, p: Omit<RescheduleParams, "now"> & { now?: Date }) => run(client, (tx) => rescheduleSession(tx, { now: NOW, ...p }));
const studentSelf = (client: PrismaClient, sessionId: number, studentId: number, now: Date = NOW) =>
  run(client, (tx) => rescheduleSession(tx, { sessionId, source: "STUDENT_POSTPONEMENT", actor: student(studentId), now, studentSelfService: true }));
const adminAsStudent = (client: PrismaClient, sessionId: number) => run(client, (tx) => rescheduleSession(tx, { sessionId, source: "STUDENT_POSTPONEMENT", actor: ADMIN, now: NOW }));
const adminPostpone = (client: PrismaClient, sessionId: number) =>
  run(client, (tx) => rescheduleSession(tx, { sessionId, source: "ADMIN_POSTPONEMENT", actor: ADMIN, now: NOW, allowedStatuses: ["SCHEDULED", "COMPLETED", "MAKEUP_NEEDED"] }));

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

const MWF_DATES = ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16"];

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("스키마: 새 컬럼/제약이 존재하고 TeacherPaidLeave (강사, 날짜)는 unique", async () => {
  await reset();
  const t = await mkTeacher({ regular: true });
  await db.teacherPaidLeave.create({ data: { siteId: 1, teacherId: t.id, leaveDate: d("2026-11-02") } });
  let dup = false;
  try {
    await db.teacherPaidLeave.create({ data: { siteId: 1, teacherId: t.id, leaveDate: d("2026-11-02") } });
  } catch {
    dup = true;
  }
  check("같은 강사·같은 날 유급휴가는 DB unique로 중복 생성 불가", dup);
  const t2 = await mkTeacher();
  check("강사 기본값은 NON_REGULAR", t2.employmentType === "NON_REGULAR");
  const idx = await db.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE schemaname = '${SCHEMA}' AND indexname IN ('teacher_paid_leaves_teacherId_leaveDate_key','leave_requests_replacementSessionId_key')`);
  check("unique 인덱스 2개 존재", idx.length === 2, JSON.stringify(idx));
});

// ── 학생 연기 횟수 ────────────────────────────────────────────────────────────────────────────────────────────────────
test("학생 직접 연기 횟수: 주2×3개월=3회 — 첫 달에 3회를 모두 쓸 수 있고 4번째는 거부", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "화목", months: 3, total: 24, end: "2026-12-24" });
  const dates = ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15", "2026-10-20", "2026-10-22", "2026-10-27", "2026-10-29"];
  const ses = await mkSeq(e, dates);
  const q0 = await run(db, (tx) => getLeaveQuotaSummary(tx, e.id));
  check("policy 3, effective 3, 사용 0", q0?.policyQuota === 3 && q0.effectiveQuota === 3 && q0.usedCount === 0 && q0.remainingCount === 3);
  for (let i = 0; i < 3; i++) await studentSelf(db, ses[i].id, s.id);
  check("3회까지 성공, 사용 3 / 남은 0", (await usage(e.id)) === 3);
  check("4번째는 STUDENT_QUOTA_EXCEEDED", (await codeOf(() => studentSelf(db, ses[3].id, s.id))) === "STUDENT_QUOTA_EXCEEDED");
  check("거부된 시도는 수업/종료일/연기 기록을 바꾸지 않음", (await db.classSession.findUniqueOrThrow({ where: { id: ses[3].id } })).status === "SCHEDULED" && (await db.leaveRequest.count()) === 3);
  check("관리자연기(ADMIN_POSTPONEMENT)는 학생 횟수와 무관하게 가능", (await codeOf(() => adminPostpone(db, ses[3].id))) === "NO_ERROR" && (await usage(e.id)) === 3);
  check("totalSessions 불변, 보충수업 생성 없음", (await db.enrollment.findUniqueOrThrow({ where: { id: e.id } })).totalSessions === 24 && (await db.classSession.count({ where: { isSupplement: true } })) === 0);
});
test("횟수: 주3×3개월=6, 주5×3개월=9, 주1·4·6·7회는 0", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const cases: [string, number][] = [["월수금", 6], ["월화수목금", 9], ["월", 0], ["월화수목", 0], ["월화수목금토", 0], ["월화수목금토일", 0], ["월목", 3]];
  for (const [days, expected] of cases) {
    const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days, months: 3, end: "2026-12-24" });
    const q = await run(db, (tx) => getLeaveQuotaSummary(tx, e.id));
    check(`${days} × 3개월 = ${expected}회`, q?.effectiveQuota === expected, String(q?.effectiveQuota));
  }
  // 주1회: quota 0 → 학생 연기 거부, 관리자 가감 +1 후 허용
  const e1 = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월", months: 1, end: "2026-11-02" });
  const [s1] = await mkSeq(e1, ["2026-10-12"]);
  check("주1회 학생 연기는 0회라 거부", (await codeOf(() => studentSelf(db, s1.id, s.id))) === "STUDENT_QUOTA_EXCEEDED");
});
test("관리자 횟수 가감: +/- 반영, 사용량보다 낮게는 차단, 감사 기록", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "화목", months: 3, end: "2026-12-24" });
  const ses = await mkSeq(e, ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15", "2026-10-20"]);
  for (let i = 0; i < 3; i++) await studentSelf(db, ses[i].id, s.id);
  check("quota 소진 후 4번째 거부", (await codeOf(() => studentSelf(db, ses[3].id, s.id))) === "STUDENT_QUOTA_EXCEEDED");
  const plus = await run(db, (tx) => adjustLeaveQuota(tx, { enrollmentId: e.id, newAdjustment: 2, reason: "특별 사유", actor: ADMIN }));
  check("+2 → effective 5, 남은 2", plus.ok && plus.summary.effectiveQuota === 5 && plus.summary.remainingCount === 2);
  check("가감 후에는 학생 연기 성공", (await codeOf(() => studentSelf(db, ses[3].id, s.id))) === "NO_ERROR" && (await usage(e.id)) === 4);
  const tooLow = await run(db, (tx) => adjustLeaveQuota(tx, { enrollmentId: e.id, newAdjustment: 0, reason: "줄이기", actor: ADMIN }));
  check("이미 4회 사용했는데 effective 3으로 줄이는 건 차단", !tooLow.ok && /낮출 수 없/.test(tooLow.error));
  const neg = await run(db, (tx) => adjustLeaveQuota(tx, { enrollmentId: e.id, newAdjustment: -10, reason: "음수", actor: ADMIN }));
  check("effective가 음수가 되는 가감은 차단", !neg.ok);
  const noReason = await run(db, (tx) => adjustLeaveQuota(tx, { enrollmentId: e.id, newAdjustment: 1, reason: "  ", actor: ADMIN }));
  check("사유 없는 수정은 거부", !noReason.ok);
  const minus = await run(db, (tx) => adjustLeaveQuota(tx, { enrollmentId: e.id, newAdjustment: 1, reason: "감소", actor: ADMIN }));
  check("effective 4(=사용량)로는 낮출 수 있음", minus.ok && minus.summary.effectiveQuota === 4 && minus.summary.remainingCount === 0);
  const audits = await db.auditLog.findMany({ where: { targetType: "Enrollment", targetId: String(e.id) }, orderBy: { id: "asc" } });
  check("가감 감사 로그 2건(성공한 것만), 이전/이후 값·사유·행위자 포함", audits.length === 2 && /previousAdjustment":0/.test(audits[0].description ?? "") && /newAdjustment":2/.test(audits[0].description ?? "") && /특별 사유/.test(audits[0].description ?? "") && audits[0].actorRole === "ADMIN" && audits[0].actorId === 1, String(audits.length));
});

// ── 2시간 제한 / 관리자가 대신 누르는 학생 연기 ─────────────────────────────────────────────────────────────────────
test("학생 직접 연기 2시간 제한: 2시간 10분/정확히 2시간 허용, 1시간 59분·직전·시작·지난 수업 거부", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월목", months: 6, end: "2026-11-30", time: "12:10" });
  // NOW = 10/5 10:00 KST
  const mk = async (time: string, iso = "2026-10-05") => (await db.classSession.create({ data: { siteId: 1, enrollmentId: e.id, studentId: s.id, teacherId: t.id, scheduledAt: kst(iso, time), durationMin: 25, status: "SCHEDULED", generationKey: `${e.id}:${iso}:${time}` } })).id;
  const a = await mk("12:10");
  const b = await mk("12:00", "2026-10-12");
  const lateId = await mk("11:59");
  const justBefore = await mk("10:01");
  const started = await mk("10:00");
  const past = await mk("09:00");
  check("2시간 10분 전 → 성공", (await codeOf(() => studentSelf(db, a, s.id))) === "NO_ERROR");
  // 정확히 2시간 전: now를 수업 2시간 전으로
  check("정확히 2시간 전 → 성공", (await codeOf(() => studentSelf(db, b, s.id, kst("2026-10-12", "10:00")))) === "NO_ERROR");
  check("1시간 59분 전 → TOO_LATE", (await codeOf(() => studentSelf(db, lateId, s.id))) === "TOO_LATE");
  check("수업 직전(1분 전) → TOO_LATE", (await codeOf(() => studentSelf(db, justBefore, s.id))) === "TOO_LATE");
  check("정확히 시작 시각 → ALREADY_STARTED", (await codeOf(() => studentSelf(db, started, s.id))) === "ALREADY_STARTED");
  check("지난 수업 → ALREADY_STARTED", (await codeOf(() => studentSelf(db, past, s.id))) === "ALREADY_STARTED");
  check("거부된 수업은 SCHEDULED 그대로, 횟수 차감 없음(2건 성공만 사용)", (await usage(e.id)) === 2 && (await db.classSession.count({ where: { enrollmentId: e.id, status: "SCHEDULED", id: { in: [lateId, justBefore, started, past] } } })) === 4);
  check("남의 수업은 연기 불가", (await codeOf(() => studentSelf(db, lateId, 99999))) !== "NO_ERROR");
});
test("관리자가 학생 대신 '학생 연기': 1시간 전/시작 직전/지난 수업도 시간 제한 없이 성공, 학생 횟수 차감, source=STUDENT_POSTPONEMENT, 실행자=ADMIN", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  // 주2회 × 3개월 = 3회
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월목", months: 3, end: "2026-12-31" });
  const mk = async (time: string, key: string) => (await db.classSession.create({ data: { siteId: 1, enrollmentId: e.id, studentId: s.id, teacherId: t.id, scheduledAt: kst("2026-10-05", time), durationMin: 25, status: "SCHEDULED", generationKey: `${e.id}:${key}` } })).id;
  const oneHour = await mk("11:00", "a");
  const justBefore = await mk("10:01", "b");
  const past = await mk("08:00", "c");
  const extra = await mk("23:00", "d");
  check("1시간 전 → 성공", (await codeOf(() => adminAsStudent(db, oneHour))) === "NO_ERROR");
  check("수업 시작 직전 → 시간 제한 때문에 거부되지 않음", (await codeOf(() => adminAsStudent(db, justBefore))) === "NO_ERROR");
  check("이미 지난 수업도 정책상 대상(SCHEDULED)이면 성공", (await codeOf(() => adminAsStudent(db, past))) === "NO_ERROR");
  const lrs = await db.leaveRequest.findMany({ orderBy: { id: "asc" } });
  check(
    "source=STUDENT_POSTPONEMENT, finalSource 동일, executedByRole=ADMIN, requestedByRole=STUDENT(옛 화면 분류와 호환), quotaImpact=1, 승인자=관리자",
    lrs.length === 3 && lrs.every((l) => l.source === "STUDENT_POSTPONEMENT" && l.finalSource === "STUDENT_POSTPONEMENT" && l.executedByRole === "ADMIN" && l.executedById === 1 && l.requestedByRole === "STUDENT" && l.quotaImpact === 1 && l.approvedById === 1),
  );
  check("학생 횟수 3회 차감(남은 0)", (await usage(e.id)) === 3);
  check("횟수 부족이면 관리자가 대신 눌러도 거부(STUDENT_QUOTA_EXCEEDED)", (await codeOf(() => adminAsStudent(db, extra))) === "STUDENT_QUOTA_EXCEEDED");
  check("그래도 관리자연기는 가능(횟수 차감 없음)", (await codeOf(() => adminPostpone(db, extra))) === "NO_ERROR" && (await usage(e.id)) === 3);
});
test("관리자가 대신 누르는 학생 연기: 횟수 부족 → 거부, 관리자 가감(+1) 후 → 성공", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "화목", months: 1, end: "2026-11-05" });
  const ses = await mkSeq(e, ["2026-10-06", "2026-10-08", "2026-10-13"]);
  check("주2×1개월=1회: 첫 번째 성공", (await codeOf(() => adminAsStudent(db, ses[0].id))) === "NO_ERROR");
  check("두 번째는 횟수 부족으로 거부", (await codeOf(() => adminAsStudent(db, ses[1].id))) === "STUDENT_QUOTA_EXCEEDED");
  await run(db, (tx) => adjustLeaveQuota(tx, { enrollmentId: e.id, newAdjustment: 1, reason: "특별 승인", actor: ADMIN }));
  check("가감 +1 후 성공", (await codeOf(() => adminAsStudent(db, ses[1].id))) === "NO_ERROR" && (await usage(e.id)) === 2);
});

// ── cascade ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test("cascade: 월/수/금 — 수요일 연기 → 월 금 월 수 금 월, 정규 6개 유지, 종료일은 실제 마지막 수업 날짜", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const ses = await mkSeq(e, MWF_DATES);
  const r = await studentSelf(db, ses[1].id, s.id);
  check("연기 후 정규 시퀀스: 월 금 월 수 금 월", eq(await activeRegular(e.id), ["2026-10-05", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19"]), JSON.stringify(await activeRegular(e.id)));
  check("정규 수업 수 6개 그대로", (await activeRegular(e.id)).length === 6);
  check("종료일은 +1일(10/17)이 아니라 실제 마지막 정규 수업 날짜(10/19)", (await endIso(e.id)) === "2026-10-19" && r.endDateExtendedTo?.toISOString().slice(0, 10) === "2026-10-19");
  const enr = await db.enrollment.findUniqueOrThrow({ where: { id: e.id } });
  check("totalSessions 불변, 보충수업 생성 없음", enr.totalSessions === 6 && (await db.classSession.count({ where: { isSupplement: true } })) === 0);
  const rep = await db.classSession.findUniqueOrThrow({ where: { id: r.replacementSessionId! } });
  check("대체 정규 수업: isSupplement=false, SCHEDULED, 연기된 수업과 relatedSessionId로 연결, generationKey=<수강>:<날짜>, 같은 강사·시각", !rep.isSupplement && rep.status === "SCHEDULED" && rep.relatedSessionId === ses[1].id && rep.generationKey === `${e.id}:2026-10-19` && rep.teacherId === t.id && rep.scheduledAt.getTime() === kst("2026-10-19").getTime());
  const orig = await db.classSession.findUniqueOrThrow({ where: { id: ses[1].id } });
  check("원래 수업은 LEAVE로 남고 generationKey 묘비 유지(생성기가 되살리지 않음)", orig.status === "LEAVE" && orig.generationKey === `${e.id}:2026-10-07`);
  const lr = await db.leaveRequest.findUniqueOrThrow({ where: { classSessionId: ses[1].id } });
  check("LeaveRequest: 대체 수업/이전 종료일/횟수 영향 기록", lr.replacementSessionId === rep.id && lr.previousEndDate?.toISOString().slice(0, 10) === "2026-10-16" && lr.quotaImpact === 1 && lr.extendedDays === 3);
});
test("cascade: 금요일이 휴강이면 다음 월요일로 건너뜀 / 빈 슬롯(gap)이 있으면 종료일 연장 없이 채움", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 2, end: "2026-10-07" });
  const ses = await mkSeq(e, ["2026-10-05", "2026-10-07"]);
  await db.academyClosure.create({ data: { siteId: 1, date: kst("2026-10-09", "00:00"), reason: "휴강" } });
  const r = await studentSelf(db, ses[1].id, s.id);
  check("수업 월·수 → 수요일 연기, 금요일(10/9) 휴강이라 다음 월요일(10/12)", eq(await activeRegular(e.id), ["2026-10-05", "2026-10-12"]) && r.replacementAt?.getTime() === kst("2026-10-12").getTime());
  check("종료일은 10/7 → 10/12", (await endIso(e.id)) === "2026-10-12");

  // gap: 수강 종료일(10/16) 이내에 비어 있는 슬롯(10/9)이 있으면 그 슬롯을 채우고 종료일은 늘지 않는다.
  // (앞부분에서 등록한 10/9 휴강은 본사 전체 휴강이라 이 수강에도 적용되므로 먼저 지운다.)
  await db.academyClosure.deleteMany();
  const e2 = await mkEnrollment({ teacherId: (await mkTeacher()).id, studentId: (await mkStudent()).id, days: "월수금", months: 1, total: 5, end: "2026-10-16" });
  const ses2 = await mkSeq(e2, ["2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14", "2026-10-16"]); // 10/9 비어 있음
  const r2 = await adminPostpone(db, ses2[1].id);
  check("gap(10/9)이 있으면 그 슬롯에 배치 — 종료일 연장 없음", r2.replacementAt?.getTime() === kst("2026-10-09").getTime() && r2.endDateExtendedTo === null && (await endIso(e2.id)) === "2026-10-16");
});
test("cascade: 강사/학생 시간 충돌이 있는 슬롯은 건너뜀, 요일별 시각(classTimes)을 따름", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수", months: 1, total: 2, end: "2026-10-07", classTimes: { "1": "20:00", "3": "21:30" } });
  const ses = await mkSeq(e, ["2026-10-05", "2026-10-07"]);
  // 같은 강사의 다른 학생이 10/12 20:00에 수업이 있다 → 월요일 슬롯 건너뛰고 10/14(수) 21:30
  const other = await mkStudent();
  const e2 = await mkEnrollment({ teacherId: t.id, studentId: other.id, days: "월", months: 1, total: 1, end: "2026-10-12" });
  await mkSeq(e2, ["2026-10-12"]);
  const r = await adminPostpone(db, ses[0].id);
  check("강사 충돌(10/12 20:00)을 건너뛰고 수요일 10/14 21:30(classTimes)", r.replacementAt?.getTime() === kst("2026-10-14", "21:30").getTime(), String(r.replacementAt?.toISOString()));
});
test("cascade 안전: 수업이 있어야 이동 가능한 상태만 / 이미 연기된 수업 재연기 거부 / HOLD·CANCELLED 거부", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 30, end: "2026-12-30" });
  const ses = await mkSeq(e, MWF_DATES);
  await db.classSession.update({ where: { id: ses[3].id }, data: { status: "CANCELLED" } });
  await db.classSession.update({ where: { id: ses[4].id }, data: { status: "HOLD" } });
  check("CANCELLED 수업은 연기 불가", (await codeOf(() => adminPostpone(db, ses[3].id))) === "NOT_RESCHEDULABLE_STATUS");
  check("HOLD 수업은 연기 불가", (await codeOf(() => adminPostpone(db, ses[4].id))) === "NOT_RESCHEDULABLE_STATUS");
  await adminPostpone(db, ses[0].id);
  check("이미 LEAVE인 수업은 연기 불가(ALREADY_RESCHEDULED)", (await codeOf(() => adminPostpone(db, ses[0].id))) === "ALREADY_RESCHEDULED");
  check("관리자연기는 학생 연기 횟수를 차감하지 않음", (await usage(e.id)) === 0);
  check("학생 직접 연기는 SCHEDULED만(완료된 수업 거부)", (await codeOf(async () => {
    const done = await mkSeq(e, ["2026-10-02"], "20:00", "COMPLETED");
    return studentSelf(db, done[0].id, s.id);
  })) !== "NO_ERROR");
});

// ── 관리자 연기 + 평가 ───────────────────────────────────────────────────────────────────────────────────────────────
test("관리자연기: 과거/오늘/미래 + 평가서 없음 → 가능 (SCHEDULED·COMPLETED), 학생 횟수 변화 없음, 평가서 있으면 초기화 없이는 거부", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 30, end: "2026-12-30", start: "2026-09-01" });
  const past = (await mkSeq(e, ["2026-09-14"], "20:00", "COMPLETED"))[0];
  const pastScheduled = (await mkSeq(e, ["2026-09-16"]))[0];
  const today = (await mkSeq(e, ["2026-10-05"]))[0];
  const future = (await mkSeq(e, ["2026-10-14"]))[0];
  const evaluated = (await mkSeq(e, ["2026-09-18"], "20:00", "COMPLETED"))[0];
  await db.lessonEvaluation.create({ data: { classSessionId: evaluated.id, content: "Great lesson." } });
  check("과거 + COMPLETED + 평가서 없음 → 가능", (await codeOf(() => adminPostpone(db, past.id))) === "NO_ERROR");
  check("과거 + SCHEDULED + 평가서 없음 → 가능", (await codeOf(() => adminPostpone(db, pastScheduled.id))) === "NO_ERROR");
  check("오늘 + 평가서 없음 → 가능", (await codeOf(() => adminPostpone(db, today.id))) === "NO_ERROR");
  check("미래 + 평가서 없음 → 가능", (await codeOf(() => adminPostpone(db, future.id))) === "NO_ERROR");
  check("평가서 있음 → 초기화 없이는 EVALUATION_EXISTS", (await codeOf(() => adminPostpone(db, evaluated.id))) === "EVALUATION_EXISTS");
  check("관리자연기는 학생 횟수 변화 없음", (await usage(e.id)) === 0);
  const lrs = await db.leaveRequest.findMany();
  check("source=ADMIN_POSTPONEMENT, quotaImpact=0", lrs.length === 4 && lrs.every((l) => l.source === "ADMIN_POSTPONEMENT" && l.quotaImpact === 0 && l.executedByRole === "ADMIN"));
  // 시간과 무관하게 평가서 유무가 핵심: 평가서 있는 과거 수업이 reset 후 가능
  const rs = await run(db, (tx) => resetSessionEvaluation(tx, { sessionId: evaluated.id, actor: ADMIN, reason: "재작성" }));
  check("평가 초기화 성공(평가서 삭제)", rs.ok && rs.hadEvaluation && (await db.lessonEvaluation.count({ where: { classSessionId: evaluated.id } })) === 0);
  check("초기화 후 관리자연기 가능", (await codeOf(() => adminPostpone(db, evaluated.id))) === "NO_ERROR");
});
test("평가 초기화: 녹음 원본·전사 보존, AI 결과 비움, 감사 기록 / AI 처리 중이면 초기화·연기 모두 거부", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 30, end: "2026-12-30", start: "2026-09-01" });
  const [done] = await mkSeq(e, ["2026-09-14"], "20:00", "COMPLETED");
  await db.lessonEvaluation.create({ data: { classSessionId: done.id, content: "Published evaluation text." } });
  const rec = await db.audioRecording.create({
    data: {
      classSessionId: done.id,
      fileName: "lesson.m4a",
      driveFileId: "r2:recordings/1/abc.m4a",
      provider: "assemblyai",
      providerTranscriptId: "tr-1",
      transcript: "full transcript",
      aiDraft: "draft text",
      teacherQcDraft: "qc text",
      processingStatus: "PUBLISHED",
      errorMessage: "old error",
      analyzedAt: NOW,
      reviewedAt: NOW,
    },
  });
  const rs = await run(db, (tx) => resetSessionEvaluation(tx, { sessionId: done.id, actor: ADMIN, reason: "다시 진행" }));
  check("초기화 성공: 평가서+녹음 결과", rs.ok && rs.hadEvaluation && rs.hadRecording);
  const after = await db.audioRecording.findUniqueOrThrow({ where: { id: rec.id } });
  check("AI 결과(aiDraft/teacherQcDraft/errorMessage/분석·검토 시각)는 비워지고 상태는 EVALUATION_RESET", after.aiDraft === null && after.teacherQcDraft === null && after.errorMessage === null && after.analyzedAt === null && after.reviewedAt === null && after.processingStatus === "EVALUATION_RESET");
  check("녹음 원본 보존: driveFileId(R2 키)/파일명/전사/providerTranscriptId/레코드 자체", after.driveFileId === "r2:recordings/1/abc.m4a" && after.fileName === "lesson.m4a" && after.transcript === "full transcript" && after.providerTranscriptId === "tr-1" && after.deletedAt === null);
  const audit = await db.auditLog.findFirst({ where: { targetType: "ClassSession", targetId: String(done.id) } });
  check("초기화 감사 기록(행위자·사유·원본 보존 표시)", !!audit && /평가 초기화/.test(audit.description ?? "") && /다시 진행/.test(audit.description ?? "") && /originalAudioKept":true/.test(audit.description ?? "") && audit.actorRole === "ADMIN");
  check("초기화 후에는 연기 가능하고 새 대체 수업에는 이전 AI 결과가 없음", await (async () => {
    const r = await adminPostpone(db, done.id);
    const repEval = await db.lessonEvaluation.count({ where: { classSessionId: r.replacementSessionId! } });
    const repRec = await db.audioRecording.count({ where: { classSessionId: r.replacementSessionId! } });
    return repEval === 0 && repRec === 0;
  })());
  check("초기화할 것이 없으면 거부", !(await run(db, (tx) => resetSessionEvaluation(tx, { sessionId: done.id, actor: ADMIN, reason: "again" }))).ok);

  // AI 처리 중
  const [busy] = await mkSeq(e, ["2026-09-16"], "20:00", "COMPLETED");
  const brec = await db.audioRecording.create({ data: { classSessionId: busy.id, fileName: "b.m4a", driveFileId: "r2:recordings/2/b.m4a", processingStatus: "ANALYZING" } });
  const rs2 = await run(db, (tx) => resetSessionEvaluation(tx, { sessionId: busy.id, actor: ADMIN, reason: "x" }));
  check("AI 분석 중(ANALYZING): 평가 초기화 거부", !rs2.ok && /AI 분석/.test(rs2.error));
  check("AI 분석 중: 관리자연기 거부(AI_PROCESSING)", (await codeOf(() => adminPostpone(db, busy.id))) === "AI_PROCESSING");
  check("AI 분석 중: 학생 연기도 거부", (await codeOf(() => adminAsStudent(db, busy.id))) !== "NO_ERROR");
  check("거부된 시도는 녹음/수업을 바꾸지 않음", (await db.audioRecording.findUniqueOrThrow({ where: { id: brec.id } })).processingStatus === "ANALYZING" && (await db.classSession.findUniqueOrThrow({ where: { id: busy.id } })).status === "COMPLETED");
});

// ── 학원 휴강 ────────────────────────────────────────────────────────────────────────────────────────────────────────
test("학원 휴강: 그 날 수업을 cascade — 종료일은 한 번만 연장, 학생 횟수 변화 없음, 중복 등록 거부", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  await mkSeq(e, MWF_DATES);
  const r = await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-09", reason: "한글날", actor: ADMIN, now: NOW }));
  check("그 날 정규 수업 1건 재배치", r.rescheduled === 1 && r.superseded === 0);
  check("시퀀스: 월 수 월 수 금 월 (10/9 제거, 끝에 10/19)", eq(await activeRegular(e.id), ["2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19"]));
  check("종료일 10/16 → 10/19(실제 마지막 수업)", (await endIso(e.id)) === "2026-10-19");
  check("학생 연기 횟수 변화 없음(학원 휴강은 학생 횟수를 쓰지 않음)", (await usage(e.id)) === 0);
  const lr = await db.leaveRequest.findFirstOrThrow({ where: { enrollmentId: e.id } });
  check("LeaveRequest: source=ACADEMY_CLOSURE, 휴강 연결, 횟수 영향 0", lr.source === "ACADEMY_CLOSURE" && lr.academyClosureId === r.closureId && lr.quotaImpact === 0 && lr.requestedByRole === "ADMIN");
  check("같은 날짜·범위의 휴강 중복 등록은 거부", (await codeOf(() => run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-09", reason: "again", actor: ADMIN, now: NOW })))).startsWith("FLOW:"));
  check("중복 시도가 아무것도 바꾸지 않음", (await db.academyClosure.count()) === 1 && (await endIso(e.id)) === "2026-10-19");
  // 되돌리기
  const rv = await run(db, (tx) => revertAcademyClosure(tx, { closureId: r.closureId, actor: ADMIN }));
  check("휴강 되돌리기: 수업/종료일 원상 복구, 휴강/LeaveRequest 삭제", rv?.reverted === 1 && eq(await activeRegular(e.id), MWF_DATES) && (await endIso(e.id)) === "2026-10-16" && (await db.academyClosure.count()) === 0 && (await db.leaveRequest.count()) === 0);
});
test("복수 휴강 + 연기 누적: 시퀀스가 매번 밀리고 종료일은 실제 마지막 수업 날짜", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  await mkSeq(e, MWF_DATES);
  await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-07", reason: "a", actor: ADMIN, now: NOW }));
  await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-09", reason: "b", actor: ADMIN, now: NOW }));
  await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-12", reason: "c", actor: ADMIN, now: NOW }));
  check("휴강 3일 후에도 정규 6개, 모두 휴강일이 아님", (await activeRegular(e.id)).length === 6 && !(await activeRegular(e.id)).some((x) => ["2026-10-07", "2026-10-09", "2026-10-12"].includes(x)), JSON.stringify(await activeRegular(e.id)));
  check("종료일은 마지막 정규 수업 날짜(10/16 이후 3슬롯: 10/19, 10/21, 10/23)", eq(await activeRegular(e.id), ["2026-10-05", "2026-10-14", "2026-10-16", "2026-10-19", "2026-10-21", "2026-10-23"]) && (await endIso(e.id)) === "2026-10-23");
});
test("학원 휴강 supersede: 학생이 먼저 연기 → 이후 휴강 지정 → 한 번만 cascade, 종료일 한 번만, 학생 횟수 복구, 이력 보존 / 휴강 되돌리면 횟수 복원(이중 복구 없음)", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const ses = await mkSeq(e, MWF_DATES);
  const sp = await studentSelf(db, ses[2].id, s.id); // 10/9 연기 → 학생 횟수 1
  check("학생 연기: 횟수 1, 종료일 10/19, 대체 수업 10/19", (await usage(e.id)) === 1 && (await endIso(e.id)) === "2026-10-19" && sp.replacementAt?.getTime() === kst("2026-10-19").getTime());
  const sessionCountBefore = await db.classSession.count({ where: { enrollmentId: e.id } });
  const cl = await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-09", reason: "한글날", actor: ADMIN, now: NOW }));
  check("휴강 등록: 이미 연기된 수업은 대체(superseded 1), 새로 재배치된 수업 0", cl.superseded === 1 && cl.rescheduled === 0);
  check("두 번 cascade 없음: 수업 수 그대로, 종료일 그대로 10/19", (await db.classSession.count({ where: { enrollmentId: e.id } })) === sessionCountBefore && (await endIso(e.id)) === "2026-10-19");
  const lr = await db.leaveRequest.findUniqueOrThrow({ where: { classSessionId: ses[2].id } });
  check("이력 보존: source=STUDENT_POSTPONEMENT(원래 사유), finalSource=ACADEMY_CLOSURE, quotaImpact=0, supersededByClosureId=휴강, 실행 정보 유지", lr.source === "STUDENT_POSTPONEMENT" && lr.finalSource === "ACADEMY_CLOSURE" && lr.quotaImpact === 0 && lr.supersededByClosureId === cl.closureId && lr.supersededAt !== null && lr.executedByRole === "STUDENT" && lr.replacementSessionId === sp.replacementSessionId);
  check("학생 연기 횟수 복구(사용 0)", (await usage(e.id)) === 0);
  check("대체된 연기를 개별로 되돌리려 하면 거부(휴강부터 되돌려야 함)", (await codeOf(() => run(db, (tx) => revertReschedule(tx, lr.id)))) === "SUPERSEDED_BY_CLOSURE");
  // 휴강 되돌리기 → 학생 연기 복원, 횟수 1
  const rv = await run(db, (tx) => revertAcademyClosure(tx, { closureId: cl.closureId, actor: ADMIN }));
  const lr2 = await db.leaveRequest.findUniqueOrThrow({ where: { id: lr.id } });
  check("휴강 되돌리기: 학생 연기 복원(finalSource=STUDENT_POSTPONEMENT, quotaImpact=1, 대체 정보 해제)", rv?.restoredStudentPostponements === 1 && lr2.finalSource === "STUDENT_POSTPONEMENT" && lr2.quotaImpact === 1 && lr2.supersededByClosureId === null);
  check("복원 후 횟수 1(이중 복구 없음), 종료일 10/19 유지(학생 연기 자체는 유효)", (await usage(e.id)) === 1 && (await endIso(e.id)) === "2026-10-19");
  check("이미 삭제된 휴강을 다시 되돌려도 아무 일도 없음(멱등)", (await run(db, (tx) => revertAcademyClosure(tx, { closureId: cl.closureId, actor: ADMIN }))) === null && (await usage(e.id)) === 1);
  // 이후 학생 연기 되돌리기 → 횟수 0
  await run(db, (tx) => revertReschedule(tx, lr.id));
  check("학생 연기를 되돌리면 횟수 0, 종료일 10/16, 수업 SCHEDULED", (await usage(e.id)) === 0 && (await endIso(e.id)) === "2026-10-16" && eq(await activeRegular(e.id), MWF_DATES));
});
test("관리자가 대신 실행한 학생 연기도 휴강으로 대체되면 횟수 복구 / 휴강이 먼저면 학생이 연기할 필요 없음(횟수 차감 없음)", async () => {
  await reset();
  const t = await mkTeacher();
  const s1 = await mkStudent();
  const e1 = await mkEnrollment({ teacherId: t.id, studentId: s1.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const a = await mkSeq(e1, MWF_DATES);
  await adminAsStudent(db, a[2].id);
  check("관리자 대신 실행: 횟수 1", (await usage(e1.id)) === 1);
  const cl = await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-09", reason: "휴강", actor: ADMIN, now: NOW }));
  check("휴강 지정 → 횟수 복구 0 (executedByRole=ADMIN인 건도 동일)", (await usage(e1.id)) === 0 && cl.superseded === 1);
  await run(db, (tx) => revertAcademyClosure(tx, { closureId: cl.closureId, actor: ADMIN }));
  check("휴강 되돌림 → 다시 1", (await usage(e1.id)) === 1);

  const s2 = await mkStudent();
  const e2 = await mkEnrollment({ teacherId: (await mkTeacher()).id, studentId: s2.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const b = await mkSeq(e2, MWF_DATES);
  await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-09", reason: "휴강2", actor: ADMIN, now: NOW }));
  check("휴강이 먼저 등록된 날 수업은 이미 LEAVE라 학생 연기가 거부됨(ALREADY_RESCHEDULED)", (await codeOf(() => studentSelf(db, b[2].id, s2.id))) === "ALREADY_RESCHEDULED");
  check("그 경우 학생 연기 횟수 차감 없음(사용 0), 한 번만 재배치", (await usage(e2.id)) === 0 && (await db.leaveRequest.count({ where: { enrollmentId: e2.id } })) === 1);
});
test("협력사(AGENT) 휴강은 자기 협력사 학생 수업만 재배치", async () => {
  await reset();
  const ag = await mkAgent();
  const t = await mkTeacher();
  const sIn = await mkStudent(ag.id);
  const sOut = await mkStudent();
  const eIn = await mkEnrollment({ teacherId: t.id, studentId: sIn.id, days: "금", months: 1, total: 2, end: "2026-10-16" });
  const eOut = await mkEnrollment({ teacherId: (await mkTeacher()).id, studentId: sOut.id, days: "금", months: 1, total: 2, end: "2026-10-16" });
  await mkSeq(eIn, ["2026-10-09", "2026-10-16"]);
  await mkSeq(eOut, ["2026-10-09", "2026-10-16"]);
  const r = await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-09", reason: "협력사 휴강", actor: { role: "AGENT", id: 7 }, agentScopeId: ag.id, now: NOW }));
  check("협력사 소속 학생 1건만 재배치", r.rescheduled === 1 && eq(await activeRegular(eIn.id), ["2026-10-16", "2026-10-23"]) && eq(await activeRegular(eOut.id), ["2026-10-09", "2026-10-16"]));
});

// ── 되돌리기 / 호환 ──────────────────────────────────────────────────────────────────────────────────────────────────
test("되돌리기: 새 방식 — 대체 수업 삭제, 종료일 복구, 횟수 복구 / 대체 수업이 이미 진행됐으면 거부 / 옛 방식 건 호환", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const ses = await mkSeq(e, MWF_DATES);
  const r = await studentSelf(db, ses[1].id, s.id);
  await run(db, (tx) => revertReschedule(tx, r.leaveRequestId));
  check("되돌린 뒤: 수업 SCHEDULED, 대체 수업 삭제, 종료일 10/16, 횟수 0", eq(await activeRegular(e.id), MWF_DATES) && (await endIso(e.id)) === "2026-10-16" && (await usage(e.id)) === 0 && (await db.classSession.count({ where: { enrollmentId: e.id } })) === 6);
  // 대체 수업이 이미 완료되면 되돌릴 수 없다
  const r2 = await studentSelf(db, ses[1].id, s.id);
  await db.classSession.update({ where: { id: r2.replacementSessionId! }, data: { status: "COMPLETED" } });
  check("대체 수업이 이미 진행(COMPLETED)되면 되돌리기 거부(REVERT_BLOCKED)", (await codeOf(() => run(db, (tx) => revertReschedule(tx, r2.leaveRequestId)))) === "REVERT_BLOCKED");
  check("거부 시 아무것도 바뀌지 않음", (await db.classSession.findUniqueOrThrow({ where: { id: ses[1].id } })).status === "LEAVE" && (await usage(e.id)) === 1);

  // 옛 방식: source 없음, 대체 수업 없음, extendedDays=1, 종료일 +1일, 학생 신청(requestedByRole=STUDENT)
  const s3 = await mkStudent();
  const e3 = await mkEnrollment({ teacherId: (await mkTeacher()).id, studentId: s3.id, days: "월", months: 1, total: 2, end: "2026-10-20" });
  const [legacy] = await mkSeq(e3, ["2026-10-12"]);
  await db.classSession.update({ where: { id: legacy.id }, data: { status: "LEAVE" } });
  await db.leaveRequest.create({ data: { siteId: 1, classSessionId: legacy.id, enrollmentId: e3.id, studentId: s3.id, extendedDays: 1, status: "APPROVED", requestedByRole: "STUDENT", approvedAt: NOW } });
  check("옛 방식 학생 연기도 횟수 1회로 계산", (await usage(e3.id)) === 1);
  const legacyLr = await db.leaveRequest.findUniqueOrThrow({ where: { classSessionId: legacy.id } });
  await run(db, (tx) => revertReschedule(tx, legacyLr.id));
  check("옛 방식 되돌리기: 수업 SCHEDULED, 종료일 -1일(10/19), 횟수 0", (await db.classSession.findUniqueOrThrow({ where: { id: legacy.id } })).status === "SCHEDULED" && (await endIso(e3.id)) === "2026-10-19" && (await usage(e3.id)) === 0);
});
test("강사 홀드 승인: 같은 cascade, 학생 횟수/유급휴가 한도 미차감, source=TEACHER_HOLD", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const ses = await mkSeq(e, MWF_DATES);
  const pending = await db.leaveRequest.create({ data: { siteId: 1, classSessionId: ses[1].id, enrollmentId: e.id, studentId: s.id, extendedDays: 1, status: "PENDING", requestedByRole: "TEACHER", reason: "개인 사정" } });
  await postpone(db, { sessionId: ses[1].id, source: "TEACHER_HOLD", actor: ADMIN, existingLeaveRequestId: pending.id, reason: "개인 사정" });
  const lr = await db.leaveRequest.findUniqueOrThrow({ where: { id: pending.id } });
  check("승인 → APPROVED, source/finalSource=TEACHER_HOLD, requestedByRole=TEACHER 유지, 횟수 영향 0, 승인자 기록", lr.status === "APPROVED" && lr.source === "TEACHER_HOLD" && lr.finalSource === "TEACHER_HOLD" && lr.requestedByRole === "TEACHER" && lr.quotaImpact === 0 && lr.approvedById === 1 && lr.approvedAt !== null);
  check("정규 시퀀스 cascade(10/7 제거, 10/19 추가)와 종료일 10/19", eq(await activeRegular(e.id), ["2026-10-05", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19"]) && (await endIso(e.id)) === "2026-10-19");
  check("학생 횟수 사용 0, 유급휴가 행 없음", (await usage(e.id)) === 0 && (await db.teacherPaidLeave.count()) === 0);
});

// ── 유급휴가 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function paidApproved(teacherId: number, dates: string[]) {
  for (const date of dates) await db.teacherPaidLeave.create({ data: { siteId: 1, teacherId, leaveDate: d(date), status: "APPROVED", approvedById: 1, approvedAt: NOW } });
}
const reqPL = (client: PrismaClient, teacherId: number, leaveDate: string) => run(client, (tx) => requestPaidLeave(tx, { teacherId, leaveDate, actor: ADMIN, siteId: 1, now: NOW, reason: "휴가" }));
const approvePL = (client: PrismaClient, paidLeaveId: number, actor: { role: "ADMIN" | "MANAGER"; id: number } = ADMIN, now: Date = NOW) => run(client, (tx) => approvePaidLeave(tx, { paidLeaveId, actor, now }));

test("유급휴가: 정규 강사만 요청/승인, 관리자 승인 시 그날 학생 수업 전부 cascade, 급여 대상은 승인 1건(같은 날 중복 불가)", async () => {
  await reset();
  const reg = await mkTeacher({ regular: true });
  const non = await mkTeacher();
  const rq = await reqPL(db, non.id, "2026-10-19");
  check("비정규 강사는 요청 거부", !rq.ok);
  // 정규 강사가 같은 날(월 10/12) 학생 3명 수업을 가짐
  const envs = [];
  for (let i = 0; i < 3; i++) {
    const s = await mkStudent();
    const e = await mkEnrollment({ teacherId: reg.id, studentId: s.id, days: "월", time: `${19 + i}:00`, months: 1, total: 4, end: "2026-11-02" });
    await mkSeq(e, ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"], `${19 + i}:00`);
    envs.push(e);
  }
  const req = await reqPL(db, reg.id, "2026-10-12");
  check("정규 강사 요청 성공(PENDING)", req.ok);
  const dupReq = await reqPL(db, reg.id, "2026-10-12");
  check("같은 강사·같은 날 중복 요청 거부", !dupReq.ok);
  const paidLeaveId = (req as { paidLeaveId: number }).paidLeaveId;
  const ok = await approvePL(db, paidLeaveId, { role: "MANAGER", id: 5 });
  check("휴가일 이전 승인(MANAGER 포함) 성공, 사후 승인 아님", ok.ok && ok.postApproval === false && ok.movedSessions === 3);
  const pl = await db.teacherPaidLeave.findUniqueOrThrow({ where: { id: paidLeaveId } });
  check("승인 기록: status=APPROVED, 승인자/시각, postApproval=false", pl.status === "APPROVED" && pl.approvedById === 5 && pl.approvedAt !== null && pl.postApproval === false);
  for (const e of envs) {
    const a = await activeRegular(e.id);
    check(`그날 수업이 정규 시퀀스 cascade: 10/12 제거, 4개 유지 (${e.id})`, a.length === 4 && !a.includes("2026-10-12") && a[a.length - 1] === "2026-11-09", JSON.stringify(a));
  }
  const lrs = await db.leaveRequest.findMany({ where: { paidLeaveId } });
  check("LeaveRequest 3건: source=PAID_LEAVE, 학생 횟수 영향 0, 보충수업 아님", lrs.length === 3 && lrs.every((l) => l.source === "PAID_LEAVE" && l.quotaImpact === 0) && (await db.classSession.count({ where: { isSupplement: true } })) === 0);
  check("학생 3명 수업이 영향받아도 유급휴가 행은 강사·날짜당 1건(급여 rate×8 1회의 근거)", (await db.teacherPaidLeave.count({ where: { teacherId: reg.id, leaveDate: d("2026-10-12") } })) === 1);
  const again = await approvePL(db, paidLeaveId);
  check("이미 승인된 건 재승인 거부", !again.ok);
  // 일반 LEAVE(홀드/연기/휴강)는 유급휴가 한도를 쓰지 않는다
  const approvedBefore = await db.teacherPaidLeave.count({ where: { teacherId: reg.id, status: "APPROVED" } });
  await postpone(db, { sessionId: (await db.classSession.findFirstOrThrow({ where: { enrollmentId: envs[0].id, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" } })).id, source: "TEACHER_HOLD", actor: ADMIN });
  check("일반 LEAVE(강사 홀드)는 유급휴가 승인 수에 영향 없음", (await db.teacherPaidLeave.count({ where: { teacherId: reg.id, status: "APPROVED" } })) === approvedBefore);
  // 취소(되돌리기)
  const rv = await run(db, (tx) => revokePaidLeave(tx, { paidLeaveId, actor: ADMIN, now: NOW }));
  check("유급휴가 승인 취소 → 연결된 재배치 3건 되돌림", rv.ok && (await db.leaveRequest.count({ where: { paidLeaveId } })) === 0);
});
test("유급휴가 한도: 상반기 5회 / 하반기 5회 / 연 10회, 6개월 경계, 다른 해 미합산", async () => {
  await reset();
  const t = await mkTeacher({ regular: true });
  await paidApproved(t.id, ["2026-01-05", "2026-02-10", "2026-03-10", "2026-04-10", "2026-05-11"]);
  const sixth = await reqPL(db, t.id, "2026-06-15");
  check("상반기 6번째 승인 거부(반기 5회)", sixth.ok && !(await approvePL(db, (sixth as { paidLeaveId: number }).paidLeaveId)).ok);
  const jun30 = await reqPL(db, t.id, "2026-06-30");
  check("6월 30일(상반기) 거부", jun30.ok && !(await approvePL(db, (jun30 as { paidLeaveId: number }).paidLeaveId)).ok);
  const jul1 = await reqPL(db, t.id, "2026-07-01");
  check("7월 1일은 하반기 한도 → 승인 성공", jul1.ok && (await approvePL(db, (jul1 as { paidLeaveId: number }).paidLeaveId)).ok);
  await paidApproved(t.id, ["2026-08-10", "2026-09-10", "2026-10-12", "2026-11-09"]); // 하반기 총 5회(7/1 포함)
  const dec = await reqPL(db, t.id, "2026-12-14");
  const decRes = dec.ok ? await approvePL(db, (dec as { paidLeaveId: number }).paidLeaveId) : { ok: false as const, error: "" };
  check("하반기 6번째(연 11번째) 승인 거부", dec.ok && !decRes.ok);
  const next = await reqPL(db, t.id, "2027-01-11");
  check("다음 해는 합산되지 않음(2027-01-11 성공)", next.ok && (await approvePL(db, (next as { paidLeaveId: number }).paidLeaveId)).ok);
  check("승인된 건수: 2026년 10개 + 2027년 1개", (await db.teacherPaidLeave.count({ where: { status: "APPROVED" } })) === 11);
  // 연 10회 한도 (반기 한도와 별개로)
  const t2 = await mkTeacher({ regular: true });
  await paidApproved(t2.id, ["2026-01-05", "2026-02-10", "2026-03-10", "2026-04-10", "2026-07-06", "2026-08-10", "2026-09-10", "2026-10-12", "2026-11-09"]); // 9회: 상반기 4, 하반기 5
  const tenth = await reqPL(db, t2.id, "2026-05-11");
  check("연 9회 + 상반기 5번째 = 10번째는 허용", tenth.ok && (await approvePL(db, (tenth as { paidLeaveId: number }).paidLeaveId)).ok);
  const eleventh = await reqPL(db, t2.id, "2026-06-01");
  check("11번째는 거부", eleventh.ok && !(await approvePL(db, (eleventh as { paidLeaveId: number }).paidLeaveId)).ok);
});
test("유급휴가 승인 시점: 휴가일 이후 일반 사용자 승인 거부 / 관리자 사후 승인 허용 + 감사 기록(postApproval)", async () => {
  await reset();
  const t = await mkTeacher({ regular: true });
  const past = await reqPL(db, t.id, "2026-10-01");
  const pid = (past as { paidLeaveId: number }).paidLeaveId;
  const byUser = await approvePL(db, pid, { role: "MANAGER", id: 5 });
  check("휴가일(10/1) 이후 MANAGER 승인 거부", !byUser.ok && /관리자만/.test(byUser.error));
  check("거부 시 상태 변화 없음(PENDING)", (await db.teacherPaidLeave.findUniqueOrThrow({ where: { id: pid } })).status === "PENDING");
  const byAdmin = await approvePL(db, pid, ADMIN);
  check("관리자 사후 승인 성공, postApproval=true", byAdmin.ok && byAdmin.postApproval === true && (await db.teacherPaidLeave.findUniqueOrThrow({ where: { id: pid } })).postApproval === true);
  const audit = await db.auditLog.findFirst({ where: { targetType: "TeacherPaidLeave", targetId: String(pid), action: "LEAVE_APPROVED" } });
  check("사후 승인 감사 기록: 강사/휴가일/이전·이후 상태/postApproval/행위자", !!audit && /사후 승인/.test(audit.description ?? "") && /postApproval":true/.test(audit.description ?? "") && /leaveDate":"2026-10-01"/.test(audit.description ?? "") && /previousStatus":"PENDING"/.test(audit.description ?? "") && /newStatus":"APPROVED"/.test(audit.description ?? "") && audit.actorRole === "ADMIN");
  // 거부됐던 건을 관리자가 다시 승인(수정)
  const t2 = await mkTeacher({ regular: true });
  const r2 = await reqPL(db, t2.id, "2026-10-20");
  await run(db, async (tx) => tx.teacherPaidLeave.update({ where: { id: (r2 as { paidLeaveId: number }).paidLeaveId }, data: { status: "REJECTED" } }));
  check("거부됐던 유급휴가를 관리자가 승인(수정)할 수 있음", (await approvePL(db, (r2 as { paidLeaveId: number }).paidLeaveId)).ok);
});

// ── 보충수업 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("보충수업: 정규와 별개로 +1 — 20회 + 보충 1회 = 21, totalSessions 불변, 정규 잔여와 분리", async () => {
  await reset();
  const t = await mkTeacher();
  const sub = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 20, start: "2026-10-05", end: "2026-12-31" });
  const reg = await mkSeq(e, MWF_DATES);
  const r = await run(db, (tx) => createSupplementSession(tx, { studentId: s.id, enrollmentId: e.id, teacherId: sub.id, scheduledAt: kst("2026-10-13", "15:00"), durationMin: 25, relatedSessionId: reg[1].id, siteId: 1 }));
  check("보충수업 생성 성공", r.ok);
  const sup = await db.classSession.findUniqueOrThrow({ where: { id: (r as { sessionId: number }).sessionId } });
  check("isSupplement=true, relatedSessionId로 정규 수업과 연결, 생성 키 없음", sup.isSupplement && sup.relatedSessionId === reg[1].id && sup.generationKey === null && sup.teacherId === sub.id);
  const all = await db.classSession.findMany({ where: { enrollmentId: e.id, deletedAt: null } });
  const c = countLessons(all, 20);
  check("정규 20 + 보충 1 → 제공 가능 21, 정규 총 20 그대로", c.availableLessons === 21 && c.regularTotal === 20 && c.supplementTotal === 1);
  check("enrollment.totalSessions는 20 그대로", (await db.enrollment.findUniqueOrThrow({ where: { id: e.id } })).totalSessions === 20);
  // 정규 19 + 보충 1 완료 → 정규 잔여 1
  await db.classSession.updateMany({ where: { enrollmentId: e.id, isSupplement: false }, data: { status: "COMPLETED" } });
  await db.classSession.update({ where: { id: sup.id }, data: { status: "COMPLETED" } });
  const done = countLessons(await db.classSession.findMany({ where: { enrollmentId: e.id, deletedAt: null } }), 20);
  check("정규 6 완료 + 보충 1 완료 → 정규 잔여 14(보충이 정규를 소모하지 않음), 받은 수업 7", done.regularRemaining === 14 && done.supplementTaken === 1 && done.providedLessons === 7);
});
test("보충수업 검증: 강사 충돌 / 학생 충돌 / 휴강일 / 수강기간 밖 / 중복 / 관련 수업이 다른 수강", async () => {
  await reset();
  const t = await mkTeacher();
  const sub = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, start: "2026-10-05", end: "2026-10-16" });
  const reg = await mkSeq(e, MWF_DATES);
  const sup = (client: PrismaClient, over: Partial<Parameters<typeof createSupplementSession>[1]> = {}) =>
    run(client, (tx) => createSupplementSession(tx, { studentId: s.id, enrollmentId: e.id, teacherId: sub.id, scheduledAt: kst("2026-10-13", "15:00"), durationMin: 25, siteId: 1, ...over }));
  // 강사 충돌: sub 강사가 같은 시각에 다른 학생 수업
  const other = await mkStudent();
  const e2 = await mkEnrollment({ teacherId: sub.id, studentId: other.id, days: "화", time: "15:10", months: 1, total: 1, end: "2026-10-13" });
  await mkSeq(e2, ["2026-10-13"], "15:10");
  const tc = await sup(db);
  check("강사 일정 충돌 차단", !tc.ok && /강사/.test(tc.error), JSON.stringify(tc));
  // 학생 충돌: 같은 학생의 다른 수업(정규 수업 10/14 20:00)과 겹치는 시각
  const sc = await sup(db, { scheduledAt: kst("2026-10-14", "20:10"), teacherId: (await mkTeacher()).id });
  check("학생 본인 일정 충돌 차단(다른 강사여도)", !sc.ok && /학생/.test(sc.error), JSON.stringify(sc));
  // 휴강일
  await db.academyClosure.create({ data: { siteId: 1, date: kst("2026-10-15", "00:00"), reason: "임시 휴강" } });
  const cc = await sup(db, { scheduledAt: kst("2026-10-15", "13:00") });
  check("학원 휴강일 차단", !cc.ok && /휴강/.test(cc.error), JSON.stringify(cc));
  // 기간 밖
  const before = await sup(db, { scheduledAt: kst("2026-10-02", "13:00") });
  const after = await sup(db, { scheduledAt: kst("2026-10-17", "13:00") });
  check("수강 기간(10/5~10/16) 밖 차단(이전/이후)", !before.ok && !after.ok && /수강 기간/.test(before.ok ? "" : before.error));
  // 관련 수업이 다른 수강
  const bad = await sup(db, { scheduledAt: kst("2026-10-13", "16:00"), relatedSessionId: (await db.classSession.findFirstOrThrow({ where: { enrollmentId: e2.id } })).id });
  check("관련 정규 수업이 다른 수강이면 차단", !bad.ok);
  // 성공 후 중복
  const okRes = await sup(db, { scheduledAt: kst("2026-10-13", "17:00"), relatedSessionId: reg[0].id });
  check("정상 보충수업 성공", okRes.ok);
  const dup = await sup(db, { scheduledAt: kst("2026-10-13", "17:00") });
  check("같은 시간 중복 생성 차단", !dup.ok);
  check("잘못된 수업 시간 거부", !(await sup(db, { durationMin: 40, scheduledAt: kst("2026-10-13", "18:00") })).ok);
  check("실패한 시도는 보충수업을 만들지 않음(성공 1건만)", (await db.classSession.count({ where: { isSupplement: true } })) === 1);
});

// ── 동시성 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test("동시성: 같은 수업을 학생이 빠르게 두 번 연기 → 한 번만 처리(횟수 1, 대체 수업 1, 종료일 한 번)", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 18, end: "2026-12-30" });
  const ses = await mkSeq(e, MWF_DATES);
  const res = await Promise.all([codeOf(() => studentSelf(db, ses[1].id, s.id)), codeOf(() => studentSelf(dbB, ses[1].id, s.id))]);
  check("정확히 한 쪽만 성공, 다른 쪽은 ALREADY_RESCHEDULED", res.filter((r) => r === "NO_ERROR").length === 1 && res.filter((r) => r === "ALREADY_RESCHEDULED").length === 1, JSON.stringify(res));
  check("횟수 1, 대체 수업 1개, LeaveRequest 1건", (await usage(e.id)) === 1 && (await db.classSession.count({ where: { relatedSessionId: ses[1].id } })) === 1 && (await db.leaveRequest.count()) === 1);
});
test("동시성: 학생 직접 연기 + 관리자가 대신 누르는 학생 연기 동시 → 한 번만, 횟수 1", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 18, end: "2026-12-30" });
  const ses = await mkSeq(e, MWF_DATES);
  const res = await Promise.all([codeOf(() => studentSelf(db, ses[2].id, s.id)), codeOf(() => adminAsStudent(dbB, ses[2].id))]);
  check("한 쪽만 성공", res.filter((r) => r === "NO_ERROR").length === 1, JSON.stringify(res));
  check("횟수 1, 대체 수업 1개", (await usage(e.id)) === 1 && (await db.classSession.count({ where: { relatedSessionId: ses[2].id } })) === 1);
});
test("동시성: 같은 수강의 서로 다른 수업을 동시에 연기 → 대체 슬롯이 겹치지 않음(unique 위반 없음) + 횟수 한도(1회)는 한 번만", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const ses = await mkSeq(e, MWF_DATES);
  // 주3×1개월 = 2회 → 관리자 연기 두 건은 한도와 무관, 서로 다른 슬롯을 받는다
  const resAdmin = await Promise.all([codeOf(() => adminPostpone(db, ses[1].id)), codeOf(() => adminPostpone(dbB, ses[2].id))]);
  check("두 관리자연기 모두 성공", resAdmin.every((r) => r === "NO_ERROR"), JSON.stringify(resAdmin));
  const a = await activeRegular(e.id);
  check("대체 슬롯이 서로 다른 날짜(정규 6개 유지, 중복 날짜 없음)", a.length === 6 && new Set(a).size === 6, JSON.stringify(a));
  // 학생 연기 한도(주3×1개월=2회)를 3개 동시에 시도 → 정확히 2개만 성공
  await reset();
  const t2 = await mkTeacher();
  const s2 = await mkStudent();
  const e2 = await mkEnrollment({ teacherId: t2.id, studentId: s2.id, days: "월수금", months: 1, total: 12, end: "2026-10-30" });
  const q = await mkSeq(e2, ["2026-10-14", "2026-10-16", "2026-10-19", "2026-10-21"]);
  const rs = await Promise.all([codeOf(() => studentSelf(db, q[0].id, s2.id)), codeOf(() => studentSelf(dbB, q[1].id, s2.id)), codeOf(() => studentSelf(db, q[2].id, s2.id))]);
  check("한도 2회: 동시 3건 중 정확히 2건 성공, 1건 STUDENT_QUOTA_EXCEEDED", rs.filter((r) => r === "NO_ERROR").length === 2 && rs.filter((r) => r === "STUDENT_QUOTA_EXCEEDED").length === 1, JSON.stringify(rs));
  check("사용 횟수 = 2(한도를 넘지 않음)", (await usage(e2.id)) === 2);
});
test("동시성: 학생 연기 + 학원 휴강 동시 → 어느 순서든 최종 상태 일관(횟수 0, 재배치 1회, 종료일 한 번)", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const ses = await mkSeq(e, MWF_DATES);
  const res = await Promise.all([
    codeOf(() => studentSelf(db, ses[2].id, s.id)),
    codeOf(() => run(dbB, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-09", reason: "휴강", actor: ADMIN, now: NOW }))),
  ]);
  check("휴강은 항상 성공", res[1] === "NO_ERROR", JSON.stringify(res));
  check("학생 연기는 성공(휴강이 대체) 또는 ALREADY_RESCHEDULED(휴강이 먼저)", res[0] === "NO_ERROR" || res[0] === "ALREADY_RESCHEDULED", JSON.stringify(res));
  const lrs = await db.leaveRequest.findMany({ where: { enrollmentId: e.id } });
  check("그 수업의 LeaveRequest는 정확히 1건, 최종 사유는 ACADEMY_CLOSURE", lrs.length === 1 && lrs[0].finalSource === "ACADEMY_CLOSURE" && lrs[0].quotaImpact === 0, JSON.stringify(lrs.map((l) => [l.source, l.finalSource, l.quotaImpact])));
  check("학생 횟수 0, 대체 수업 1개(두 번 cascade 없음), 종료일 10/19 한 번만 연장", (await usage(e.id)) === 0 && (await db.classSession.count({ where: { relatedSessionId: ses[2].id } })) === 1 && (await endIso(e.id)) === "2026-10-19" && (await activeRegular(e.id)).length === 6);
});
test("동시성: 두 관리자가 횟수를 동시에 수정 → 둘 다 직렬화되어 마지막 값이 남고 감사 기록 2건", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "화목", months: 3, end: "2026-12-24" });
  const res = await Promise.all([
    run(db, (tx) => adjustLeaveQuota(tx, { enrollmentId: e.id, newAdjustment: 2, reason: "A", actor: ADMIN })),
    run(dbB, (tx) => adjustLeaveQuota(tx, { enrollmentId: e.id, newAdjustment: 4, reason: "B", actor: { role: "ADMIN", id: 2 } })),
  ]);
  check("둘 다 성공", res.every((r) => r.ok));
  const adj = (await db.enrollment.findUniqueOrThrow({ where: { id: e.id } })).leaveQuotaAdjustment;
  const audits = await db.auditLog.findMany({ where: { targetType: "Enrollment", targetId: String(e.id) }, orderBy: { id: "asc" } });
  check("최종 값은 둘 중 하나이고, 두 번째 감사 기록의 '이전 값'이 첫 번째 값과 이어진다(직렬화)", (adj === 2 || adj === 4) && audits.length === 2 && JSON.parse((audits[1].description ?? "").slice((audits[1].description ?? "").indexOf("{"))).previousAdjustment === JSON.parse((audits[0].description ?? "").slice((audits[0].description ?? "").indexOf("{"))).newAdjustment);
});
test("동시성: 같은 유급휴가를 동시에 승인 → 한 번만 승인, 수업은 한 번만 재배치", async () => {
  await reset();
  const t = await mkTeacher({ regular: true });
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월", months: 1, total: 4, end: "2026-11-02" });
  await mkSeq(e, ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
  const req = await reqPL(db, t.id, "2026-10-12");
  const pid = (req as { paidLeaveId: number }).paidLeaveId;
  const res = await Promise.all([approvePL(db, pid), approvePL(dbB, pid)]);
  check("정확히 한 쪽만 승인", res.filter((r) => r.ok).length === 1, JSON.stringify(res));
  check("재배치 1건, 정규 4개 유지", (await db.leaveRequest.count({ where: { paidLeaveId: pid } })) === 1 && (await activeRegular(e.id)).length === 4);
});
test("동시성: 서로 다른 유급휴가 두 건을 동시에 승인해도 반기 한도(5회)를 넘지 않음", async () => {
  await reset();
  const t = await mkTeacher({ regular: true });
  await paidApproved(t.id, ["2026-01-05", "2026-02-10", "2026-03-10", "2026-04-10"]); // 4회
  const a = (await reqPL(db, t.id, "2026-05-11")) as { paidLeaveId: number };
  const b = (await reqPL(db, t.id, "2026-06-15")) as { paidLeaveId: number };
  const res = await Promise.all([approvePL(db, a.paidLeaveId), approvePL(dbB, b.paidLeaveId)]);
  check("5번째만 성공하고 6번째는 거부(정확히 1건)", res.filter((r) => r.ok).length === 1, JSON.stringify(res));
  check("상반기 승인 수 5", (await db.teacherPaidLeave.count({ where: { teacherId: t.id, status: "APPROVED", leaveDate: { lt: d("2026-07-01") } } })) === 5);
});
test("동시성: 같은 보충수업을 동시에 두 번 생성 → 한 번만", async () => {
  await reset();
  const t = await mkTeacher();
  const sub = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  await mkSeq(e, MWF_DATES);
  const input = { studentId: s.id, enrollmentId: e.id, teacherId: sub.id, scheduledAt: kst("2026-10-13", "15:00"), durationMin: 25, siteId: 1 };
  const res = await Promise.all([run(db, (tx) => createSupplementSession(tx, input)), run(dbB, (tx) => createSupplementSession(tx, input))]);
  check("정확히 한 쪽만 성공", res.filter((r) => r.ok).length === 1, JSON.stringify(res));
  check("보충수업 1건", (await db.classSession.count({ where: { isSupplement: true } })) === 1);
  // 다른 학생이 같은 강사·같은 시각에 보충을 동시에 만들어도 강사 충돌로 한 건만
  const s2 = await mkStudent();
  const e2 = await mkEnrollment({ teacherId: t.id, studentId: s2.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const s3 = await mkStudent();
  const e3 = await mkEnrollment({ teacherId: t.id, studentId: s3.id, days: "월수금", months: 1, total: 6, end: "2026-10-16" });
  const at = kst("2026-10-14", "11:00");
  const r2 = await Promise.all([
    run(db, (tx) => createSupplementSession(tx, { studentId: s2.id, enrollmentId: e2.id, teacherId: sub.id, scheduledAt: at, durationMin: 25, siteId: 1 })),
    run(dbB, (tx) => createSupplementSession(tx, { studentId: s3.id, enrollmentId: e3.id, teacherId: sub.id, scheduledAt: at, durationMin: 25, siteId: 1 })),
  ]);
  check("같은 강사·같은 시각 보충 동시 요청 → 강사 충돌로 정확히 한 건", r2.filter((r) => r.ok).length === 1, JSON.stringify(r2));
});

// ── 수강 홀드 해제(holdApply.ts): 같은 일수만 밀되, 쓸 수 없는 자리는 reschedule과 같은 다음 유효 슬롯 ───────────────────────────────
// 홀드 시작 = NOW(10/5 10:00 KST), 해제 = 10/12 10:00 KST → 정확히 7일을 쉬었으므로 7일(1주) 이동.
const HOLD_RELEASE_AT = new Date("2026-10-12T10:00:00+09:00");
async function putOnHold(enrollmentId: number) {
  await db.enrollment.update({ where: { id: enrollmentId }, data: { status: "HOLDING", holdStartedAt: NOW } });
  await db.classSession.updateMany({ where: { enrollmentId, status: "SCHEDULED", deletedAt: null }, data: { status: "HOLD" } });
}
const releaseHoldAt = (client: PrismaClient, enrollmentId: number, now: Date = HOLD_RELEASE_AT) => run(client, (tx) => releaseHoldInTx(tx, enrollmentId, now, ADMIN));

test("수강 홀드 해제: 방해가 없으면 정규 수업 전체가 같은 주 수만큼 밀리고, 종료일도 같은 만큼, 회차·generationKey 불변", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 18, end: "2026-10-16" });
  await mkSeq(e, MWF_DATES);
  await putOnHold(e.id);
  check("(전제) 홀드 중에는 정규 수업이 HOLD", (await db.classSession.count({ where: { enrollmentId: e.id, status: "HOLD" } })) === 6);
  const r = await releaseHoldAt(db, e.id);
  check("6건 모두 같은 일수(7일)만큼 이동, 재배치 0건", r.shifted === 6 && r.relocated === 0 && r.pinned === 0, JSON.stringify(r));
  check("월 수 금 월 수 금 → 한 주씩 뒤", eq(await activeRegular(e.id), ["2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19", "2026-10-21", "2026-10-23"]));
  check("종료일 10/16 → 10/23, 수강 상태 ACTIVE, holdStartedAt 해제", (await endIso(e.id)) === "2026-10-23" && (await db.enrollment.findUniqueOrThrow({ where: { id: e.id } })).holdStartedAt === null);
  const first = await db.classSession.findFirstOrThrow({ where: { enrollmentId: e.id }, orderBy: { scheduledAt: "asc" } });
  check("generationKey는 박제된 값 그대로(행이 옮겨가도 안 바뀜), 새 행은 만들지 않음", first.generationKey === `${e.id}:2026-10-05` && (await db.classSession.count({ where: { enrollmentId: e.id } })) === 6);
  check("정규 회차(totalSessions) 불변, 보충 없음", (await db.enrollment.findUniqueOrThrow({ where: { id: e.id } })).totalSessions === 18 && (await db.classSession.count({ where: { isSupplement: true } })) === 0);
  check("이미 해제된 수강을 다시 해제하면 거부", (await releaseHoldAt(db, e.id)).error === "현재 홀드 상태가 아닙니다.");
});
test("수강 홀드 해제: 밀린 날짜가 학원 휴강일이면 건너뛰고 뒤따르는 수업이 연쇄로 밀림(같은 날짜 중복·휴강일 배치 없음)", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 18, end: "2026-10-16" });
  await mkSeq(e, MWF_DATES);
  await putOnHold(e.id);
  // 홀드 중에 등록된 휴강(HOLD 수업은 휴강 등록이 건드리지 않는다)
  await db.academyClosure.create({ data: { siteId: 1, date: kst("2026-10-16", "00:00"), reason: "홀드 중 휴강" } });
  const r = await releaseHoldAt(db, e.id);
  const a = await activeRegular(e.id);
  check("10/16(휴강)을 피해 배치: 월 수 월 수 금 월", eq(a, ["2026-10-12", "2026-10-14", "2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26"]), JSON.stringify(a));
  check("정규 6개 유지, 같은 날짜 중복 없음, 휴강일에 수업 없음", a.length === 6 && new Set(a).size === 6 && !a.includes("2026-10-16"));
  check("같은 일수만 민 것 2건 + 연쇄 재배치 4건", r.shifted === 2 && r.relocated === 4, JSON.stringify(r));
  check("종료일은 실제 마지막 정규 수업 날짜(10/26)", (await endIso(e.id)) === "2026-10-26");
});
test("수강 홀드 해제: 평가서가 붙은 수업은 날짜 이동 없이 제자리에서 되살리고(평가서가 따라가지 않음), 보충수업은 같은 일수만 이동", async () => {
  await reset();
  const t = await mkTeacher();
  const sub = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 18, end: "2026-10-16" });
  const reg = await mkSeq(e, MWF_DATES);
  const supp = await db.classSession.create({ data: { siteId: 1, enrollmentId: e.id, studentId: s.id, teacherId: sub.id, scheduledAt: kst("2026-10-06", "15:00"), durationMin: 25, status: "SCHEDULED", isSupplement: true } });
  await putOnHold(e.id);
  await db.lessonEvaluation.create({ data: { classSessionId: reg[1].id, content: "pinned evaluation" } }); // 10/7 수업에 평가서
  const r = await releaseHoldAt(db, e.id);
  const pinned = await db.classSession.findUniqueOrThrow({ where: { id: reg[1].id } });
  check("평가서 붙은 수업: 제자리(10/7)에서 SCHEDULED, 평가서도 그 수업에 그대로", pinned.status === "SCHEDULED" && formatAppDate(pinned.scheduledAt) === "2026-10-07" && (await db.lessonEvaluation.count({ where: { classSessionId: reg[1].id } })) === 1 && r.pinned === 1);
  check("나머지 정규 5건은 한 주씩 이동", eq(await activeRegular(e.id), ["2026-10-07", "2026-10-12", "2026-10-16", "2026-10-19", "2026-10-21", "2026-10-23"]) && r.shifted === 5);
  const movedSupp = await db.classSession.findUniqueOrThrow({ where: { id: supp.id } });
  check("보충수업은 정규 시퀀스 밖 — 같은 7일 이동(10/13 15:00), SCHEDULED 복귀, 정규 회차에 섞이지 않음", movedSupp.status === "SCHEDULED" && movedSupp.isSupplement && movedSupp.scheduledAt.getTime() === kst("2026-10-13", "15:00").getTime() && r.supplements === 1 && (await activeRegular(e.id)).length === 6);
});
test("수강 홀드 해제: 밀린 날짜에 휴강 기록(LEAVE 묘비)이 있거나 강사 일정이 겹치면 다음 유효 슬롯으로", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 1, total: 4, end: "2026-10-07" });
  const [h1, h2] = await mkSeq(e, ["2026-10-05", "2026-10-07"]);
  void h1;
  void h2;
  // 같은 수강의 이전 연기 기록(LEAVE)이 10/12에 남아 있음 — 그 날짜는 이미 찬 슬롯
  await db.classSession.create({ data: { siteId: 1, enrollmentId: e.id, studentId: s.id, teacherId: t.id, scheduledAt: kst("2026-10-12"), durationMin: 25, status: "LEAVE", isSupplement: false, generationKey: `${e.id}:2026-10-12` } });
  // 같은 강사의 다른 학생이 10/14 20:00에 수업
  const other = await mkStudent();
  const e2 = await mkEnrollment({ teacherId: t.id, studentId: other.id, days: "수", months: 1, total: 1, end: "2026-10-14" });
  await mkSeq(e2, ["2026-10-14"]);
  await putOnHold(e.id);
  const r = await releaseHoldAt(db, e.id);
  const a = await activeRegular(e.id);
  check("첫 수업: 10/12(LEAVE 기록) 건너뜀 → 10/14는 강사 충돌 → 10/16, 둘째: 10/14 충돌 → 10/19", eq(a, ["2026-10-16", "2026-10-19"]) && r.relocated === 2 && r.shifted === 0, JSON.stringify({ a, r }));
  check("종료일은 마지막 정규 수업 날짜(10/19)", (await endIso(e.id)) === "2026-10-19");
});
test("동시성: 같은 수강 홀드를 동시에 두 번 해제 → 한 번만 이동", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 18, end: "2026-10-16" });
  await mkSeq(e, MWF_DATES);
  await putOnHold(e.id);
  const res = await Promise.all([releaseHoldAt(db, e.id), releaseHoldAt(dbB, e.id)]);
  check("한 쪽만 성공, 다른 쪽은 '현재 홀드 상태가 아닙니다'", res.filter((r) => !r.error).length === 1 && res.filter((r) => r.error === "현재 홀드 상태가 아닙니다.").length === 1, JSON.stringify(res));
  check("수업은 한 번만(7일) 이동, 종료일 10/23", eq(await activeRegular(e.id), ["2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19", "2026-10-21", "2026-10-23"]) && (await endIso(e.id)) === "2026-10-23");
});

// ── 수강 홀드 해제: 평가서/녹음이 붙은 수업은 제자리로 되살리기 전에 충돌을 검사한다(겹치면 전체 롤백) ─────────────────────────────────────
const releaseHoldCatching = async (client: PrismaClient, enrollmentId: number) => {
  try {
    return await releaseHoldAt(client, enrollmentId);
  } catch (e) {
    if (e instanceof HoldReleaseError) return { error: e.message };
    throw e;
  }
};
async function pinnedHoldSetup() {
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 18, end: "2026-10-16" });
  const reg = await mkSeq(e, MWF_DATES);
  await putOnHold(e.id);
  return { t, s, e, reg, pinnedSession: reg[1] /* 10/7 20:00 */ };
}
/** 해제가 거부된 뒤 아무것도 바뀌지 않았는지(수강은 홀드 그대로, 모든 수업은 HOLD + 원래 날짜) */
async function assertHoldUntouched(label: string, e: { id: number }, reg: { id: number; scheduledAt: Date }[]) {
  const enr = await db.enrollment.findUniqueOrThrow({ where: { id: e.id } });
  const rows = await db.classSession.findMany({ where: { enrollmentId: e.id }, orderBy: { id: "asc" } });
  check(
    `${label}: 롤백 — 수강은 HOLDING 그대로(시작 시각 유지, 종료일 10/16), 모든 수업은 HOLD + 원래 시각, 새 행 없음`,
    enr.status === "HOLDING" && enr.holdStartedAt?.getTime() === NOW.getTime() && (await endIso(e.id)) === "2026-10-16" && rows.length === reg.length && rows.every((r, i) => r.status === "HOLD" && r.scheduledAt.getTime() === reg[i].scheduledAt.getTime()),
  );
}

test("수강 홀드 해제: 평가서가 붙은 수업과 그 시각의 강사 일정이 겹치면 조용히 되살리지 않고 오류로 전체 롤백(평가서 연결 불변), 정리 후 재해제 성공", async () => {
  await reset();
  const { t, e, reg, pinnedSession } = await pinnedHoldSetup();
  const evaluation = await db.lessonEvaluation.create({ data: { classSessionId: pinnedSession.id, content: "kept evaluation" } });
  // 홀드 중에 같은 강사의 다른 학생이 10/7 20:00(= 평가서 붙은 수업의 시각)에 새 수업을 잡았다
  const other = await mkStudent();
  const e2 = await mkEnrollment({ teacherId: t.id, studentId: other.id, days: "수", months: 1, total: 1, end: "2026-10-07" });
  const [conflicting] = await mkSeq(e2, ["2026-10-07"]);
  const r = await releaseHoldCatching(db, e.id);
  check("강사 일정 충돌 → 명확한 오류(수업 시각과 사유 포함)", !!r.error && /평가서\/녹음이 연결된 수업\(2026-10-07 20:00\)/.test(r.error ?? "") && /담당 강사/.test(r.error ?? ""), r.error);
  await assertHoldUntouched("강사 충돌", e, reg);
  check("평가서 연결 불변: 같은 수업에 같은 평가서 1건, 다른 수업으로 이동/복사 없음", (await db.lessonEvaluation.count()) === 1 && (await db.lessonEvaluation.findUniqueOrThrow({ where: { classSessionId: pinnedSession.id } })).id === evaluation.id);
  check("충돌한 다른 일정도 그대로(건드리지 않음)", (await db.classSession.findUniqueOrThrow({ where: { id: conflicting.id } })).status === "SCHEDULED");
  // 충돌을 정리(그 일정을 지움)한 뒤 다시 해제하면 성공
  await db.classSession.delete({ where: { id: conflicting.id } });
  const ok = await releaseHoldCatching(db, e.id);
  const pinned = await db.classSession.findUniqueOrThrow({ where: { id: pinnedSession.id } });
  check("정리 후 재해제 성공: 평가서 수업은 제자리(10/7)에서 SCHEDULED, 평가서 그대로, 나머지 5건은 한 주씩 이동", !ok.error && ok.pinned === 1 && pinned.status === "SCHEDULED" && formatAppDate(pinned.scheduledAt) === "2026-10-07" && (await db.lessonEvaluation.count({ where: { classSessionId: pinnedSession.id } })) === 1 && ok.shifted === 5, JSON.stringify(ok));
  void reg;
});
test("수강 홀드 해제: 녹음만 붙은 수업도 pinned — 학생 본인의 다른 수업과 겹치면 오류로 롤백, 학원 휴강일이면 오류로 롤백, 녹음 연결 불변", async () => {
  await reset();
  const { s, e, reg, pinnedSession } = await pinnedHoldSetup();
  const rec = await db.audioRecording.create({ data: { classSessionId: pinnedSession.id, fileName: "x.m4a", driveFileId: "r2:recordings/3/x.m4a", aiDraft: "draft", processingStatus: "PUBLISHED" } });
  // (a) 같은 학생의 다른 수강(다른 강사)이 10/7 20:10에 수업 → 10/7 20:00~20:25와 겹친다
  const t2 = await mkTeacher();
  const e2 = await mkEnrollment({ teacherId: t2.id, studentId: s.id, days: "수", months: 1, total: 1, end: "2026-10-07" });
  const [studentClash] = await mkSeq(e2, ["2026-10-07"], "20:10");
  const r1 = await releaseHoldCatching(db, e.id);
  check("학생 일정 충돌 → 오류", !!r1.error && /학생의 다른 수업/.test(r1.error ?? ""), r1.error);
  await assertHoldUntouched("학생 충돌", e, reg);
  await db.classSession.delete({ where: { id: studentClash.id } });
  // (b) 홀드 중에 그 날(10/7)이 학원 휴강일로 등록됨
  await db.academyClosure.create({ data: { siteId: 1, date: kst("2026-10-07", "00:00"), reason: "홀드 중 휴강" } });
  const r2 = await releaseHoldCatching(db, e.id);
  check("학원 휴강일 → 오류", !!r2.error && /학원 휴강일/.test(r2.error ?? ""), r2.error);
  await assertHoldUntouched("휴강일", e, reg);
  const after = await db.audioRecording.findUniqueOrThrow({ where: { id: rec.id } });
  check("녹음 연결·내용 불변(같은 수업, aiDraft/상태/원본 키 그대로, 레코드 1건)", (await db.audioRecording.count()) === 1 && after.classSessionId === pinnedSession.id && after.aiDraft === "draft" && after.processingStatus === "PUBLISHED" && after.driveFileId === "r2:recordings/3/x.m4a");
  // 휴강을 지우면(되돌리면) 해제 가능
  await db.academyClosure.deleteMany();
  const ok = await releaseHoldCatching(db, e.id);
  check("충돌 해소 후 재해제 성공, 녹음 수업은 제자리", !ok.error && ok.pinned === 1 && (await db.classSession.findUniqueOrThrow({ where: { id: pinnedSession.id } })).status === "SCHEDULED" && (await db.audioRecording.findUniqueOrThrow({ where: { id: rec.id } })).classSessionId === pinnedSession.id, JSON.stringify(ok));
});

// ── 복합 연쇄 시나리오: 연기 → 대체 수업 재연기 → 평가서/녹음이 붙은 뒤쪽 수업 → 학생 연기 + 학원 휴강 supersede → 되돌리기 가능/불가능 ──────────
test("연쇄: 연기 → 대체 수업 재연기 → (평가서·녹음 있는 수업 보존) → 학생 연기 후 휴강 supersede → 되돌리기 차단/허용/복원", async () => {
  await reset();
  const t = await mkTeacher();
  const s = await mkStudent();
  const e = await mkEnrollment({ teacherId: t.id, studentId: s.id, days: "월수금", months: 3, total: 10, end: "2026-10-26" });
  const dates = ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26"];
  const ses = await mkSeq(e, dates);
  const at = (iso: string) => ses[dates.indexOf(iso)];
  // 10/14 수업은 이미 진행되어 평가서와 녹음(발행 완료)이 붙어 있다
  await db.classSession.update({ where: { id: at("2026-10-14").id }, data: { status: "COMPLETED" } });
  await db.lessonEvaluation.create({ data: { classSessionId: at("2026-10-14").id, content: "Evaluation of the 10/14 lesson." } });
  await db.audioRecording.create({ data: { classSessionId: at("2026-10-14").id, fileName: "l.m4a", driveFileId: "r2:recordings/7/l.m4a", aiDraft: "draft", processingStatus: "PUBLISHED" } });

  // 1) 10/7 수업(A) 관리자연기 → 대체 R1
  const r1 = await adminPostpone(db, at("2026-10-07").id);
  const R1 = r1.replacementSessionId!;
  // 2) 대체 수업 R1을 다시 연기 → R2
  const r2 = await adminPostpone(db, R1);
  const R2 = r2.replacementSessionId!;
  // 3) 10/12 수업을 학생이 연기 → R3 (학생 횟수 1)
  const r3 = await studentSelf(db, at("2026-10-12").id, s.id);
  const R3 = r3.replacementSessionId!;
  check("1~3단계: 대체 슬롯 10/28, 10/30, 11/2 (앞선 대체 수업이 찬 슬롯으로 취급됨)", [r1, r2, r3].map((r) => formatAppDate(r.replacementAt!)).join(",") === "2026-10-28,2026-10-30,2026-11-02");
  check("학생 연기 횟수 1(관리자연기는 차감 없음)", (await usage(e.id)) === 1);
  // 4) 학원 휴강 10/12(이미 학생이 연기한 날 → supersede), 10/16(예정 수업 있음 → 재배치 R4)
  const c12 = await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-12", reason: "휴강12", actor: ADMIN, now: NOW }));
  const c16 = await run(db, (tx) => registerAcademyClosure(tx, { siteId: 1, dateStr: "2026-10-16", reason: "휴강16", actor: ADMIN, now: NOW }));
  const lr4 = await db.leaveRequest.findFirstOrThrow({ where: { academyClosureId: c16.closureId } });
  const R4 = lr4.replacementSessionId!;
  check("휴강 10/12: supersede 1, 재배치 0 / 휴강 10/16: 재배치 1 → R4 11/4", c12.superseded === 1 && c12.rescheduled === 0 && c16.rescheduled === 1 && formatAppDate((await db.classSession.findUniqueOrThrow({ where: { id: R4 } })).scheduledAt) === "2026-11-04");

  // ── 정합성 ──
  const all = await db.classSession.findMany({ where: { enrollmentId: e.id } });
  const keys = all.map((x) => x.generationKey).filter((k): k is string => !!k);
  check("generationKey 중복 없음", new Set(keys).size === keys.length);
  check("정규 회차 수 유지(LEAVE 4건 제외 + 대체 수업 = 10), 보충과 섞이지 않음", (await activeRegular(e.id)).length === 10 && (await db.classSession.count({ where: { isSupplement: true } })) === 0 && (await db.enrollment.findUniqueOrThrow({ where: { id: e.id } })).totalSessions === 10);
  check("relatedSessionId 사슬: R1→A, R2→R1, R3→10/12 수업, R4→10/16 수업", (await db.classSession.findUniqueOrThrow({ where: { id: R1 } })).relatedSessionId === at("2026-10-07").id && (await db.classSession.findUniqueOrThrow({ where: { id: R2 } })).relatedSessionId === R1 && (await db.classSession.findUniqueOrThrow({ where: { id: R3 } })).relatedSessionId === at("2026-10-12").id && (await db.classSession.findUniqueOrThrow({ where: { id: R4 } })).relatedSessionId === at("2026-10-16").id);
  check("평가서/녹음은 원래 10/14 수업에만 있고 어떤 대체 수업으로도 이동/복사되지 않음", (await db.lessonEvaluation.count()) === 1 && (await db.audioRecording.count()) === 1 && (await db.lessonEvaluation.count({ where: { classSessionId: at("2026-10-14").id } })) === 1 && (await db.audioRecording.count({ where: { classSessionId: at("2026-10-14").id } })) === 1 && (await db.lessonEvaluation.count({ where: { classSessionId: { in: [R1, R2, R3, R4] } } })) === 0 && (await db.audioRecording.count({ where: { classSessionId: { in: [R1, R2, R3, R4] } } })) === 0);
  check("종료일 = 실제 마지막 정규 수업 날짜(11/4), 연장은 한 번씩만", (await endIso(e.id)) === "2026-11-04");
  check("학생 연기가 휴강으로 대체되어 횟수 0, 이력은 보존(source=STUDENT, final=ACADEMY_CLOSURE)", (await usage(e.id)) === 0 && (await db.leaveRequest.findUniqueOrThrow({ where: { id: r3.leaveRequestId } })).finalSource === "ACADEMY_CLOSURE");

  // ── 되돌리기: 차단 ──
  const snapshot = async () => JSON.stringify((await db.classSession.findMany({ where: { enrollmentId: e.id }, orderBy: { id: "asc" }, select: { id: true, status: true, scheduledAt: true } })).map((x) => [x.id, x.status, x.scheduledAt.toISOString()]));
  const before = await snapshot();
  check("후속 연기가 있는 대체 수업(R1)을 만든 연기(A)는 되돌릴 수 없음(REVERT_BLOCKED) — 아무것도 바뀌지 않음", (await codeOf(() => run(db, (tx) => revertReschedule(tx, r1.leaveRequestId)))) === "REVERT_BLOCKED" && (await snapshot()) === before);
  check("휴강으로 대체된 학생 연기는 개별로 되돌릴 수 없음(SUPERSEDED_BY_CLOSURE)", (await codeOf(() => run(db, (tx) => revertReschedule(tx, r3.leaveRequestId)))) === "SUPERSEDED_BY_CLOSURE" && (await snapshot()) === before);

  // ── 되돌리기: 허용(역순) ──
  await run(db, (tx) => revertReschedule(tx, r2.leaveRequestId)); // R2 삭제, R1 복귀
  check("R1의 재연기를 되돌림: R2 삭제, R1 다시 SCHEDULED, 정규 10개 유지, 종료일은 더 뒤의 연장(11/4) 그대로", (await db.classSession.count({ where: { id: R2 } })) === 0 && (await db.classSession.findUniqueOrThrow({ where: { id: R1 } })).status === "SCHEDULED" && (await activeRegular(e.id)).length === 10 && (await endIso(e.id)) === "2026-11-04");
  await run(db, (tx) => revertReschedule(tx, r1.leaveRequestId)); // 이제 가능: R1 삭제, A 복귀
  check("이제 A의 연기를 되돌릴 수 있음: R1 삭제, A SCHEDULED, 정규 10개", (await db.classSession.count({ where: { id: R1 } })) === 0 && (await db.classSession.findUniqueOrThrow({ where: { id: at("2026-10-07").id } })).status === "SCHEDULED" && (await activeRegular(e.id)).length === 10);
  await run(db, (tx) => revertAcademyClosure(tx, { closureId: c16.closureId, actor: ADMIN }));
  check("휴강 10/16 되돌림: R4 삭제, 10/16 수업 복귀, 종료일 11/2(남은 마지막 정규 수업)", (await db.classSession.count({ where: { id: R4 } })) === 0 && (await db.classSession.findUniqueOrThrow({ where: { id: at("2026-10-16").id } })).status === "SCHEDULED" && (await endIso(e.id)) === "2026-11-02");
  const rc = await run(db, (tx) => revertAcademyClosure(tx, { closureId: c12.closureId, actor: ADMIN }));
  check("휴강 10/12 되돌림: 학생 연기 복원(횟수 1) — 이중 복구 없음", rc?.restoredStudentPostponements === 1 && (await usage(e.id)) === 1);
  await run(db, (tx) => revertReschedule(tx, r3.leaveRequestId));
  check("학생 연기 되돌림: 모든 대체 수업 제거, 원래 10개 날짜 복원, 종료일 10/26, 횟수 0", eq(await activeRegular(e.id), [...dates].sort()) && (await db.classSession.count({ where: { enrollmentId: e.id } })) === 10 && (await endIso(e.id)) === "2026-10-26" && (await usage(e.id)) === 0);
  check("끝까지 평가서/녹음은 10/14 수업에 그대로 1건씩", (await db.lessonEvaluation.count({ where: { classSessionId: at("2026-10-14").id } })) === 1 && (await db.audioRecording.count({ where: { classSessionId: at("2026-10-14").id } })) === 1 && (await db.lessonEvaluation.count()) === 1);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  let code = 0;
  try {
    for (const [name, fn] of tests) {
      const before = failed;
      try {
        await fn();
      } catch (e) {
        failed++;
        console.log(`FAIL: [${name}] 예외 — ${(e as Error).stack?.split("\n").slice(0, 5).join(" | ") ?? String(e)}`);
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
