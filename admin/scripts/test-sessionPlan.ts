// 수업 생성 dry-run 계획기(src/lib/sessionPlan.ts) 검증 — 오프라인 fixture 테스트(DB/네트워크 없음).
//  1) 계산 규칙: 주 1~5회, 25/50분, 시작일/종료일, classTimes, KST 경계, 과거 제외, 미래/종료/홀드 수강
//  2) 기존 세션 보존(CANCELLED/LEAVE/HOLD 포함), 중복 실행 시 같은 결과, 강사 충돌(자동 생성 제외)
//  3) 정적 안전 검사 — dry-run 코드에 쓰기성 호출이 없고, 휴강/홀드/전체휴강/remainingLessons/deleteEnrollment가 그대로이며,
//     계획기가 휴강/홀드 경로에 연결되어 있지 않다.
// 실행(admin 디렉터리): npx tsx scripts/test-sessionPlan.ts
import fs from "node:fs";
import path from "node:path";
import {
  planClassSessions,
  type PlanEnrollmentInput,
  type PlanExistingSessionInput,
  type PlanInput,
  type PlanResult,
} from "../src/lib/sessionPlan";

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

// 2026-10-05는 월요일. asOf = 그날 03:00 KST(= 10-04 18:00Z).
const ASOF = new Date("2026-10-05T03:00:00+09:00");
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

let nextId = 1000;
function enr(over: Partial<PlanEnrollmentInput> = {}): PlanEnrollmentInput {
  const id = over.id ?? nextId++;
  return {
    id,
    status: "ACTIVE",
    studentId: 5000 + id,
    studentName: `학생${id}`,
    teacherId: 100 + id, // 기본은 수강마다 다른 강사 → 충돌 없음
    teacherName: `강사${id}`,
    teacherAccountStatus: "ACTIVE",
    teacherApprovalStatus: "APPROVED",
    teacherAvailableHours: null,
    scheduleDays: "월",
    classTime: "19:00",
    classTimes: null,
    classDurationMin: 25,
    startDate: d("2026-10-05"),
    endDate: d("2026-11-01"),
    totalSessions: 4,
    ...over,
  };
}
function ses(over: Partial<PlanExistingSessionInput> & Pick<PlanExistingSessionInput, "enrollmentId" | "scheduledAt">): PlanExistingSessionInput {
  return { id: nextId++, teacherId: 1, durationMin: 25, status: "SCHEDULED", isSupplement: false, deletedAt: null, ...over };
}
function plan(enrollments: PlanEnrollmentInput[], extra: Partial<PlanInput> = {}): PlanResult {
  return planClassSessions({ asOf: ASOF, enrollments, existingSessions: [], ...extra });
}
const row = (r: PlanResult, id: number) => r.rows.find((x) => x.enrollmentId === id)!;
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

check("fixture sanity: 2026-10-05 is a Monday", weekdayOf("2026-10-05") === 1);

// ---- 1. 주 1/2/3/4/5회 ------------------------------------------------------------------------------------------
const FREQ: [string, number[], number][] = [
  ["월", [1], 4],
  ["화목", [2, 4], 8],
  ["월수금", [1, 3, 5], 12],
  ["월화목금", [1, 2, 4, 5], 16],
  ["월화수목금", [1, 2, 3, 4, 5], 20],
];
for (const [label, days, expected] of FREQ) {
  const e = enr({ scheduleDays: label });
  const r = row(plan([e]), e.id);
  check(`주 ${days.length}회(${label}): outcome ELIGIBLE`, r.outcome === "ELIGIBLE", r.outcome);
  check(`주 ${days.length}회(${label}): 4주(10/5~11/1) 동안 ${expected}건`, r.plannedSessions.length === expected && r.willCreateCount === expected, String(r.plannedSessions.length));
  check(`주 ${days.length}회(${label}): 모든 날짜가 수업 요일`, r.plannedSessions.every((p) => days.includes(weekdayOf(p.date))));
  check(`주 ${days.length}회(${label}): 날짜 오름차순 + key 형식`, r.plannedSessions.every((p, i, a) => (i === 0 || a[i - 1].date < p.date) && p.key === `${e.id}:${p.date}`));
  check(`주 ${days.length}회(${label}): 전부 SCHEDULED / 보충 아님 / 강사·학생 복사`, r.plannedSessions.every((p) => p.status === "SCHEDULED" && p.isSupplement === false && p.teacherId === e.teacherId && p.studentId === e.studentId));
}

// ---- 2. 25분 / 50분 ----------------------------------------------------------------------------------------------
for (const dur of [25, 50]) {
  const e = enr({ classDurationMin: dur });
  const r = row(plan([e]), e.id);
  check(`${dur}분: 모든 세션의 durationMin = ${dur}`, r.plannedSessions.length === 4 && r.plannedSessions.every((p) => p.durationMin === dur));
  check(`${dur}분: 경고 없음`, !r.warnings.includes("UNUSUAL_DURATION"));
}
{
  const e = enr({ classDurationMin: 30 });
  check("25/50이 아닌 수업 시간은 경고(생성은 가능)", row(plan([e]), e.id).warnings.includes("UNUSUAL_DURATION") && row(plan([e]), e.id).outcome === "ELIGIBLE");
}

// ---- 3. 시작일/종료일 --------------------------------------------------------------------------------------------
{
  // 시작일이 수요일(수업 요일 아님) → 첫 수업은 그 뒤 첫 금요일
  const e = enr({ scheduleDays: "월금", startDate: d("2026-10-07"), endDate: d("2026-10-30"), totalSessions: 7 });
  const r = row(plan([e], { asOf: new Date("2026-10-01T10:00:00+09:00") }), e.id);
  check("시작일이 수업 요일이 아니면 다음 수업 요일부터", r.plannedSessions[0]?.date === "2026-10-09", r.plannedSessions[0]?.date);
  check("그 기간 월/금 전부 포함(10/9,12,16,19,23,26,30)", eq(r.plannedSessions.map((p) => p.date), ["2026-10-09", "2026-10-12", "2026-10-16", "2026-10-19", "2026-10-23", "2026-10-26", "2026-10-30"]));
  check("종료일(금)이 수업 요일이면 마지막 세션이 종료일 당일", r.plannedSessions.at(-1)?.date === "2026-10-30" && !r.warnings.includes("END_DATE_NOT_CLASS_DAY"));
}
{
  const e = enr({ scheduleDays: "월금", endDate: d("2026-10-18") }); // 일요일
  const r = row(plan([e]), e.id);
  check("종료일이 수업 요일이 아니면 그 이전 마지막 수업일까지 + 경고", r.plannedSessions.at(-1)?.date === "2026-10-16" && r.warnings.includes("END_DATE_NOT_CLASS_DAY"));
  const e2 = enr({ scheduleDays: "월", startDate: d("2026-10-05"), endDate: d("2026-10-05"), totalSessions: 1 });
  check("시작일=종료일=오늘(수업 요일)이면 1건", row(plan([e2]), e2.id).plannedSessions.length === 1);
}
{
  // 계산 범위는 endDate이지 totalSessions가 아니다(휴강/홀드로 endDate가 밀린 수강을 위해)
  const e = enr({ totalSessions: 2 });
  const r = row(plan([e]), e.id);
  check("범위는 endDate 기준(totalSessions=2여도 4건) + 초과 경고", r.plannedSessions.length === 4 && r.warnings.includes("PLANNED_EXCEEDS_TOTAL_SESSIONS"));
}

// ---- 4. classTimes override / KST ------------------------------------------------------------------------------
{
  const e = enr({ scheduleDays: "월수", classTime: "19:00", classTimes: { "3": "20:30" }, endDate: d("2026-10-14") });
  const r = row(plan([e]), e.id);
  const byDate = Object.fromEntries(r.plannedSessions.map((p) => [p.date, p.time]));
  check("classTimes 오버라이드: 수요일만 20:30, 월요일은 기본 19:00", byDate["2026-10-05"] === "19:00" && byDate["2026-10-07"] === "20:30" && byDate["2026-10-12"] === "19:00" && byDate["2026-10-14"] === "20:30");
  check("classTimes 오버라이드: scheduledAt이 KST 절대 순간(수 20:30 KST = 11:30Z)", r.plannedSessions.find((p) => p.date === "2026-10-07")?.scheduledAt.toISOString() === "2026-10-07T11:30:00.000Z");
}
{
  // 기본 classTime 없이 요일별 시각만 있어도 모든 요일에 시각이 있으면 OK, 하나라도 비면 NO_CLASS_TIME
  const ok = enr({ scheduleDays: "월수", classTime: null, classTimes: { "1": "18:00", "3": "18:30" } });
  const bad = enr({ scheduleDays: "월수", classTime: null, classTimes: { "1": "18:00" } });
  const r = plan([ok, bad]);
  check("classTime=null + 모든 요일 오버라이드 → 생성 가능", row(r, ok.id).outcome === "ELIGIBLE");
  check("classTime=null + 일부 요일 시각 없음 → 제외(NO_CLASS_TIME)", row(r, bad.id).outcome === "EXCLUDED" && row(r, bad.id).reasons.includes("NO_CLASS_TIME"));
}
{
  const e = enr({ classTime: "19:00" });
  check("KST 19:00 → 10:00Z", row(plan([e]), e.id).plannedSessions[0].scheduledAt.toISOString() === "2026-10-05T10:00:00.000Z");
  const early = enr({ classTime: "00:30" });
  const r = row(plan([early], { asOf: new Date("2026-10-04T20:00:00+09:00") }), early.id).plannedSessions[0]; // 전날 저녁 기준(00:30 슬롯이 asOf 이후)
  check("KST 00:30은 UTC로는 전날(10-04T15:30Z)이지만 세션 날짜는 KST 기준 10/05", r.scheduledAt.toISOString() === "2026-10-04T15:30:00.000Z" && r.date === "2026-10-05" && r.weekday === 1);
  const late = enr({ classTime: "23:30" });
  check("KST 23:30 → 14:30Z, 같은 날짜", row(plan([late]), late.id).plannedSessions[0].scheduledAt.toISOString() === "2026-10-05T14:30:00.000Z");
  const odd = enr({ classTime: "9:05" });
  check("'9:05' 형식도 09:05로 정규화", row(plan([odd]), odd.id).plannedSessions[0].time === "09:05");
}

// ---- 5. 오늘 기준 경계 / 과거 제외 ------------------------------------------------------------------------------
{
  const e = enr({ scheduleDays: "월", startDate: d("2026-10-01"), endDate: d("2026-10-12") });
  const justBefore = row(plan([e], { asOf: new Date("2026-10-04T14:59:59Z") }), e.id); // 10/04 23:59:59 KST (일)
  check("KST 일요일 23:59:59: 오늘=10/04 → 10/05, 10/12 모두 대상", justBefore.plannedSessions.map((p) => p.date).join() === "2026-10-05,2026-10-12" && justBefore.skippedPastDates.length === 0);
  const midnight = row(plan([e], { asOf: new Date("2026-10-04T15:00:00Z") }), e.id); // 10/05 00:00 KST
  check("KST 10/05 00:00: 오늘=10/05 → 10/05 포함(날짜 기준)", midnight.plannedSessions[0].date === "2026-10-05");
  const after = row(plan([e], { asOf: new Date("2026-10-05T15:00:00Z") }), e.id); // 10/06 00:00 KST
  check("KST 10/06 00:00: 10/05는 과거로 제외, 10/12만 남음", after.skippedPastDates.join() === "2026-10-05" && after.plannedSessions.map((p) => p.date).join() === "2026-10-12");
}
{
  const e = enr({ scheduleDays: "월수금", startDate: d("2026-09-01"), endDate: d("2026-10-30"), totalSessions: 24 });
  const r = row(plan([e]), e.id);
  check("과거 날짜는 생성 대상이 아님(전부 오늘 이후)", r.plannedSessions.length > 0 && r.plannedSessions.every((p) => p.date >= "2026-10-05"));
  check("과거로 제외된 날짜는 전부 오늘 이전이고 기록됨", r.skippedPastDates.length > 0 && r.skippedPastDates.every((x) => x < "2026-10-05"));
  check("과거 + 미래 = 기간 내 전체 수업일(9/1~10/30 월수금 = 26일)", r.skippedPastDates.length + r.plannedSessions.length === 26, `${r.skippedPastDates.length}+${r.plannedSessions.length}`);
  check("과거 수업을 COMPLETED로 소급하지 않음(모든 계획 세션이 SCHEDULED)", r.plannedSessions.every((p) => p.status === "SCHEDULED"));
  const late = row(plan([e], { asOf: new Date("2026-10-05T21:00:00+09:00") }), e.id);
  check("오늘 수업 시각이 이미 지났으면 만들지 않음(skippedStartedToday에 기록), 다음 수업일부터", late.plannedSessions[0].date === "2026-10-07" && late.skippedStartedToday.join() === "2026-10-05", JSON.stringify([late.plannedSessions[0]?.date, late.skippedStartedToday]));
  check("오늘 수업 시각 전이면 오늘 슬롯도 대상", r.plannedSessions[0].date === "2026-10-05" && r.skippedStartedToday.length === 0);
  const exactlyNow = row(plan([e], { asOf: new Date("2026-10-05T19:00:00+09:00") }), e.id);
  check("asOf와 정확히 같은 시각의 슬롯(scheduledAt <= asOf)은 만들지 않음", exactlyNow.skippedStartedToday.join() === "2026-10-05" && exactlyNow.plannedSessions[0].date === "2026-10-07");
  const oneMinuteBefore = row(plan([e], { asOf: new Date("2026-10-05T18:59:00+09:00") }), e.id);
  check("시작 1분 전에는 오늘 슬롯도 대상", oneMinuteBefore.plannedSessions[0].date === "2026-10-05");
}
{
  const e = enr({ startDate: d("2026-11-02"), endDate: d("2026-12-28"), totalSessions: 9 });
  const r = row(plan([e]), e.id);
  check("미래 수강: startDate부터 endDate까지 전부(월요일 9건), 과거 제외 없음", r.plannedSessions.length === 9 && r.plannedSessions[0].date === "2026-11-02" && r.skippedPastDates.length === 0);
  const ended = enr({ startDate: d("2026-08-03"), endDate: d("2026-09-28") });
  const re = row(plan([ended]), ended.id);
  check("endDate가 이미 지난 ACTIVE 수강: 만들 것 없음 → 제외(NO_FUTURE_SLOTS)", re.outcome === "EXCLUDED" && re.reasons.includes("NO_FUTURE_SLOTS") && re.plannedSessions.length === 0);
}

// ---- 6. 상태별 제외 ---------------------------------------------------------------------------------------------
{
  const active = enr();
  const done = enr({ status: "COMPLETED" });
  const hold = enr({ status: "HOLDING" });
  const applied = enr({ status: "APPLIED" });
  const paid = enr({ status: "PAID" });
  const r = plan([active, done, hold, applied, paid]);
  check("COMPLETED 수강은 제외(STATUS_COMPLETED), 세션 계획 없음", row(r, done.id).outcome === "EXCLUDED" && row(r, done.id).reasons.includes("STATUS_COMPLETED") && row(r, done.id).plannedSessions.length === 0);
  check("HOLDING 수강은 제외(STATUS_HOLDING), 세션 계획 없음", row(r, hold.id).outcome === "EXCLUDED" && row(r, hold.id).reasons.includes("STATUS_HOLDING") && row(r, hold.id).plannedSessions.length === 0);
  check("APPLIED/PAID는 제외(STATUS_NOT_ACTIVE)", row(r, applied.id).reasons.includes("STATUS_NOT_ACTIVE") && row(r, paid.id).reasons.includes("STATUS_NOT_ACTIVE"));
  check("요약: ACTIVE 1건만 집계, 나머지 4건은 nonActiveExcluded", r.summary.totalActive === 1 && r.summary.nonActiveExcluded === 4 && r.summary.eligible === 1 && r.summary.excluded === 0);
}

// ---- 7. 입력 오류 / 제외 사유 ----------------------------------------------------------------------------------
{
  const bad = {
    time: enr({ classTime: "25:99" }),
    range: enr({ startDate: d("2026-11-01"), endDate: d("2026-10-01") }),
    longRange: enr({ startDate: d("2020-01-01"), endDate: d("2030-01-01") }),
    dur: enr({ classDurationMin: 0 }),
    times: enr({ classTimes: { "1": "7pm" } }),
    timesShape: enr({ classTimes: ["19:00"] }),
    day: enr({ scheduleDays: "월X" }),
  };
  const r = plan(Object.values(bad));
  const codes: [keyof typeof bad, string][] = [["time", "INVALID_CLASS_TIME"], ["range", "INVALID_DATE_RANGE"], ["longRange", "RANGE_TOO_LONG"], ["dur", "INVALID_DURATION"], ["times", "INVALID_CLASS_TIMES"], ["timesShape", "INVALID_CLASS_TIMES"], ["day", "UNKNOWN_SCHEDULE_DAY"]];
  for (const [k, code] of codes) {
    const rr = row(r, bad[k].id);
    check(`입력 오류 ${k} → ERROR(${code}), 세션 계획 없음`, rr.outcome === "ERROR" && rr.errors.some((x) => x.code === code) && rr.plannedSessions.length === 0, JSON.stringify(rr.errors));
  }
  check("요약: errors 집계", r.summary.errors === 7 && r.summary.sessionsWouldBeCreated === 0);

  const noTeacher = enr({ teacherId: null, teacherName: null, teacherAccountStatus: null, teacherApprovalStatus: null });
  const inactive = enr({ teacherAccountStatus: "INACTIVE" });
  const unapproved = enr({ teacherApprovalStatus: "PENDING" });
  const noDays = enr({ scheduleDays: "" });
  const r2 = plan([noTeacher, inactive, unapproved, noDays]);
  check("강사 없음 → 제외(NO_TEACHER)", row(r2, noTeacher.id).outcome === "EXCLUDED" && row(r2, noTeacher.id).reasons.includes("NO_TEACHER"));
  check("강사 비활성 → 제외(TEACHER_INACTIVE)", row(r2, inactive.id).reasons.includes("TEACHER_INACTIVE") && row(r2, inactive.id).outcome === "EXCLUDED");
  check("강사 미승인 → 제외(TEACHER_INACTIVE)", row(r2, unapproved.id).reasons.includes("TEACHER_INACTIVE"));
  check("수업 요일 없음 → 제외(NO_SCHEDULE_DAYS)", row(r2, noDays.id).reasons.includes("NO_SCHEDULE_DAYS") && row(r2, noDays.id).outcome === "EXCLUDED");
  check("요약: excludedByReason 집계", r2.summary.excluded === 4 && r2.summary.excludedByReason.NO_TEACHER === 1 && r2.summary.excludedByReason.TEACHER_INACTIVE === 2);
}

// ---- 8. 기존 세션 보존 / 날짜 제외 ------------------------------------------------------------------------------
{
  const e = enr({ scheduleDays: "월", teacherId: 700 }); // 10/5, 10/12, 10/19, 10/26
  const kst = (iso: string) => new Date(`${iso}T19:00:00+09:00`);
  const existing = [
    ses({ id: 1, enrollmentId: e.id, teacherId: 700, scheduledAt: kst("2026-10-05"), status: "CANCELLED" }),
    ses({ id: 2, enrollmentId: e.id, teacherId: 700, scheduledAt: kst("2026-10-12"), status: "LEAVE" }),
    ses({ id: 3, enrollmentId: e.id, teacherId: 700, scheduledAt: kst("2026-10-19"), status: "HOLD" }),
  ];
  const r = row(plan([e], { existingSessions: existing }), e.id);
  check("CANCELLED/LEAVE/HOLD 기존 세션이 있는 날짜는 다시 만들지 않음 → 10/26만 생성", eq(r.plannedSessions.map((p) => p.date), ["2026-10-26"]));
  check("건너뛴 기존 세션이 id/상태와 함께 기록됨", eq(r.skippedExisting.map((s) => [s.date, s.sessionId, s.status]), [["2026-10-05", 1, "CANCELLED"], ["2026-10-12", 2, "LEAVE"], ["2026-10-19", 3, "HOLD"]]));
  check("기존 세션은 변경/삭제 대상이 아님(alreadyExisting에 그대로 3건)", r.alreadyExisting.length === 3 && r.alreadyExisting.every((s) => s.blocksDate));
  check("취소/휴강/홀드 세션은 강사 시간을 점유하지 않으므로 충돌 아님", r.outcome === "ELIGIBLE");

  const all = existing.concat(ses({ id: 4, enrollmentId: e.id, teacherId: 700, scheduledAt: kst("2026-10-26"), status: "SCHEDULED" }));
  const rAll = row(plan([e], { existingSessions: all }), e.id);
  check("모든 수업일에 이미 세션이 있으면 제외(ALL_SLOTS_ALREADY_EXIST)", rAll.outcome === "EXCLUDED" && rAll.reasons.includes("ALL_SLOTS_ALREADY_EXIST") && rAll.plannedSessions.length === 0);

  const supp = ses({ id: 5, enrollmentId: e.id, teacherId: 701, scheduledAt: kst("2026-10-05"), isSupplement: true });
  const rSupp = row(plan([e], { existingSessions: [supp] }), e.id);
  check("보충수업은 같은 날짜의 정규 수업 생성을 막지 않음", rSupp.plannedSessions.length === 4 && rSupp.alreadyExisting[0].blocksDate === false);

  const deleted = ses({ id: 6, enrollmentId: e.id, teacherId: 700, scheduledAt: kst("2026-10-05"), deletedAt: new Date("2026-10-01T00:00:00Z") });
  const rDel = row(plan([e], { existingSessions: [deleted] }), e.id);
  check("소프트 삭제된 세션은 '존재'로 보지 않음", rDel.plannedSessions.length === 4 && rDel.alreadyExisting.length === 0);

  // 시각이 달라도 같은 KST 날짜면 같은 날짜로 본다(KST 자정 부근 포함)
  const odd = ses({ id: 7, enrollmentId: e.id, teacherId: 700, scheduledAt: new Date("2026-10-05T00:10:00+09:00") });
  check("같은 KST 날짜의 다른 시각 세션도 그 날짜를 막음(UTC로는 전날)", row(plan([e], { existingSessions: [odd] }), e.id).skippedExisting[0]?.date === "2026-10-05");
}

// ---- 9. 강사 충돌 -----------------------------------------------------------------------------------------------
{
  const a = enr({ teacherId: 900, scheduleDays: "수", classTime: "19:00", classDurationMin: 25 });
  const b = enr({ teacherId: 900, scheduleDays: "수", classTime: "19:00", classDurationMin: 50 });
  const c = enr({ teacherId: 901, scheduleDays: "수", classTime: "19:00" }); // 다른 강사
  const r = plan([a, b, c]);
  check("같은 강사·요일·시각 겹침 → 양쪽 모두 CONFLICT", row(r, a.id).outcome === "CONFLICT" && row(r, b.id).outcome === "CONFLICT");
  check("충돌 수강은 자동 생성 대상에서 제외(willCreate 0, 후보는 withheld로만 남음)", row(r, a.id).willCreateCount === 0 && row(r, a.id).withheldCount === 4 && row(r, a.id).plannedSessions.length === 4);
  check("충돌 상세: 상대 수강/요일/시각/횟수 표시", row(r, a.id).conflicts[0].kind === "PLANNED_VS_PLANNED" && row(r, a.id).conflicts[0].otherEnrollmentId === b.id && row(r, a.id).conflicts[0].dates.length === 4 && row(r, a.id).conflicts[0].weekday === 3);
  check("다른 강사 수강은 영향 없음", row(r, c.id).outcome === "ELIGIBLE");
  check("요약: 충돌 수강 2, 충돌 쌍 1, 충돌 수업일 8, 생성 예정에서 제외", r.summary.conflict === 2 && r.summary.conflictPairs === 1 && r.summary.conflictSlots === 8 && r.summary.sessionsWouldBeCreated === 4 && r.summary.sessionsSkipped.withheldByConflict === 8);
  check("충돌 원인을 추측하지 않음(그룹수업/오류 같은 라벨 없음)", !JSON.stringify(row(r, a.id)).match(/group|그룹|오류 가능/i));

  const x = enr({ teacherId: 910, scheduleDays: "수", classTime: "19:00", classDurationMin: 25 });
  const y = enr({ teacherId: 910, scheduleDays: "수", classTime: "19:25", classDurationMin: 25 });
  const rAdj = plan([x, y]);
  check("맞닿기만 하는 수업(19:00~19:25 / 19:25~19:50)은 충돌 아님", row(rAdj, x.id).outcome === "ELIGIBLE" && row(rAdj, y.id).outcome === "ELIGIBLE");

  const p = enr({ teacherId: 920, scheduleDays: "수", startDate: d("2026-10-05"), endDate: d("2026-10-14") });
  const q = enr({ teacherId: 920, scheduleDays: "수", startDate: d("2026-10-19"), endDate: d("2026-11-01") });
  const rDisjoint = plan([p, q]);
  check("같은 강사·요일·시각이어도 기간이 겹치지 않으면 충돌 아님", row(rDisjoint, p.id).outcome === "ELIGIBLE" && row(rDisjoint, q.id).outcome === "ELIGIBLE");

  const partial = enr({ teacherId: 930, scheduleDays: "월수", classTime: "19:00" });
  const partner = enr({ teacherId: 930, scheduleDays: "수금", classTime: "19:10", classDurationMin: 25 });
  const rPartial = plan([partial, partner]);
  check("한 요일만 겹쳐도 수강 전체가 CONFLICT", row(rPartial, partial.id).outcome === "CONFLICT" && row(rPartial, partial.id).conflicts.every((cg) => cg.weekday === 3));

  const exEnr = enr({ teacherId: 940, scheduleDays: "월", classTime: "19:00" });
  const other = enr({ teacherId: 940, scheduleDays: "화", classTime: "10:00" });
  const kst = (iso: string, t: string) => new Date(`${iso}T${t}:00+09:00`);
  const exSched = ses({ id: 50, enrollmentId: other.id, teacherId: 940, scheduledAt: kst("2026-10-12", "19:10"), status: "SCHEDULED" });
  const rEx = plan([exEnr, other], { existingSessions: [exSched] });
  check("같은 강사의 기존 SCHEDULED 수업과 겹침 → CONFLICT(PLANNED_VS_EXISTING_SESSION, 해당 날짜 1회)", row(rEx, exEnr.id).outcome === "CONFLICT" && row(rEx, exEnr.id).conflicts[0].kind === "PLANNED_VS_EXISTING_SESSION" && row(rEx, exEnr.id).conflicts[0].dates.join() === "2026-10-12" && row(rEx, exEnr.id).conflicts[0].otherSessionId === 50);
  const exCompleted = { ...exSched, status: "COMPLETED" as const };
  check("기존 COMPLETED 수업도 시간을 점유", row(plan([exEnr, other], { existingSessions: [exCompleted] }), exEnr.id).outcome === "CONFLICT");
  for (const st of ["CANCELLED", "LEAVE", "HOLD", "MAKEUP_NEEDED"] as const) {
    check(`기존 ${st} 수업은 시간을 점유하지 않음`, row(plan([exEnr, other], { existingSessions: [{ ...exSched, status: st }] }), exEnr.id).outcome === "ELIGIBLE");
  }
  check("소프트 삭제된 기존 수업은 충돌 아님", row(plan([exEnr, other], { existingSessions: [{ ...exSched, deletedAt: new Date("2026-10-01T00:00:00Z") }] }), exEnr.id).outcome === "ELIGIBLE");

  const lt = { teacherId: 940, start: kst("2026-10-19", "18:50"), durationMin: 30, label: "레벨테스트 #1 (리드)" };
  const rLt = row(plan([exEnr], { teacherBusy: [lt] }), exEnr.id);
  check("레벨테스트와 겹침 → CONFLICT(PLANNED_VS_LEVEL_TEST)", rLt.outcome === "CONFLICT" && rLt.conflicts[0].kind === "PLANNED_VS_LEVEL_TEST" && rLt.conflicts[0].dates.join() === "2026-10-19");

  // 처리 순서에 의존하지 않는다
  const shuffled = plan([c, b, a]);
  check("입력 순서가 달라도 결과 동일(수강 id 순 정렬)", eq(plan([a, b, c]).rows, shuffled.rows) && eq(plan([a, b, c]).summary, shuffled.summary));
}

// ---- 10. 중복 실행 / 멱등성 -------------------------------------------------------------------------------------
{
  const set = [enr({ scheduleDays: "월수금", teacherId: 300 }), enr({ scheduleDays: "화목", teacherId: 301 }), enr({ teacherId: 302, scheduleDays: "월" }), enr({ teacherId: 302, scheduleDays: "월" })];
  const first = plan(set);
  const second = plan(set);
  check("같은 입력으로 두 번 실행하면 같은 결과", eq(first, second));

  // '실제로 생성했다고 가정'하고 다시 계산 → 이미 존재하므로 더 만들 것이 없다(충돌 건은 그대로 보류)
  const applied: PlanExistingSessionInput[] = first.rows
    .filter((r) => r.outcome === "ELIGIBLE")
    .flatMap((r) => r.plannedSessions.map((p) => ses({ enrollmentId: p.enrollmentId, teacherId: p.teacherId, scheduledAt: p.scheduledAt, durationMin: p.durationMin })));
  const again = planClassSessions({ asOf: ASOF, enrollments: set, existingSessions: applied });
  const eligibleIds = first.rows.filter((r) => r.outcome === "ELIGIBLE").map((r) => r.enrollmentId);
  check("생성 후 재실행: 이전 ELIGIBLE 수강은 더 만들 것 없음(ALL_SLOTS_ALREADY_EXIST)", eligibleIds.length === 2 && eligibleIds.every((id) => row(again, id).outcome === "EXCLUDED" && row(again, id).reasons.includes("ALL_SLOTS_ALREADY_EXIST") && row(again, id).willCreateCount === 0));
  check("생성 후 재실행: 새로 만들 세션 수 0 + 건너뛴 기존 세션 수 = 이전 생성 예정 수", again.summary.sessionsWouldBeCreated === 0 && again.summary.sessionsSkipped.alreadyExisting === first.summary.sessionsWouldBeCreated);
  const conflictIds = first.rows.filter((r) => r.outcome === "CONFLICT").map((r) => r.enrollmentId);
  check("재실행 후에도 충돌 건은 계속 CONFLICT(보류)", conflictIds.length === 2 && conflictIds.every((id) => row(again, id).outcome === "CONFLICT"));
  check("재실행 시 키가 겹치지 않음(생성 예정 key 중복 없음)", new Set(first.rows.flatMap((r) => r.plannedSessions.map((p) => p.key))).size === first.rows.reduce((n, r) => n + r.plannedSessions.length, 0));
}

// ---- 11. 경고 / 요약 불변식 ------------------------------------------------------------------------------------
{
  const hours = [19 * 60, 19 * 60 + 30]; // 19:00~20:00만
  const inside = enr({ teacherAvailableHours: hours, classTime: "19:00" });
  const outside = enr({ teacherAvailableHours: hours, classTime: "21:00" });
  const empty = enr({ teacherAvailableHours: [] });
  const r = plan([inside, outside, empty]);
  check("근무가능 시간 안이면 근무시간 경고 없음", !row(r, inside.id).warnings.includes("SLOT_OUTSIDE_TEACHER_HOURS") && !row(r, inside.id).warnings.includes("TEACHER_NO_AVAILABLE_HOURS"));
  check("근무가능 시간 밖이면 경고(제외는 아님)", row(r, outside.id).warnings.includes("SLOT_OUTSIDE_TEACHER_HOURS") && row(r, outside.id).outcome === "ELIGIBLE");
  check("근무가능 시간 미등록이면 경고(제외는 아님)", row(r, empty.id).warnings.includes("TEACHER_NO_AVAILABLE_HOURS") && row(r, empty.id).outcome === "ELIGIBLE");

  const s1 = enr({ studentId: 1, teacherId: 11, scheduleDays: "월", classTime: "19:00" });
  const s2 = enr({ studentId: 1, teacherId: 12, scheduleDays: "월", classTime: "19:00" });
  const rs = plan([s1, s2]);
  check("같은 학생의 다른 수강과 시간이 겹치면 경고(제외는 아님)", row(rs, s1.id).warnings.includes("STUDENT_SELF_OVERLAP") && row(rs, s1.id).outcome === "ELIGIBLE");

  const mixed = plan([
    enr({ teacherId: 1 }),
    enr({ teacherId: 2, status: "HOLDING" }),
    enr({ teacherId: 3, classTime: "xx" }),
    enr({ teacherId: null, teacherName: null }),
    enr({ teacherId: 4, scheduleDays: "수", classTime: "19:00" }),
    enr({ teacherId: 4, scheduleDays: "수", classTime: "19:00" }),
  ]);
  const sm = mixed.summary;
  check("요약 불변식: eligible + conflict + excluded + errors = totalActive", sm.eligible + sm.conflict + sm.excluded + sm.errors === sm.totalActive && sm.totalActive === 5 && sm.nonActiveExcluded === 1);
  check("요약 불변식: sessionsSkipped.total = past + startedToday + closure + existing + withheld", sm.sessionsSkipped.total === sm.sessionsSkipped.pastDates + sm.sessionsSkipped.startedToday + sm.sessionsSkipped.closure + sm.sessionsSkipped.alreadyExisting + sm.sessionsSkipped.withheldByConflict);
  check("요약: 생성 예정 = ELIGIBLE 행의 plannedSessions 합", sm.sessionsWouldBeCreated === mixed.rows.filter((r) => r.outcome === "ELIGIBLE").reduce((n, r) => n + r.plannedSessions.length, 0));
  check("요약: todayKst가 asOf의 KST 날짜", sm.todayKst === "2026-10-05");
}

// ---- 12. 정적 안전 검사 ---------------------------------------------------------------------------------------
const adminRoot = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(adminRoot, rel), "utf8");
const WRITE_CALL = /\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(\s*\{|\$executeRaw|\$executeRawUnsafe|\$queryRawUnsafe|"use server"|revalidatePath|redirect\(/;
for (const rel of ["src/lib/sessionPlan.ts", "src/lib/sessionPlanData.ts", "src/app/(admin)/session-plan/page.tsx"]) {
  const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check(`dry-run 코드에 쓰기성 호출이 없음: ${rel}`, !WRITE_CALL.test(src), (src.match(WRITE_CALL) ?? [""])[0]);
}
{
  const planSrc = read("src/lib/sessionPlan.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("계획기는 순수 함수 — prisma/서버 모듈을 import하지 않음", !/from\s+["'][^"']*(prisma|backofficeAuth|next\/)[^"']*["']/.test(planSrc));
  check("계획기는 휴강/홀드/전체휴강 코드를 참조하지 않음", !/leaveApply|holdApply|createAcademyClosure|applyClassLeave|applyHold|releaseHold/.test(planSrc));
  const dataSrc = read("src/lib/sessionPlanData.ts");
  check("데이터 로더는 findMany만 사용(읽기 전용)", /findMany/.test(dataSrc) && !/\.(create|update|delete|upsert)\w*\(/.test(dataSrc));
  const pageSrc = read("src/app/(admin)/session-plan/page.tsx");
  check("페이지는 ADMIN 전용(role 직접 확인 + notFound)", /actor\.role\s*!==\s*"ADMIN"/.test(pageSrc) && /notFound\(\)/.test(pageSrc));
}
{
  // 계획기를 가져다 쓰는 곳은 dry-run 로더/페이지뿐 — 수강 등록/수정/상태 변경/휴강/홀드 경로에 연결되어 있지 않다.
  const importers: string[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "generated" || ent.name === "node_modules") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(ent.name) && /sessionPlan(Data)?["']/.test(fs.readFileSync(p, "utf8"))) {
        importers.push(path.relative(adminRoot, p).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(adminRoot, "src"));
  check(
    "sessionPlan은 페이지/로더/생성 실행기에서만 import됨(수강 등록/수정/휴강/홀드 경로에 자동 trigger 없음)",
    eq(importers.sort(), ["src/app/(admin)/session-plan/page.tsx", "src/lib/sessionGeneration.ts", "src/lib/sessionPlanData.ts"].sort()),
    importers.join(", "),
  );
}
{
  // 이번 PR이 바꾸지 않기로 한 기존 로직의 핵심 의미를 고정(tripwire). 의도적으로 바꾸는 후속 PR은 이 항목을 함께 갱신해야 한다.
  const leave = read("src/lib/leaveApply.ts");
  check("leaveApply: 세션을 LEAVE로 바꾸고 endDate를 extendedDays만큼 늘림", /status:\s*"LEAVE"/.test(leave) && /newEndDate\.setDate\(newEndDate\.getDate\(\) \+ params\.extendedDays\)/.test(leave) && !/classSession\.create/.test(leave));
  const hold = read("src/lib/holdApply.ts");
  check("holdApply: 예정 수업을 HOLD로 멈추고 해제 시 7의 배수 일수만큼 밀며 endDate도 연장", /data:\s*\{\s*status:\s*"HOLD"\s*\}/.test(hold) && /Math\.ceil\(heldDays \/ 7\) \* 7/.test(hold) && /endDate:\s*newEndDate/.test(hold) && !/classSession\.create/.test(hold));
  const leaveActions = read("src/app/(admin)/leave-requests/actions.ts");
  check("createAcademyClosure: 이미 존재하는 해당일 SCHEDULED 수업만 LEAVE 처리(수업을 만들지 않음)", /export async function createAcademyClosure/.test(leaveActions) && /status:\s*"SCHEDULED"/.test(leaveActions) && !/classSession\.create/.test(leaveActions) && /applyClassLeave\(tx/.test(leaveActions));
  const classroom = read("src/lib/studentClassroom.ts");
  check("remainingLessons: totalSessions - (COMPLETED|MAKEUP_NEEDED) 계산이 그대로", /enrollment\.totalSessions - sessions\.filter\(\(s\) => s\.status === "COMPLETED" \|\| s\.status === "MAKEUP_NEEDED"\)\.length/.test(classroom));
  const enrollActions = read("src/app/(admin)/enrollments/actions.ts");
  const deleteFn = enrollActions.slice(enrollActions.indexOf("export async function deleteEnrollment"));
  check(
    "deleteEnrollment: 수업이 있으면 막고(오류 메시지 반환), 삭제 자체는 prisma.enrollment.delete 한 줄 그대로(세션 정리 없음)",
    /countSessionsBlockingDeletion\(prisma, id\)/.test(deleteFn) &&
      /return \{ error: deletionBlockedMessage\(blocking\) \};/.test(deleteFn) &&
      /await prisma\.enrollment\.delete\(\{ where: \{ id \} \}\);/.test(deleteFn) &&
      !/classSession\.(delete|deleteMany|update)/.test(deleteFn),
  );
  check("enrollments/actions.ts에는 classSession 생성이 추가되지 않았고 계획기와 연결되지 않음", !/classSession\.create/.test(enrollActions) && !/sessionPlan/.test(enrollActions));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
