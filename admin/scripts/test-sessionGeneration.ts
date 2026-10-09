// 수업 생성(실행기/CLI/마이그레이션) 오프라인 검증 — DB 없이 도는 부분.
//  1) 계획기 확장: 시각 검증(단일 요일/classTimes), 휴강일 건너뛰기, 이미 생성된 수강, 계획 지문(planHash)
//  2) CLI 인자/쓰기 게이트, 실행기 범위 검증
//  3) 정적 안전 검사: 쓰기는 sessionGeneration.ts 한 곳, skipDuplicates 금지, 마이그레이션은 추가 전용, 화면에 생성 경로 없음
// DB가 필요한 검증(unique/동시성/롤백 등)은 scripts/test-sessionGeneration.integration.ts(실제 Postgres)가 맡는다.
// 실행(admin 디렉터리): npx tsx scripts/test-sessionGeneration.ts
import fs from "node:fs";
import path from "node:path";
import {
  PLANNER_VERSION,
  computePlanHash,
  countGenerationSessions,
  planClassSessions,
  type PlanEnrollmentInput,
  type PlanExistingSessionInput,
  type PlanInput,
  type PlanResult,
} from "../src/lib/sessionPlan";
import { GenerationGateError, FULL_MAX_ENROLLMENTS, PILOT_MAX_ENROLLMENTS, validateScope } from "../src/lib/sessionGeneration";
import { checkWriteGates, parseArgs, parseIdList } from "./lib/generationCli";
import { parseDbUrl } from "./lib/generationClient";

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
const throwsGate = (fn: () => unknown, code: string) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof GenerationGateError && e.code === code;
  }
};

const ASOF = new Date("2026-10-05T03:00:00+09:00"); // 월요일 03:00 KST
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
let nextId = 5000;
function enr(over: Partial<PlanEnrollmentInput> = {}): PlanEnrollmentInput {
  const id = over.id ?? nextId++;
  return {
    id,
    status: "ACTIVE",
    studentId: 9000 + id,
    studentName: `학생${id}`,
    studentAgentId: null,
    teacherId: 100 + id,
    teacherName: `강사${id}`,
    teacherAccountStatus: "ACTIVE",
    teacherApprovalStatus: "APPROVED",
    teacherAvailableHours: null,
    scheduleDays: "월",
    classTime: "19:00",
    classTimes: null,
    classDurationMin: 25,
    startDate: d("2026-10-05"),
    endDate: d("2026-11-02"),
    totalSessions: 5,
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...over,
  };
}
function plan(enrollments: PlanEnrollmentInput[], extra: Partial<PlanInput> = {}): PlanResult {
  return planClassSessions({ asOf: ASOF, enrollments, existingSessions: [] as PlanExistingSessionInput[], ...extra });
}
const row = (r: PlanResult, id: number) => r.rows.find((x) => x.enrollmentId === id)!;

// ---- 1. 시각 검증 ---------------------------------------------------------------------------------------------------
{
  const single = enr({ scheduleDays: "화" });
  const multi = enr({ scheduleDays: "월수금" });
  const multiPartial = enr({ scheduleDays: "월수금", classTimes: { "1": "19:00" } });
  const multiExplicit = enr({ scheduleDays: "월수금", classTimes: { "1": "19:00", "3": "19:30", "5": "20:00" } });
  const r = plan([single, multi, multiPartial, multiExplicit]);
  check("단일 요일 수강: SINGLE_WEEKDAY + 생성 대상", row(r, single.id).timeVerification === "SINGLE_WEEKDAY" && row(r, single.id).generationEligible === true);
  check("다요일 + classTimes 없음: ELIGIBLE이지만 UNVERIFIED + 생성 대상 아님", row(r, multi.id).outcome === "ELIGIBLE" && row(r, multi.id).timeVerification === "UNVERIFIED" && row(r, multi.id).generationEligible === false);
  check("다요일 + 일부 요일만 classTimes: UNVERIFIED", row(r, multiPartial.id).timeVerification === "UNVERIFIED" && !row(r, multiPartial.id).generationEligible);
  check("다요일 + 모든 요일에 classTimes: CLASS_TIMES_EXPLICIT + 생성 대상", row(r, multiExplicit.id).timeVerification === "CLASS_TIMES_EXPLICIT" && row(r, multiExplicit.id).generationEligible);
  check("요약: 생성 대상 2건, 시각 미검증 2건(세션 수 포함)", r.summary.generationEligible === 2 && r.summary.timeUnverifiedEnrollments === 2 && r.summary.timeUnverifiedSessions === row(r, multi.id).willCreateCount + row(r, multiPartial.id).willCreateCount);
  check("요약: generationSessions = 생성 대상 수강의 세션 합", r.summary.generationSessions === row(r, single.id).willCreateCount + row(r, multiExplicit.id).willCreateCount);
  check("countGenerationSessions = 생성 대상 수강의 계획 세션 수", countGenerationSessions(r.rows) === r.summary.generationSessions);
  const nonActive = enr({ status: "HOLDING" });
  check("ACTIVE가 아닌 수강은 시각 검증 대상 아님", row(plan([nonActive]), nonActive.id).timeVerification === "NOT_APPLICABLE" && !row(plan([nonActive]), nonActive.id).generationEligible);
  const conflictA = enr({ teacherId: 77, scheduleDays: "수" });
  const conflictB = enr({ teacherId: 77, scheduleDays: "수" });
  const rc = plan([conflictA, conflictB]);
  check("충돌 수강은 시각이 검증돼도 생성 대상 아님", row(rc, conflictA.id).outcome === "CONFLICT" && !row(rc, conflictA.id).generationEligible);
}

// ---- 2. 휴강일 --------------------------------------------------------------------------------------------------------
{
  const e = enr({ scheduleDays: "월", studentAgentId: 2, endDate: d("2026-11-02") }); // 10/5, 10/12, 10/19, 10/26, 11/2
  const closureDate = new Date("2026-10-12T00:00:00+09:00"); // AcademyClosure.date는 KST 자정 순간
  const company = row(plan([e], { closures: [{ date: closureDate, agentId: null }] }), e.id);
  check("본사(전체) 휴강일 슬롯은 만들지 않고 기록", company.skippedClosure.join() === "2026-10-12" && !company.plannedSessions.some((p) => p.date === "2026-10-12") && company.plannedSessions.length === 4);
  const sameAgent = row(plan([e], { closures: [{ date: closureDate, agentId: 2 }] }), e.id);
  check("같은 협력사 휴강은 적용", sameAgent.skippedClosure.join() === "2026-10-12");
  const otherAgent = row(plan([e], { closures: [{ date: closureDate, agentId: 3 }] }), e.id);
  check("다른 협력사 휴강은 적용하지 않음", otherAgent.skippedClosure.length === 0 && otherAgent.plannedSessions.length === 5);
  const unrelated = row(plan([e], { closures: [{ date: new Date("2026-10-13T00:00:00+09:00"), agentId: null }] }), e.id);
  check("수업일이 아닌 날짜의 휴강은 영향 없음", unrelated.skippedClosure.length === 0 && unrelated.plannedSessions.length === 5);
  const r = plan([e], { closures: [{ date: closureDate, agentId: null }] });
  check("요약: 휴강 건너뜀 집계, 종료일 연장 없음(마지막 세션은 그대로 11/2)", r.summary.sessionsSkipped.closure === 1 && company.plannedSessions.at(-1)?.date === "2026-11-02");
  const noAgentStudent = enr({ scheduleDays: "월", studentAgentId: null });
  const rn = row(plan([noAgentStudent], { closures: [{ date: closureDate, agentId: 2 }] }), noAgentStudent.id);
  check("협력사 소속 없는 학생(본사)은 협력사 휴강의 영향을 받지 않음", rn.skippedClosure.length === 0);
}

// ---- 2b. 승인된 강사 유급휴가일 ---------------------------------------------------------------------------------------
{
  const e = enr({ scheduleDays: "월", teacherId: 501, endDate: d("2026-11-02") }); // 10/5, 10/12, 10/19, 10/26, 11/2
  const otherTeacher = enr({ scheduleDays: "월", teacherId: 502, endDate: d("2026-11-02") });
  const noTeacher = enr({ scheduleDays: "월", teacherId: null, endDate: d("2026-11-02") });
  const leave = { teacherId: 501, date: d("2026-10-12") }; // TeacherPaidLeave.leaveDate(@db.Date): KST 달력 날짜를 UTC 자정으로 저장
  const withLeave = plan([e, otherTeacher, noTeacher], { teacherPaidLeaves: [leave] });
  const r1 = row(withLeave, e.id);
  check("승인된 유급휴가일(10/12)은 그 강사의 정규 수업 후보에서 제외되고 기록된다", r1.skippedPaidLeave.join() === "2026-10-12" && !r1.plannedSessions.some((p) => p.date === "2026-10-12") && r1.plannedSessions.length === 4);
  check("다른 강사의 수강은 영향 없음(5건 그대로)", row(withLeave, otherTeacher.id).skippedPaidLeave.length === 0 && row(withLeave, otherTeacher.id).plannedSessions.length === 5);
  check("담당 강사가 없는 수강은 영향 없음", row(withLeave, noTeacher.id).skippedPaidLeave.length === 0);
  check("요약: 유급휴가 건너뜀 집계 + 총합에 포함, 종료일은 연장하지 않음(마지막 11/2)", withLeave.summary.sessionsSkipped.paidLeave === 1 && withLeave.summary.sessionsSkipped.total === withLeave.summary.sessionsSkipped.pastDates + withLeave.summary.sessionsSkipped.startedToday + withLeave.summary.sessionsSkipped.closure + withLeave.summary.sessionsSkipped.paidLeave + withLeave.summary.sessionsSkipped.alreadyExisting + withLeave.summary.sessionsSkipped.withheldByConflict && r1.plannedSessions.at(-1)?.date === "2026-11-02");
  const without = plan([e, otherTeacher, noTeacher]);
  check("계획 지문이 달라진다 — 미리보기 뒤에 승인된 유급휴가가 있으면 옛 지문으로는 실행할 수 없다", computePlanHash(without.rows) !== computePlanHash(withLeave.rows));
  const rWithout = row(without, e.id);
  check("유급휴가가 없으면 기존 결과 그대로(5건, 기록 없음)", rWithout.skippedPaidLeave.length === 0 && rWithout.plannedSessions.length === 5);
  const both = row(plan([e], { closures: [{ date: new Date("2026-10-12T00:00:00+09:00"), agentId: null }], teacherPaidLeaves: [leave] }), e.id);
  check("휴강일과 유급휴가일이 같은 날이면 한 번만 기록(휴강 우선)", both.skippedClosure.join() === "2026-10-12" && both.skippedPaidLeave.length === 0 && both.plannedSessions.length === 4);
  const nonClassDay = row(plan([e], { teacherPaidLeaves: [{ teacherId: 501, date: d("2026-10-13") }] }), e.id);
  check("수업일이 아닌 날짜의 유급휴가는 영향 없음", nonClassDay.skippedPaidLeave.length === 0 && nonClassDay.plannedSessions.length === 5);
  check("계획기 버전이 session-plan/3 이상(규칙이 바뀌어 옛 지문과 섞이지 않음)", Number(PLANNER_VERSION.split("/")[1]) >= 3);
}

// ---- 3. 이미 생성된 수강 / 휴강일·이미 시작 슬롯 우선순위 ---------------------------------------------------------------
{
  const e = enr({ scheduleDays: "월" });
  const r = row(plan([e], { alreadyGeneratedEnrollmentIds: [e.id] }), e.id);
  check("이미 생성 배치가 있던 수강: 제외(ALREADY_GENERATED), 세션 계획 없음", r.outcome === "EXCLUDED" && r.reasons.includes("ALREADY_GENERATED") && r.plannedSessions.length === 0 && !r.generationEligible);
  const sameDay = enr({ scheduleDays: "월", endDate: d("2026-10-12") });
  const closed = plan([sameDay], { asOf: new Date("2026-10-05T21:00:00+09:00"), closures: [{ date: new Date("2026-10-12T00:00:00+09:00"), agentId: null }] });
  const cr = row(closed, sameDay.id);
  check("오늘 시작한 슬롯 + 휴강일 슬롯만 남으면 만들 것 없음(NO_FUTURE_SLOTS), 각각 기록", cr.outcome === "EXCLUDED" && cr.reasons.includes("NO_FUTURE_SLOTS") && cr.skippedStartedToday.join() === "2026-10-05" && cr.skippedClosure.join() === "2026-10-12");
}

// ---- 4. 계획 지문 ------------------------------------------------------------------------------------------------------
{
  const a = enr({ id: 7001, scheduleDays: "화" });
  const b = enr({ id: 7002, scheduleDays: "목", classDurationMin: 50 });
  const h1 = computePlanHash(plan([a, b]).rows);
  check("planHash는 64자 hex", /^[0-9a-f]{64}$/.test(h1));
  check("같은 입력 → 같은 지문", h1 === computePlanHash(plan([a, b]).rows));
  check("입력 순서가 달라도 같은 지문", h1 === computePlanHash(plan([b, a]).rows));
  check("수업 시각이 바뀌면 지문이 바뀜", h1 !== computePlanHash(plan([{ ...a, classTime: "19:30" }, b]).rows));
  check("수업 길이가 바뀌면 지문이 바뀜", h1 !== computePlanHash(plan([a, { ...b, classDurationMin: 25 }]).rows));
  check("강사가 바뀌면 지문이 바뀜", h1 !== computePlanHash(plan([{ ...a, teacherId: 4242 }, b]).rows));
  check("수강 updatedAt이 바뀌면 지문이 바뀜(stale 감지)", h1 !== computePlanHash(plan([{ ...a, updatedAt: new Date("2026-10-04T00:00:00Z") }, b]).rows));
  check("종료일이 줄면(세션이 줄면) 지문이 바뀜", h1 !== computePlanHash(plan([{ ...a, endDate: d("2026-10-20") }, b]).rows));
  check("asOf가 바뀌어 오늘 슬롯이 빠지면 지문이 바뀜", h1 !== computePlanHash(plan([a, b], { asOf: new Date("2026-10-06T21:00:00+09:00") }).rows));
  const withConflict = computePlanHash(plan([a, { ...b, id: 7003, teacherId: a.teacherId, scheduleDays: "화" }]).rows);
  check("충돌 발생(결과 변화)도 지문에 반영", withConflict !== h1);
  const verifiedFlip = computePlanHash(plan([{ ...enr({ id: 7010, scheduleDays: "월수" }) }]).rows) !== computePlanHash(plan([{ ...enr({ id: 7010, scheduleDays: "월수", classTimes: { "1": "19:00", "3": "19:00" } }) }]).rows);
  check("시각 검증 상태가 바뀌면 지문이 바뀜", verifiedFlip);
  check("지문에 계획기 버전이 들어감", typeof PLANNER_VERSION === "string" && PLANNER_VERSION.length > 0);
}

// ---- 5. 실행기 범위 검증 -----------------------------------------------------------------------------------------------
check("PILOT 최대 5건 / FULL 최대 500건", PILOT_MAX_ENROLLMENTS === 5 && FULL_MAX_ENROLLMENTS === 500);
check("PILOT 5건은 허용, 오름차순 정렬", eq(validateScope("PILOT", [5, 3, 1, 4, 2]), [1, 2, 3, 4, 5]));
check("PILOT 6건은 거부(TOO_MANY_ENROLLMENTS)", throwsGate(() => validateScope("PILOT", [1, 2, 3, 4, 5, 6]), "TOO_MANY_ENROLLMENTS"));
check("빈 허용 목록 거부", throwsGate(() => validateScope("FULL", []), "INVALID_SCOPE"));
check("중복 id 거부", throwsGate(() => validateScope("FULL", [1, 1]), "INVALID_SCOPE"));
check("0/음수/소수/int4 초과 id 거부", [[0], [-1], [1.5], [2147483648], [Number.NaN]].every((ids) => throwsGate(() => validateScope("FULL", ids as number[]), "INVALID_SCOPE")));
check("알 수 없는 모드 거부", throwsGate(() => validateScope("WAVE" as never, [1]), "INVALID_SCOPE"));
check("FULL 501건 거부", throwsGate(() => validateScope("FULL", Array.from({ length: 501 }, (_, i) => i + 1)), "TOO_MANY_ENROLLMENTS"));

// ---- 6. CLI 인자 / 쓰기 게이트 ----------------------------------------------------------------------------------------
{
  const HASH = "a".repeat(64);
  const full = [
    "--mode=pilot",
    "--enrollment-ids=34292,34237",
    "--as-of=2026-10-05T10:00:00.000Z",
    `--expect-plan-hash=${HASH}`,
    "--expect-sessions=16",
    "--confirm=GENERATE",
    "--expect-db-host=db.example.test",
    "--actor-admin-id=1",
  ];
  const okEnv = { ALLOW_SESSION_GENERATION: "yes" };
  const preview = parseArgs(["--enrollment-ids=1,2"]);
  check("기본 모드는 preview(읽기 전용)", preview.mode === "preview" && checkWriteGates(preview, {}, "h").length === 0);
  check("preview는 게이트 없이 가능하지만 인자 오류는 잡음", parseArgs(["--bogus=1"]).unknown.includes("--bogus"));
  check("모든 게이트를 갖춘 pilot은 통과", checkWriteGates(parseArgs(full), okEnv, "db.example.test").length === 0);
  const none = checkWriteGates(parseArgs(["--mode=pilot"]), {}, "db.example.test");
  check("게이트가 전부 빠지면 전부 보고(env/confirm/host/actor/목록/as-of/hash/세션 수)", none.length === 8, JSON.stringify(none));
  check("ALLOW 환경변수가 없으면 거부", checkWriteGates(parseArgs(full), {}, "db.example.test").some((m) => m.includes("ALLOW_SESSION_GENERATION")));
  check("ALLOW=no 같은 값도 거부", checkWriteGates(parseArgs(full), { ALLOW_SESSION_GENERATION: "true" }, "db.example.test").length === 1);
  check("confirm이 다르면 거부", checkWriteGates(parseArgs(full.map((a) => a.replace("GENERATE", "yes"))), okEnv, "db.example.test").some((m) => m.includes("--confirm=GENERATE")));
  check("DB 호스트가 다르면 거부(다른 DB 실수 실행 방지)", checkWriteGates(parseArgs(full), okEnv, "other-host").some((m) => m.includes("--expect-db-host")));
  check("planHash 형식이 틀리면 거부", checkWriteGates(parseArgs(full.map((a) => (a.startsWith("--expect-plan-hash") ? "--expect-plan-hash=abc" : a))), okEnv, "db.example.test").length === 1);
  check("as-of가 올바르지 않으면 거부", checkWriteGates(parseArgs(full.map((a) => (a.startsWith("--as-of") ? "--as-of=어제" : a))), okEnv, "db.example.test").length === 1);
  check("actor-admin-id가 없으면 거부", checkWriteGates(parseArgs(full.filter((a) => !a.startsWith("--actor"))), okEnv, "db.example.test").some((m) => m.includes("actor-admin-id")));
  const rbDry = parseArgs(["--rollback=abc"]);
  check("롤백 미리보기는 게이트 불필요, --apply는 ROLLBACK 확인 등 필요", rbDry.mode === "rollback" && checkWriteGates(rbDry, {}, "h").length === 0 && checkWriteGates(parseArgs(["--rollback=abc", "--apply"]), {}, "h").length >= 3);
  check("롤백 --apply 게이트 충족 시 통과", checkWriteGates(parseArgs(["--rollback=abc", "--apply", "--confirm=ROLLBACK", "--expect-db-host=h", "--actor-admin-id=1"]), okEnv, "h").length === 0);
  check("롤백은 GENERATE 확인으로 통과하지 못함", checkWriteGates(parseArgs(["--rollback=abc", "--apply", "--confirm=GENERATE", "--expect-db-host=h", "--actor-admin-id=1"]), okEnv, "h").length === 1);
  check("release-lock은 쓰기 게이트 필요", checkWriteGates(parseArgs(["--release-lock=abc"]), {}, "h").length >= 3);
  check("id 목록 파싱: 쉼표/공백/줄바꿈", eq(parseIdList("1, 2\n3 4"), [1, 2, 3, 4]));
  check("id 목록 파싱: 선행 0/문자/음수는 오류", ["01", "1a", "-1", "0"].every((t) => { try { parseIdList(t); return false; } catch { return true; } }));
  const u = parseDbUrl("postgresql://u:p@host.test:5432/dbname?schema=gentest_abc&sslmode=require");
  check("DB URL 파싱: schema 분리, 호스트/DB명 추출(비밀번호는 노출 안 함)", u.schema === "gentest_abc" && u.host === "host.test" && u.database === "dbname" && !u.connectionString.includes("schema="));
}

// ---- 7. 정적 안전 검사 ------------------------------------------------------------------------------------------------
const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
{
  const walk = (dir: string, out: string[] = []) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "generated" || ent.name === "node_modules" || ent.name === ".next") continue;
        walk(p, out);
      } else if (/\.(ts|tsx)$/.test(ent.name)) out.push(path.relative(root, p).split(path.sep).join("/"));
    }
    return out;
  };
  const srcFiles = walk(path.join(root, "src"));

  // 세션 생성/삭제와 배치 기록의 쓰기는 sessionGeneration.ts 한 곳에서만(기존 수동/보충/휴강/홀드 경로 제외).
  const GENERATION_WRITES = /sessionGenerationBatch(Item)?\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|generationKey|generationBatchId:\s*(batchId|\w+\.id)/;
  const writers = srcFiles.filter((f) => GENERATION_WRITES.test(strip(read(f))));
  check(
    "배치/생성 키를 쓰는 소스는 실행기와 읽기 전용 로더/화면뿐",
    writers.every((f) => ["src/lib/sessionGeneration.ts", "src/lib/sessionPlanData.ts", "src/app/(admin)/session-plan/page.tsx", "src/app/(admin)/enrollments/[id]/edit/page.tsx", "src/lib/sessionPlan.ts", "src/lib/reschedule.ts"].includes(f)),
    writers.join(", "),
  );
  const batchWriters = srcFiles.filter((f) => /sessionGenerationBatch(Item)?\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(strip(read(f))));
  check("배치 테이블에 쓰는 소스는 sessionGeneration.ts 하나", eq(batchWriters, ["src/lib/sessionGeneration.ts"]), batchWriters.join(", "));
  const importers = srcFiles.filter((f) => f !== "src/lib/sessionGeneration.ts" && /sessionGeneration["']/.test(read(f)));
  check("sessionGeneration은 웹 서버 코드(src)에서 import되지 않음 — CLI/테스트만 사용", importers.length === 0, importers.join(", "));

  const gen = strip(read("src/lib/sessionGeneration.ts"));
  check("실행기는 createMany를 skipDuplicates 없이 호출(예상 밖 중복은 조용히 성공하지 않음)", /classSession\.createMany\(\{ data \}\)/.test(gen) && !/skipDuplicates/.test(gen));
  check("실행기는 생성 건수가 예상과 다르면 트랜잭션을 실패시킴(CountMismatchError)", /res\.count !== data\.length\) throw new CountMismatchError/.test(gen));
  check("실행기: advisory lock(강사→수강 순서) + 배치 single-flight(activeLock) + 락 안 재계획", /pg_advisory_xact_lock\(\$\{LOCK_NS_TEACHER\}/.test(gen) && gen.indexOf("LOCK_NS_TEACHER}::int") < gen.indexOf("LOCK_NS_ENROLLMENT}::int") && /activeLock: ACTIVE_LOCK_VALUE/.test(gen) && /planClassSessions\(await loadSessionPlanInput\(tx, asOf\)\)/.test(gen));
  check("실행기: 게이트(asOf 나이/날짜, planHash, 예상 세션 수, 슬롯이 지금 이후)", ["ASOF_TOO_OLD", "ASOF_DATE_MISMATCH", "PLAN_HASH_MISMATCH", "EXPECTED_SESSIONS_MISMATCH", "SLOT_NOT_AFTER_NOW", "PILOT_REQUIRES_ELIGIBLE"].every((c) => gen.includes(c)));
  check("실행기: 충돌/비활성/시각 미검증/제외/stale을 항목으로 기록", ["CONFLICT", "INACTIVE_TEACHER", "TIME_UNVERIFIED", "EXCLUDED", "STALE", "ALREADY_GENERATED", "EXISTING_SESSIONS"].every((c) => gen.includes(`"${c}"`)));
  check("실행기는 휴강/홀드/수강 수정 로직을 import하지 않음", !/leaveApply|holdApply|createAcademyClosure|enrollments\/actions/.test(gen));
  {
    // 펜싱: 실행기의 모든 쓰기 트랜잭션은 assertLease로 시작하고, 수강 트랜잭션에서는 advisory lock보다 먼저다.
    const genTx = gen.slice(gen.indexOf("async function generateOneEnrollment"), gen.indexOf("export async function releaseStaleBatchLock"));
    check(
      "펜싱: 수강 트랜잭션은 임대 확인(assertLease) → advisory lock 순서, 항목 기록/배치 마무리도 임대 확인 후",
      genTx.indexOf("await assertLease(tx, batchId, leaseOwner)") >= 0 && genTx.indexOf("await assertLease(tx, batchId, leaseOwner)") < genTx.indexOf("pg_advisory_xact_lock") && (gen.match(/await assertLease\(tx, batchId, leaseOwner\)/g) ?? []).length === 3,
    );
    const rel = gen.slice(gen.indexOf("export async function releaseStaleBatchLock"), gen.indexOf("export async function rollbackGeneration"));
    check("잠금 해제는 시작 시각이 아니라 heartbeat 기준 조건부 갱신(RUNNING + heartbeatAt < cutoff)", /heartbeatAt: \{ lt: cutoff \}/.test(rel) && !/startedAt/.test(rel));
  }
  check("롤백은 SCHEDULED + 미래 + 연결 없음 + 배치 이후 미수정 세션만 삭제", /status: "SCHEDULED", deletedAt: null/.test(gen) && ["HAS_EVALUATION", "HAS_LEAVE_REQUEST", "HAS_RECORDING", "MODIFIED_AFTER_BATCH", "NOT_IN_FUTURE"].every((c) => gen.includes(c)));

  const cli = strip(read("scripts/generate-sessions.ts"));
  check("CLI는 쓰기 전에 checkWriteGates를 호출하고 실패하면 종료", cli.indexOf("checkWriteGates(") > 0 && cli.indexOf("checkWriteGates(") < cli.indexOf("createGenerationClient(url)") && /return 2;/.test(cli));
  const cliLib = strip(read("scripts/lib/generationCli.ts"));
  check("CLI 게이트에 ALLOW 환경변수/확인 문구/DB 호스트/관리자 id/해시가 포함", ["ALLOW_SESSION_GENERATION", "GENERATE", "ROLLBACK", "expect-db-host", "actor-admin-id", "expect-plan-hash"].every((k) => cliLib.includes(k)));

  const page = strip(read("src/app/(admin)/session-plan/page.tsx"));
  check("관리자 화면에는 생성 경로가 없음(서버 액션/폼/실행기 import 없음)", !/"use server"|<form|lib\/sessionGeneration|executeGeneration|rollbackGeneration|createMany/.test(page));
  const edit = strip(read("src/app/(admin)/enrollments/[id]/edit/page.tsx"));
  check("수강 수정 화면은 생성된 수업 안내만(읽기 전용 count)", /generationBatchId: \{ not: null \}/.test(edit) && !/classSession\.(create|update|delete)/.test(edit));
}
{
  const sql = read("prisma/migrations/20261005120000_add_session_generation/migration.sql");
  const statements = sql.split(";").map((x) => x.replace(/--.*$/gm, "").trim()).filter(Boolean);
  const allowed = /^(CREATE TYPE "\w+" AS ENUM|CREATE TABLE "(session_generation_batches|session_generation_batch_items)"|CREATE (UNIQUE )?INDEX "\w+" ON "(class_sessions|session_generation_batches|session_generation_batch_items)"|ALTER TABLE "class_sessions" ADD COLUMN|ALTER TABLE "(class_sessions|session_generation_batch_items)" ADD CONSTRAINT "\w+" FOREIGN KEY)/;
  check("마이그레이션은 추가 전용(타입/새 테이블/인덱스/nullable 컬럼/FK만)", statements.every((st) => allowed.test(st)), statements.filter((st) => !allowed.test(st)).map((x) => x.slice(0, 50)).join(" | "));
  check("마이그레이션에 DROP/TRUNCATE/DELETE/UPDATE/INSERT/RENAME/ALTER COLUMN 없음", !/\b(DROP|TRUNCATE|DELETE FROM|UPDATE\s+"|INSERT INTO|RENAME|ALTER COLUMN|SET NOT NULL)\b/i.test(sql));
  const addCols = statements.filter((st) => /ALTER TABLE "class_sessions" ADD COLUMN/.test(st)).join(" ");
  check("class_sessions에 추가되는 컬럼은 nullable(generationKey, generationBatchId)", /"generationBatchId" TEXT/.test(addCols) && /"generationKey" TEXT/.test(addCols) && !/NOT NULL/.test(addCols));
  check("generationKey unique 인덱스 + activeLock unique 인덱스 존재", /CREATE UNIQUE INDEX "class_sessions_generationKey_key" ON "class_sessions"\("generationKey"\)/.test(sql) && /CREATE UNIQUE INDEX "session_generation_batches_activeLock_key"/.test(sql));
  check("class_sessions → 배치 FK는 RESTRICT(배치 이력 보존)", /class_sessions_generationBatchId_fkey[\s\S]*?ON DELETE RESTRICT/.test(sql));
  const schema = read("prisma/schema.prisma");
  check("schema: generationKey는 nullable unique, 부분/표현식 인덱스 없음", /generationKey\s+String\?\s+@unique/.test(schema) && !/@@unique\(\[enrollmentId, scheduledAt\]\)/.test(schema));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
