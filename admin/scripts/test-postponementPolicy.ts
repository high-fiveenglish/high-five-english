// 연기/보충/유급휴가 정책의 순수 계산 검증 — 오프라인(DB/네트워크 없음).
//  1) 학생 연기 횟수(quota): 주 2/3/5회 × 등록 개월, 그 밖의 횟수 0, 관리자 가감, 사용량보다 낮게 못 줄임
//  2) 학생 직접 연기의 2시간 제한(경계값), KST
//  3) 사용 횟수 계산(학생 연기만, 학원 휴강으로 대체되면 0, 옛 데이터 호환)
//  4) 정규/보충 분리 집계: 20+1=21, 19+1 → 정규 잔여 1
//  5) 유급휴가: 반기 5회/연 10회 한도, 6개월 경계, 사후 승인은 관리자만, 급여 = 레이트×8 (학생 수와 무관)
//  6) 강사 급여: 일반 LEAVE 0원, 유급휴가 1건 1회, 그날 수업 수와 무관
//  7) 평가 상태 판정(AI 처리 중 / 평가서 있음 / 없음)
//  8) 정적 검사: 학생 직접 연기만 2시간 제한을 쓰고, 관리자 경로는 쓰지 않으며, 관리자가 누르는 학생 연기도 source=STUDENT_POSTPONEMENT
// 실행(admin 디렉터리): npx tsx scripts/test-postponementPolicy.ts
import fs from "node:fs";
import path from "node:path";
import {
  LEAVE_QUOTA_PER_MONTH,
  checkQuotaAdjustment,
  checkStudentLeadTime,
  policyLeaveQuota,
  summarizeLeaveQuota,
  usedFromLeaveRows,
  weeklyLessonCount,
  type LeaveUsageRow,
} from "../src/lib/leavePolicy";
import { countLessons, type CountableSession } from "../src/lib/lessonCounts";
import { checkPaidLeaveApprovalTiming, checkPaidLeaveQuota, paidLeavePay, paidLeavePeriod } from "../src/lib/paidLeavePolicy";
import { classSessionPay, paidLeaveStatRow, summarizeStatRows, type TeacherStatRow } from "../src/lib/teacherStats";
import { evaluationStateOf } from "../src/lib/reschedule";

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
const kst = (s: string) => new Date(`${s}+09:00`);

// ── 1) 학생 연기 횟수 ─────────────────────────────────────────────────────────────────────────────────────────
{
  check("주 2회 × 3개월 = 3회", policyLeaveQuota({ scheduleDays: "화목", packageMonths: 3 }) === 3);
  check("주 3회 × 3개월 = 6회", policyLeaveQuota({ scheduleDays: "월수금", packageMonths: 3 }) === 6);
  check("주 5회 × 3개월 = 9회", policyLeaveQuota({ scheduleDays: "월화수목금", packageMonths: 3 }) === 9);
  check("주 2회 × 1개월 = 1회 / × 6개월 = 6회", policyLeaveQuota({ scheduleDays: "월목", packageMonths: 1 }) === 1 && policyLeaveQuota({ scheduleDays: "월목", packageMonths: 6 }) === 6);
  for (const [days, label] of [["월", 1], ["월화수목", 4], ["월화수목금토", 6], ["월화수목금토일", 7]] as const) {
    check(`주 ${label}회는 정책상 학생 연기 0회(임의 값을 적용하지 않음)`, policyLeaveQuota({ scheduleDays: days, packageMonths: 3 }) === 0);
  }
  check("정책표는 2/3/5회만", eq(Object.keys(LEAVE_QUOTA_PER_MONTH).sort(), ["2", "3", "5"]));
  check("같은 요일 글자가 겹쳐도 서로 다른 요일 수로 센다", weeklyLessonCount("월월수") === 2);
  check("등록 개월 수가 이상하면(0, 음수, NaN) 0회", policyLeaveQuota({ scheduleDays: "월수금", packageMonths: 0 }) === 0 && policyLeaveQuota({ scheduleDays: "월수금", packageMonths: -2 }) === 0 && policyLeaveQuota({ scheduleDays: "월수금", packageMonths: Number.NaN }) === 0);

  // 등록기간 전체 기준 — 첫 달에 다 써도 된다(월별 reset이 없다)
  const s0 = summarizeLeaveQuota({ scheduleDays: "화목", packageMonths: 3, adminAdjustment: 0, usedCount: 0 });
  const s3 = summarizeLeaveQuota({ scheduleDays: "화목", packageMonths: 3, adminAdjustment: 0, usedCount: 3 });
  check("주2×3개월: 첫 달에 3회를 모두 써도 허용 범위(남은 0)", s0.effectiveQuota === 3 && s0.remainingCount === 3 && s3.remainingCount === 0 && s3.usedCount === 3);
  check("quota 초과: 사용량이 effective와 같으면 남은 횟수 0(더 못 씀)", s3.remainingCount === 0);

  // 관리자 가감
  const plus = summarizeLeaveQuota({ scheduleDays: "화목", packageMonths: 3, adminAdjustment: 2, usedCount: 4 });
  check("관리자 +2: policy 3 + 2 = effective 5, 4회 사용, 남은 1", plus.policyQuota === 3 && plus.adminAdjustment === 2 && plus.effectiveQuota === 5 && plus.remainingCount === 1);
  const minus = summarizeLeaveQuota({ scheduleDays: "화목", packageMonths: 3, adminAdjustment: -1, usedCount: 1 });
  check("관리자 -1: effective 2, 남은 1", minus.effectiveQuota === 2 && minus.remainingCount === 1);
  check("가감해도 effective는 0 미만이 되지 않음", summarizeLeaveQuota({ scheduleDays: "월", packageMonths: 3, adminAdjustment: -5, usedCount: 0 }).effectiveQuota === 0);
  check("가감 검사: 사용량(4)보다 낮게(effective 2) 설정하면 차단", eq(checkQuotaAdjustment({ policyQuota: 3, newAdjustment: -1, usedCount: 4 }), { ok: false, error: "BELOW_USED", effectiveQuota: 2 }));
  check("가감 검사: 사용량과 같게는 허용", checkQuotaAdjustment({ policyQuota: 3, newAdjustment: 1, usedCount: 4 }).ok === true);
  check("가감 검사: 결과가 음수면 차단", eq(checkQuotaAdjustment({ policyQuota: 1, newAdjustment: -2, usedCount: 0 }), { ok: false, error: "NEGATIVE_QUOTA", effectiveQuota: -1 }));
}

// ── 2) 2시간 제한 ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const cls = kst("2026-10-09T20:00:00");
  check("2시간 10분 전 → 허용", checkStudentLeadTime(cls, kst("2026-10-09T17:50:00")).ok === true);
  check("정확히 2시간 전(>= 2시간) → 허용", checkStudentLeadTime(cls, kst("2026-10-09T18:00:00")).ok === true);
  check("1시간 59분 59초 전 → TOO_LATE", eq(checkStudentLeadTime(cls, kst("2026-10-09T18:00:01")), { ok: false, error: "TOO_LATE" }));
  check("1시간 59분 전 → TOO_LATE", eq(checkStudentLeadTime(cls, kst("2026-10-09T18:01:00")), { ok: false, error: "TOO_LATE" }));
  check("수업 시작 직전 → TOO_LATE", eq(checkStudentLeadTime(cls, kst("2026-10-09T19:59:59")), { ok: false, error: "TOO_LATE" }));
  check("정확히 시작 시각 → 이미 시작", eq(checkStudentLeadTime(cls, kst("2026-10-09T20:00:00")), { ok: false, error: "ALREADY_STARTED" }));
  check("지난 수업 → 이미 시작", eq(checkStudentLeadTime(cls, kst("2026-10-10T09:00:00")), { ok: false, error: "ALREADY_STARTED" }));
  // KST 기준: 같은 순간을 UTC 표기로 줘도 결과가 같다(서버 시간대와 무관)
  check("UTC로 표기한 같은 순간도 동일 판정", checkStudentLeadTime(new Date("2026-10-09T11:00:00Z"), new Date("2026-10-09T09:00:00Z")).ok === true);
}

// ── 3) 사용 횟수: 학생 연기만, 학원 휴강 대체 시 복구, 옛 데이터 호환 ─────────────────────────────────────────────
{
  const row = (over: Partial<LeaveUsageRow>): LeaveUsageRow => ({ status: "APPROVED", quotaImpact: 0, source: null, requestedByRole: "ADMIN", academyClosureId: null, ...over });
  const student = row({ source: "STUDENT_POSTPONEMENT", quotaImpact: 1, requestedByRole: "STUDENT" });
  const adminAsStudent = row({ source: "STUDENT_POSTPONEMENT", quotaImpact: 1, requestedByRole: "STUDENT" }); // 관리자가 학생 대신 실행해도 source는 STUDENT_POSTPONEMENT
  const adminPost = row({ source: "ADMIN_POSTPONEMENT", quotaImpact: 0 });
  const hold = row({ source: "TEACHER_HOLD", requestedByRole: "TEACHER" });
  const closure = row({ source: "ACADEMY_CLOSURE", academyClosureId: 5 });
  const paid = row({ source: "PAID_LEAVE" });
  const superseded = row({ source: "STUDENT_POSTPONEMENT", quotaImpact: 0, requestedByRole: "STUDENT" }); // 학원 휴강으로 대체 → 횟수 0
  check("학생 연기와 관리자가 대신 실행한 학생 연기만 횟수를 쓴다", usedFromLeaveRows([student, adminAsStudent, adminPost, hold, closure, paid]) === 2);
  check("관리자연기/강사 홀드/학원 휴강/유급휴가는 학생 횟수를 쓰지 않는다", usedFromLeaveRows([adminPost, hold, closure, paid]) === 0);
  check("학원 휴강으로 대체된 학생 연기는 횟수에서 빠진다(복구)", usedFromLeaveRows([student, superseded]) === 1);
  check("승인되지 않은(PENDING/REJECTED) 건은 세지 않는다", usedFromLeaveRows([row({ status: "PENDING", source: "STUDENT_POSTPONEMENT", quotaImpact: 1 }), row({ status: "REJECTED", source: "STUDENT_POSTPONEMENT", quotaImpact: 1 })]) === 0);
  check("옛 데이터(source 없음): 학생 신청은 1회, 관리자/학원 휴강 건은 0회", usedFromLeaveRows([row({ requestedByRole: "STUDENT" }), row({ requestedByRole: "ADMIN" }), row({ requestedByRole: "ADMIN", academyClosureId: 3 }), row({ requestedByRole: "STUDENT", academyClosureId: 3 })]) === 1);
  // 같은 행을 두 번 대체/복원해도(행 값이 같으면) 계산이 이중으로 변하지 않는다 — 카운터가 아니라 행에서 계산하기 때문이다.
  check("행에서 계산하므로 복구가 이중으로 일어나지 않음(대체 행을 두 번 넣어도 합이 변하지 않음)", usedFromLeaveRows([superseded, superseded]) === 0);
}

// ── 4) 정규/보충 분리 집계 ────────────────────────────────────────────────────────────────────────────────────
{
  const reg = (status: string): CountableSession => ({ status, isSupplement: false });
  const sup = (status: string): CountableSession => ({ status, isSupplement: true });
  const mk = (n: number, st: string, supp = false) => Array.from({ length: n }, () => (supp ? sup(st) : reg(st)));

  const a = countLessons([...mk(19, "COMPLETED"), ...mk(1, "SCHEDULED"), ...mk(1, "COMPLETED", true)], 20);
  check("정규 20 중 19 완료 + 보충 1 완료 → 정규 잔여 1, 보충 1, 받은 수업 20", a.regularRemaining === 1 && a.supplementTaken === 1 && a.providedLessons === 20);
  const b = countLessons([...mk(20, "SCHEDULED"), ...mk(1, "SCHEDULED", true)], 20);
  check("정규 20 + 보충 1 → 제공 가능 21, totalSessions는 20 그대로", b.availableLessons === 21 && b.regularTotal === 20 && b.regularRemaining === 20 && b.supplementTotal === 1);
  const c = countLessons([...mk(20, "COMPLETED"), ...mk(1, "COMPLETED", true)], 20);
  check("정규 20 전부 + 보충 1 완료 → 정규 잔여 0, 받은 수업 21", c.regularRemaining === 0 && c.providedLessons === 21);
  const d = countLessons([...mk(5, "COMPLETED", true)], 20);
  check("보충만 완료해도 정규 잔여는 줄지 않는다(보충이 정규 회차를 소모하지 않음)", d.regularRemaining === 20 && d.regularTaken === 0);
  const e = countLessons([...mk(3, "MAKEUP_NEEDED"), ...mk(2, "LEAVE"), ...mk(1, "CANCELLED"), ...mk(1, "HOLD"), ...mk(2, "CANCELLED", true), ...mk(1, "LEAVE", true)], 10);
  check("정규 결석(MAKEUP_NEEDED)은 회차 소진, 휴강/취소/홀드는 소진 아님; 취소·휴강된 보충은 제공량에 미포함", e.regularTaken === 3 && e.regularRemaining === 7 && e.supplementTotal === 0 && e.availableLessons === 10);
  check("정규 잔여는 음수가 되지 않음", countLessons(mk(12, "COMPLETED"), 10).regularRemaining === 0);
}

// ── 5) 유급휴가 한도/승인 시점/급여 ───────────────────────────────────────────────────────────────────────────
{
  const dates = (...ds: string[]) => ds;
  const h1 = ["2026-01-05", "2026-02-10", "2026-03-10", "2026-04-10", "2026-05-11"];
  check("1~6월: 5회 승인된 뒤 6번째는 반기 한도 초과", checkPaidLeaveQuota("2026-06-15", h1).ok === false && (checkPaidLeaveQuota("2026-06-15", h1) as { error: string }).error === "HALF_YEAR_QUOTA_EXCEEDED");
  check("1~6월 4회 + 새 1회 = 5회째는 허용", checkPaidLeaveQuota("2026-06-15", h1.slice(0, 4)).ok === true);
  check("6월 30일은 상반기, 7월 1일은 하반기(6개월 경계)", paidLeavePeriod("2026-06-30").half === 1 && paidLeavePeriod("2026-07-01").half === 2);
  check("상반기 5회를 다 써도 7월 1일 휴가는 하반기 한도라 허용", checkPaidLeaveQuota("2026-07-01", h1).ok === true);
  check("경계: 6월 30일 5번째 허용 / 7월 1일 휴가는 상반기 수에 영향 없음", checkPaidLeaveQuota("2026-06-30", h1.slice(0, 4)).ok === true);
  const h2 = ["2026-07-06", "2026-08-10", "2026-09-10", "2026-10-12", "2026-11-09"];
  check("하반기도 5회 한도", checkPaidLeaveQuota("2026-12-14", h2).ok === false);
  const full = [...h1, ...h2];
  const yq = checkPaidLeaveQuota("2026-12-14", full);
  check("연간 10회를 모두 쓰면 11번째는 거부(반기 한도가 먼저 걸려도 거부)", yq.ok === false);
  check("연간 10회 중 9회 + 하반기 4회라면 10번째(하반기 5번째)는 허용", checkPaidLeaveQuota("2026-12-14", [...h1, ...h2.slice(0, 4)]).ok === true);
  check("다른 해의 승인은 한도에 합산되지 않음", checkPaidLeaveQuota("2027-01-11", full).ok === true);
  check("같은 날짜가 중복으로 들어와도 1회로 센다", checkPaidLeaveQuota("2026-06-15", dates("2026-01-05", "2026-01-05", "2026-02-10", "2026-03-10", "2026-04-10")).ok === true);

  // 승인 시점
  const before = checkPaidLeaveApprovalTiming({ leaveDate: "2026-10-20", now: kst("2026-10-07T10:00:00"), actorRole: "MANAGER" });
  check("휴가일 이전 승인은 누구나, 사후 승인 아님", before.ok === true && before.postApproval === false);
  const sameDay = checkPaidLeaveApprovalTiming({ leaveDate: "2026-10-07", now: kst("2026-10-07T23:50:00"), actorRole: "MANAGER" });
  check("휴가일 당일(KST)은 사전 승인으로 본다", sameDay.ok === true && sameDay.postApproval === false);
  const afterUser = checkPaidLeaveApprovalTiming({ leaveDate: "2026-10-06", now: kst("2026-10-07T00:10:00"), actorRole: "MANAGER" });
  check("휴가일이 지난 뒤 일반 사용자(MANAGER) 승인 거부", eq(afterUser, { ok: false, error: "POST_APPROVAL_ADMIN_ONLY" }));
  const afterAdmin = checkPaidLeaveApprovalTiming({ leaveDate: "2026-10-06", now: kst("2026-10-07T00:10:00"), actorRole: "ADMIN" });
  check("휴가일이 지난 뒤 관리자(ADMIN) 승인 허용 + 사후 승인으로 기록", afterAdmin.ok === true && afterAdmin.postApproval === true);
  check("KST 날짜 경계: UTC로는 같은 날이어도 KST로 다음 날이면 사후 승인", checkPaidLeaveApprovalTiming({ leaveDate: "2026-10-06", now: new Date("2026-10-06T15:30:00Z"), actorRole: "MANAGER" }).ok === false);
}
{
  check("유급휴가 1건 급여 = 레이트 × 8", paidLeavePay(500) === 4000 && paidLeavePay(62.5) === 500);
  const rate = 500;
  // 그날 학생 5명 수업이 있어도 승인된 유급휴가 1건 = rate × 8 한 번
  const rows: TeacherStatRow[] = [paidLeaveStatRow({ teacherName: "Abi", leaveDate: "2026-10-09", ratePerUnit: rate })];
  const sum = summarizeStatRows(rows);
  check("같은 PAID LEAVE로 학생 5명 수업이 영향을 받아도 5 × rate × 8이 아니라 1 × rate × 8", sum.length === 1 && sum[0].totalPayPHP === 4000 && sum[0].paidLeaveCount === 1);
  // 일반 LEAVE는 통계 행이 없다 — 정규 수업 급여는 출석/결석만
  check("출석 25분 = 레이트 1회분, 결석(MAKEUP_NEEDED) = 50%", classSessionPay("COMPLETED", 25, rate).payPHP === 500 && classSessionPay("MAKEUP_NEEDED", 25, rate).payPHP === 250 && classSessionPay("COMPLETED", 50, rate).payPHP === 1000);
  const mixed: TeacherStatRow[] = [
    { teacherName: "Abi", studentLabel: "s1", dateLabel: "2026-10-08", attendance: "출석", durationMin: 25, agentName: "-", sessionUnits: 1, ratePerUnit: rate, payPHP: 500 },
    ...rows,
  ];
  const m = summarizeStatRows(mixed)[0];
  check("출석 1 + 유급휴가 1 = 500 + 4000", m.totalPayPHP === 4500 && m.presentUnits === 1 && m.paidLeaveCount === 1);
}

// ── 7) 평가 상태 ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const st = (evaluation: boolean, rec: string | null) => evaluationStateOf({ evaluation: evaluation ? { id: 1 } : null, audioRecording: rec ? { processingStatus: rec } : null });
  check("평가서도 녹음도 없으면 NONE(연기 가능)", st(false, null) === "NONE");
  check("평가서가 있으면 HAS_EVALUATION(초기화 필요)", st(true, null) === "HAS_EVALUATION");
  check("녹음의 AI 결과(NEEDS_REVIEW/PUBLISHED 등)가 있으면 HAS_EVALUATION", st(false, "NEEDS_REVIEW") === "HAS_EVALUATION" && st(false, "PUBLISHED") === "HAS_EVALUATION" && st(false, "ANALYSIS_FAILED") === "HAS_EVALUATION");
  for (const s of ["UPLOADED", "PUBLIC_READY", "TRANSCRIBING", "TRANSCRIBED", "TEACHER_SPEAKER_CONFIRMED", "ANALYZING"]) check(`AI 처리 중(${s})이면 AI_PROCESSING(초기화도 연기도 불가)`, st(false, s) === "AI_PROCESSING" && st(true, s) === "AI_PROCESSING");
  check("화자 확인 대기(NEEDS_SPEAKER_CONFIRMATION)는 자동 처리 중이 아니므로 초기화 가능한 HAS_EVALUATION", st(false, "NEEDS_SPEAKER_CONFIRMATION") === "HAS_EVALUATION");
  check("초기화가 끝난 녹음(EVALUATION_RESET)은 평가 없음으로 본다", st(false, "EVALUATION_RESET") === "NONE");
}

// ── 8) 정적 검사 ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const adminRoot = process.cwd();
  const read = (p: string) => fs.readFileSync(path.join(adminRoot, p), "utf8").replace(/\/\/.*$/gm, "");
  const classroom = read("src/lib/studentClassroom.ts");
  const adminActions = read("src/app/(admin)/students/[id]/sessions/actions.ts");
  const leaveActions = read("src/app/(admin)/leave-requests/actions.ts");
  const resched = read("src/lib/reschedule.ts");
  const stats = read("src/lib/teacherStats.ts");
  check("학생이 직접 신청: STUDENT_POSTPONEMENT + studentSelfService(2시간 제한)", /source:\s*"STUDENT_POSTPONEMENT"/.test(classroom) && /studentSelfService:\s*true/.test(classroom));
  check("2시간 제한(checkStudentLeadTime)은 studentSelfService일 때만 적용된다", /if \(p\.studentSelfService\) \{[\s\S]{0,200}checkStudentLeadTime/.test(resched));
  check("관리자 경로(학생 대신 학생연기/관리자연기/휴강 관리 화면)는 studentSelfService를 쓰지 않는다", !/studentSelfService/.test(adminActions) && !/studentSelfService/.test(leaveActions));
  check("관리자가 누르는 학생연기도 source=STUDENT_POSTPONEMENT(actor만 관리자)", /createLeaveForSession\(actor, studentId, sessionId, reason, "STUDENT_POSTPONEMENT"\)/.test(adminActions) && /actor:\s*\{ role: actor\.role, id: actor\.id \}/.test(adminActions));
  check("관리자연기는 source=ADMIN_POSTPONEMENT이고 SCHEDULED/COMPLETED/MAKEUP_NEEDED를 허용(시간 조건 없음)", /"ADMIN_POSTPONEMENT"/.test(adminActions) && /ADMIN_LEAVE_STATUSES = \["SCHEDULED", "COMPLETED", "MAKEUP_NEEDED"\]/.test(adminActions) && !/scheduledAt\s*[<>]/.test(adminActions));
  check("학생 연기 횟수 검사는 STUDENT_POSTPONEMENT일 때만 수행(관리자연기·휴강·홀드·유급휴가는 미차감)", /const quotaImpact: 0 \| 1 = p\.source === "STUDENT_POSTPONEMENT" \? 1 : 0;/.test(resched));
  check("teacherStats는 LEAVE 세션을 급여 대상으로 조회하지 않는다(일반 LEAVE = 0원)", !/"LEAVE"/.test(stats) && /status:\s*\{\s*in:\s*\["COMPLETED", "MAKEUP_NEEDED"\]\s*\}/.test(stats));
  check("teacherStats는 승인된(APPROVED) 유급휴가만 지급한다", /teacherPaidLeave\.findMany\(\{[\s\S]{0,200}status:\s*"APPROVED"/.test(stats));
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
