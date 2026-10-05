// Enrollment → ClassSession "dry-run" 계획기(순수 함수, DB/네트워크 접근 없음).
//
// 목적: 현재 ACTIVE 수강 건을 기준으로 "앞으로 생성되어야 할 ClassSession"을 계산해 관리자에게
// 보여주는 것까지만 한다. 이 파일은 어떤 것도 쓰지 않는다 — prisma를 import하지 않으며, 입력(수강 건/기존
// 세션/강사 일정)을 받아 계산 결과를 돌려줄 뿐이다. 실제 생성은 별도 승인 후 별도 PR의 몫이다.
//
// 확정된 설계 원칙(이 파일이 구현하는 것):
//  1) 과거 세션 생성 금지 — 오늘(KST) 이전 날짜는 생성 대상이 아니다. 과거 수업을 COMPLETED로 소급하지 않는다.
//     오늘 수업이라도 scheduledAt <= asOf(이미 시작했거나 지금 시작하는 수업)이면 만들지 않는다 — asOf 이후 슬롯만 남는다.
//  2) 계산 범위 — max(오늘 KST, startDate) ~ endDate(포함). scheduleDays 요일만, 요일별 시각은 classTimes 오버라이드가
//     있으면 그것을, 없으면 classTime을 쓴다. 길이는 classDurationMin. scheduledAt은 KST(+09:00) 기준 절대 순간.
//  3) 휴강/홀드 의미는 건드리지 않는다 — 이 파일은 leaveApply/holdApply/createAcademyClosure를 import하지 않는다.
//  4) 충돌 — 같은 강사의 다른 수강 건/기존 수업/레벨테스트와 시간이 겹치면 그 수강 건 전체를 자동 생성 대상에서
//     제외(CONFLICT)하고 결과에 표시한다. 강제로 만들지 않으며, 그룹수업/데이터 오류 여부는 추측하지 않는다.
//  5) 중복 — 현재 DB에는 (enrollmentId, scheduledAt) unique 제약이 없다. 그래서 같은 수강 건·같은 KST 날짜에
//     (soft-delete 되지 않은, 보충수업이 아닌) 세션이 이미 있으면 그 날짜는 만들지 않는다. 실제 생성 단계는 별도 승인 후
//     advisory lock + ClassSession.generationKey(unique) + generationBatchId로 구현했다(lib/sessionGeneration.ts) —
//     PlannedSession.key가 그 멱등성 키(`enrollmentId:YYYY-MM-DD`)이고, 나머지 필드는 createMany 행에 그대로 쓸 수 있는 형태다.
//  6) 휴강일(AcademyClosure)에는 만들지 않는다(종료일은 연장하지 않는다 — 휴강/endDate 정책은 그대로).
//  7) 다요일 수강은 요일별 시각(classTimes)이 모든 요일에 명시된 경우에만 "시각 검증됨"으로 본다. 아니면 계산은 하되
//     generationEligible=false — 실제 생성 대상이 아니다(단일 요일 수강은 시각이 하나뿐이라 검증된 것으로 본다).
//
// 날짜 관례: Enrollment.startDate/endDate는 "날짜만" 쓰는 UTC 자정 값이다(요일은 getUTCDay로 판정). 반면 ClassSession.
// scheduledAt은 절대 순간이라 KST 날짜는 formatAppDate로 구한다 — 두 관례를 섞지 않는다.

import { parseScheduleDaysLabel, WEEKDAYS } from "./weekdays";
import { formatAppDate, formatAppTime, parseAppDateTime } from "./appTime";
import { isWithinAvailableHours, timeStringToMinuteOfDay } from "./timeSlots";
import { createHash } from "node:crypto";

/** 계획기 버전 — 계획 해시와 배치 기록에 남는다(규칙이 바뀌면 올린다). */
export const PLANNER_VERSION = "session-plan/2";

export type PlanEnrollmentStatus = "APPLIED" | "PAID" | "ACTIVE" | "HOLDING" | "COMPLETED";
export type PlanSessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MAKEUP_NEEDED" | "LEAVE" | "HOLD";

export interface PlanEnrollmentInput {
  id: number;
  status: PlanEnrollmentStatus;
  studentId: number;
  studentName: string;
  teacherId: number | null;
  teacherName: string | null;
  teacherAccountStatus: string | null;
  teacherApprovalStatus: string | null;
  teacherAvailableHours: number[] | null;
  scheduleDays: string;
  classTime: string | null;
  classTimes: unknown;
  classDurationMin: number;
  startDate: Date;
  endDate: Date;
  totalSessions: number;
  /** 휴강(AcademyClosure)의 협력사 범위 판정용 — 학생의 협력사(createAcademyClosure와 같은 기준). */
  studentAgentId?: number | null;
  /** 생성 시점 stale 검사용(계획 이후 수강이 바뀌었는지). */
  updatedAt?: Date;
}

export interface PlanExistingSessionInput {
  id: number;
  enrollmentId: number;
  teacherId: number;
  scheduledAt: Date;
  durationMin: number;
  status: PlanSessionStatus;
  isSupplement: boolean;
  deletedAt: Date | null;
  generationBatchId?: string | null;
}

/** 휴강(AcademyClosure) — date는 KST 자정 순간이고, agentId가 null이면 전체(본사) 휴강이다. */
export interface PlanClosureInput {
  date: Date;
  agentId: number | null;
}

/** 수업이 아닌 다른 일정(레벨테스트 등)이 강사 시간을 점유하는 경우. */
export interface PlanTeacherBusyInput {
  teacherId: number;
  start: Date;
  durationMin: number;
  label: string;
}

export interface PlanInput {
  /** 계산 기준 시각(보통 new Date()). "오늘(KST)"는 이 값에서 구한다. */
  asOf: Date;
  enrollments: PlanEnrollmentInput[];
  existingSessions: PlanExistingSessionInput[];
  teacherBusy?: PlanTeacherBusyInput[];
  closures?: PlanClosureInput[];
  /** 이미 생성 배치로 만들어진 적이 있는 수강(삭제된 세션 포함) — 다시 생성하지 않는다. */
  alreadyGeneratedEnrollmentIds?: number[];
}

export type ExclusionReason =
  | "STATUS_COMPLETED"
  | "STATUS_HOLDING"
  | "STATUS_NOT_ACTIVE"
  | "NO_TEACHER"
  | "TEACHER_INACTIVE"
  | "NO_SCHEDULE_DAYS"
  | "NO_CLASS_TIME"
  | "NO_FUTURE_SLOTS"
  | "ALL_SLOTS_ALREADY_EXIST"
  | "ALREADY_GENERATED";

export type PlanErrorCode =
  | "INVALID_DATE_RANGE"
  | "RANGE_TOO_LONG"
  | "INVALID_DURATION"
  | "INVALID_CLASS_TIME"
  | "INVALID_CLASS_TIMES"
  | "UNKNOWN_SCHEDULE_DAY";

export type PlanWarningCode =
  | "TEACHER_NO_AVAILABLE_HOURS"
  | "SLOT_OUTSIDE_TEACHER_HOURS"
  | "END_DATE_NOT_CLASS_DAY"
  | "UNUSUAL_DURATION"
  | "PLANNED_EXCEEDS_TOTAL_SESSIONS"
  | "STUDENT_SELF_OVERLAP";

export const EXCLUSION_REASON_LABEL: Record<ExclusionReason, string> = {
  STATUS_COMPLETED: "종료된 수강(COMPLETED)",
  STATUS_HOLDING: "홀드 중(HOLDING)",
  STATUS_NOT_ACTIVE: "진행중(ACTIVE)이 아닌 상태",
  NO_TEACHER: "배정된 강사 없음",
  TEACHER_INACTIVE: "강사 계정이 비활성/미승인",
  NO_SCHEDULE_DAYS: "수업 요일 없음",
  NO_CLASS_TIME: "수업 시각 없음",
  NO_FUTURE_SLOTS: "오늘 이후 생성할 수업일 없음",
  ALL_SLOTS_ALREADY_EXIST: "남은 수업일에 이미 세션이 있음",
  ALREADY_GENERATED: "이미 생성 배치로 세션이 만들어진 수강",
};

export const PLAN_ERROR_LABEL: Record<PlanErrorCode, string> = {
  INVALID_DATE_RANGE: "종료일이 시작일보다 빠름",
  RANGE_TOO_LONG: "수강 기간이 비정상적으로 김",
  INVALID_DURATION: "수업 시간이 올바르지 않음",
  INVALID_CLASS_TIME: "수업 시각 형식 오류",
  INVALID_CLASS_TIMES: "요일별 수업 시각(classTimes) 형식 오류",
  UNKNOWN_SCHEDULE_DAY: "수업 요일 문자열에 알 수 없는 글자",
};

export const PLAN_WARNING_LABEL: Record<PlanWarningCode, string> = {
  TEACHER_NO_AVAILABLE_HOURS: "강사의 근무가능 시간이 등록되어 있지 않음",
  SLOT_OUTSIDE_TEACHER_HOURS: "일부 수업이 강사의 근무가능 시간 밖",
  END_DATE_NOT_CLASS_DAY: "종료일이 수업 요일이 아님",
  UNUSUAL_DURATION: "수업 시간이 25/50분이 아님",
  PLANNED_EXCEEDS_TOTAL_SESSIONS: "생성 예정 수가 총 회차보다 많음",
  STUDENT_SELF_OVERLAP: "같은 학생의 다른 수강과 시간이 겹침",
};

export interface PlannedSession {
  /** 멱등성 키 — 실제 생성 단계에서 partial unique index/중복 판정의 기준이 될 값. */
  key: string;
  enrollmentId: number;
  studentId: number;
  teacherId: number;
  /** KST 날짜 "YYYY-MM-DD". */
  date: string;
  /** KST 시각 "HH:mm". */
  time: string;
  weekday: number;
  scheduledAt: Date;
  durationMin: number;
  status: "SCHEDULED";
  isSupplement: false;
}

export interface ExistingSessionView {
  id: number;
  date: string;
  time: string;
  status: PlanSessionStatus;
  isSupplement: boolean;
  /** 이 세션이 같은 날짜의 생성을 막는지(보충수업은 막지 않는다). */
  blocksDate: boolean;
}

export type ConflictKind = "PLANNED_VS_PLANNED" | "PLANNED_VS_EXISTING_SESSION" | "PLANNED_VS_LEVEL_TEST";

export interface ConflictGroup {
  kind: ConflictKind;
  otherEnrollmentId: number | null;
  otherSessionId: number | null;
  otherLabel: string;
  weekday: number;
  time: string;
  durationMin: number;
  otherTime: string;
  otherDurationMin: number;
  dates: string[];
}

export type Outcome = "ELIGIBLE" | "CONFLICT" | "EXCLUDED" | "ERROR";

export interface EnrollmentPlanRow {
  enrollmentId: number;
  status: PlanEnrollmentStatus;
  studentId: number;
  studentName: string;
  teacherId: number | null;
  teacherName: string | null;
  scheduleDays: string;
  classTime: string | null;
  classTimes: Record<string, string> | null;
  durationMin: number;
  startDate: string;
  endDate: string;
  totalSessions: number;
  outcome: Outcome;
  reasons: ExclusionReason[];
  errors: { code: PlanErrorCode; detail: string }[];
  warnings: PlanWarningCode[];
  /** ELIGIBLE이면 생성 예정, CONFLICT이면 "만들 수 있었지만 보류된" 후보. 그 외에는 빈 배열. */
  plannedSessions: PlannedSession[];
  willCreateCount: number;
  withheldCount: number;
  skippedPastDates: string[];
  /** 오늘 수업이지만 scheduledAt <= asOf라 만들지 않은 슬롯(KST 날짜). */
  skippedStartedToday: string[];
  /** 휴강일이라 만들지 않은 슬롯(KST 날짜). */
  skippedClosure: string[];
  skippedExisting: { date: string; sessionId: number; status: PlanSessionStatus }[];
  alreadyExisting: ExistingSessionView[];
  conflicts: ConflictGroup[];
  /** 요일별 시각이 검증되었는지: 단일 요일=SINGLE_WEEKDAY, 모든 요일에 classTimes 명시=CLASS_TIMES_EXPLICIT, 아니면 UNVERIFIED. */
  timeVerification: TimeVerification;
  /** 실제 생성 대상인지 = outcome ELIGIBLE && 시각 검증됨. */
  generationEligible: boolean;
  /** 계획 시점의 수강 updatedAt(ISO) — 생성 시점 stale 검사용. */
  enrollmentUpdatedAt: string | null;
}

export type TimeVerification = "SINGLE_WEEKDAY" | "CLASS_TIMES_EXPLICIT" | "UNVERIFIED" | "NOT_APPLICABLE";

export interface PlanSummary {
  asOfIso: string;
  todayKst: string;
  totalEnrollmentsInput: number;
  /** 아래 4개(eligible/conflict/excluded/errors)의 합이 totalActive다. */
  totalActive: number;
  eligible: number;
  conflict: number;
  excluded: number;
  errors: number;
  /** ACTIVE가 아니어서 계산하지 않고 제외한 입력 건수(COMPLETED/HOLDING/APPLIED/PAID). */
  nonActiveExcluded: number;
  sessionsWouldBeCreated: number;
  sessionsSkipped: {
    pastDates: number;
    startedToday: number;
    closure: number;
    alreadyExisting: number;
    withheldByConflict: number;
    total: number;
  };
  /** 실제 생성 대상(ELIGIBLE이면서 시각 검증됨) 수강/세션 수 — 시각 미검증 다요일 수강은 제외. */
  generationEligible: number;
  generationSessions: number;
  /** ELIGIBLE이지만 다요일 + 요일별 시각 미검증이라 생성 대상에서 보류된 수강/세션 수. */
  timeUnverifiedEnrollments: number;
  timeUnverifiedSessions: number;
  plannerVersion: string;
  conflictEnrollments: number;
  conflictPairs: number;
  conflictSlots: number;
  excludedByReason: Partial<Record<ExclusionReason, number>>;
  warningsByCode: Partial<Record<PlanWarningCode, number>>;
}

export interface PlanResult {
  rows: EnrollmentPlanRow[];
  summary: PlanSummary;
}

const MAX_SPAN_DAYS = 366 * 3;
const MS_PER_MINUTE = 60_000;
const TIME_RE = /^\d{1,2}:\d{2}$/;

function isoOfDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekdayOfIso(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function normalizeTime(raw: string): string | null {
  if (!TIME_RE.test(raw)) return null;
  const [h, m] = raw.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function eachIsoDate(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  if (fromIso > toIso) return out;
  const cursor = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`).getTime();
  while (cursor.getTime() <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function emptyRow(e: PlanEnrollmentInput): EnrollmentPlanRow {
  return {
    enrollmentId: e.id,
    status: e.status,
    studentId: e.studentId,
    studentName: e.studentName,
    teacherId: e.teacherId,
    teacherName: e.teacherName,
    scheduleDays: e.scheduleDays,
    classTime: e.classTime,
    classTimes: null,
    durationMin: e.classDurationMin,
    startDate: isoOfDateOnly(e.startDate),
    endDate: isoOfDateOnly(e.endDate),
    totalSessions: e.totalSessions,
    outcome: "EXCLUDED",
    reasons: [],
    errors: [],
    warnings: [],
    plannedSessions: [],
    willCreateCount: 0,
    withheldCount: 0,
    skippedPastDates: [],
    skippedStartedToday: [],
    skippedClosure: [],
    skippedExisting: [],
    alreadyExisting: [],
    conflicts: [],
    timeVerification: "NOT_APPLICABLE",
    generationEligible: false,
    enrollmentUpdatedAt: e.updatedAt ? e.updatedAt.toISOString() : null,
  };
}

interface Candidate {
  row: EnrollmentPlanRow;
  enrollment: PlanEnrollmentInput;
}

/**
 * 현재 ACTIVE 수강 건 기준으로 "앞으로 생성되어야 할 ClassSession"을 계산한다. 같은 입력이면 항상 같은 결과다
 * (수강 id 오름차순, 날짜 오름차순으로 정렬) — 두 번 실행해도 결과가 바뀌지 않는다.
 */
export function planClassSessions(input: PlanInput): PlanResult {
  const asOfMs = input.asOf.getTime();
  const todayKst = formatAppDate(input.asOf);
  const enrollments = [...input.enrollments].sort((a, b) => a.id - b.id);

  const existingByEnrollment = new Map<number, PlanExistingSessionInput[]>();
  for (const s of input.existingSessions) {
    if (s.deletedAt) continue;
    const list = existingByEnrollment.get(s.enrollmentId) ?? [];
    list.push(s);
    existingByEnrollment.set(s.enrollmentId, list);
  }

  const alreadyGenerated = new Set(input.alreadyGeneratedEnrollmentIds ?? []);
  const closureList = (input.closures ?? []).map((c) => ({ kstDate: formatAppDate(c.date), agentId: c.agentId }));

  const rows: EnrollmentPlanRow[] = [];
  const candidates: Candidate[] = [];

  // ---- 1단계: 수강 건 단위 검증 + 생성 후보 계산 -----------------------------------------------------------
  for (const e of enrollments) {
    const row = emptyRow(e);
    rows.push(row);

    if (e.status !== "ACTIVE") {
      row.reasons.push(e.status === "COMPLETED" ? "STATUS_COMPLETED" : e.status === "HOLDING" ? "STATUS_HOLDING" : "STATUS_NOT_ACTIVE");
      continue;
    }

    // 입력 형식 오류(ERROR) — 값이 잘못되어 계산 자체를 신뢰할 수 없는 경우.
    if (!Number.isInteger(e.classDurationMin) || e.classDurationMin <= 0) {
      row.errors.push({ code: "INVALID_DURATION", detail: `classDurationMin=${String(e.classDurationMin)}` });
    } else if (e.classDurationMin !== 25 && e.classDurationMin !== 50) {
      row.warnings.push("UNUSUAL_DURATION");
    }
    if (Number.isNaN(e.startDate.getTime()) || Number.isNaN(e.endDate.getTime()) || e.endDate.getTime() < e.startDate.getTime()) {
      row.errors.push({ code: "INVALID_DATE_RANGE", detail: `${String(e.startDate)} ~ ${String(e.endDate)}` });
    } else if ((e.endDate.getTime() - e.startDate.getTime()) / 86_400_000 > MAX_SPAN_DAYS) {
      row.errors.push({ code: "RANGE_TOO_LONG", detail: `${row.startDate} ~ ${row.endDate}` });
    }

    const knownLabels = new Set(WEEKDAYS.map((d) => d.label));
    const unknownChars = [...e.scheduleDays].filter((ch) => !knownLabels.has(ch));
    if (unknownChars.length > 0) row.errors.push({ code: "UNKNOWN_SCHEDULE_DAY", detail: JSON.stringify(e.scheduleDays) });

    const defaultTime = e.classTime === null || e.classTime === "" ? null : normalizeTime(e.classTime);
    if (e.classTime !== null && e.classTime !== "" && defaultTime === null) {
      row.errors.push({ code: "INVALID_CLASS_TIME", detail: JSON.stringify(e.classTime) });
    }

    let overrides: Record<string, string> | null = null;
    if (e.classTimes !== null && e.classTimes !== undefined) {
      if (typeof e.classTimes !== "object" || Array.isArray(e.classTimes)) {
        row.errors.push({ code: "INVALID_CLASS_TIMES", detail: "not an object" });
      } else {
        overrides = {};
        for (const [k, v] of Object.entries(e.classTimes as Record<string, unknown>)) {
          const t = typeof v === "string" ? normalizeTime(v) : null;
          if (!/^[0-6]$/.test(k) || t === null) {
            row.errors.push({ code: "INVALID_CLASS_TIMES", detail: `${k}=${JSON.stringify(v)}` });
          } else {
            overrides[k] = t;
          }
        }
        if (Object.keys(overrides).length === 0) overrides = null;
      }
    }
    row.classTimes = overrides;

    if (row.errors.length > 0) {
      row.outcome = "ERROR";
      continue;
    }

    // 정당한 사유로 자동 생성하지 않는 경우(EXCLUDED).
    const weekdays = [...new Set(parseScheduleDaysLabel(e.scheduleDays))].sort((a, b) => a - b);
    row.timeVerification =
      weekdays.length === 0
        ? "NOT_APPLICABLE"
        : weekdays.length === 1
          ? "SINGLE_WEEKDAY"
          : weekdays.every((d) => overrides?.[String(d)] !== undefined)
            ? "CLASS_TIMES_EXPLICIT"
            : "UNVERIFIED";
    if (weekdays.length === 0) row.reasons.push("NO_SCHEDULE_DAYS");
    if (alreadyGenerated.has(e.id)) row.reasons.push("ALREADY_GENERATED");
    if (e.teacherId === null) row.reasons.push("NO_TEACHER");
    else if (e.teacherAccountStatus !== "ACTIVE" || e.teacherApprovalStatus !== "APPROVED") row.reasons.push("TEACHER_INACTIVE");

    const timeOf = (day: number): string | null => overrides?.[String(day)] ?? defaultTime;
    if (weekdays.length > 0 && weekdays.some((d) => timeOf(d) === null)) row.reasons.push("NO_CLASS_TIME");
    if (row.reasons.length > 0) continue;

    // 날짜 범위: 과거(오늘 이전)는 건너뛰고, max(오늘, startDate) ~ endDate만 후보로 삼는다.
    const startIso = row.startDate;
    const endIso = row.endDate;
    const fromIso = startIso > todayKst ? startIso : todayKst;
    const allDays = eachIsoDate(startIso, endIso).filter((iso) => weekdays.includes(weekdayOfIso(iso)));
    row.skippedPastDates = allDays.filter((iso) => iso < todayKst);
    const windowDays = allDays.filter((iso) => iso >= fromIso);
    if (!weekdays.includes(weekdayOfIso(endIso))) row.warnings.push("END_DATE_NOT_CLASS_DAY");

    // 이미 존재하는 세션.
    const existing = existingByEnrollment.get(e.id) ?? [];
    const existingViews: ExistingSessionView[] = existing
      .map((s) => ({
        id: s.id,
        date: formatAppDate(s.scheduledAt),
        time: formatAppTime(s.scheduledAt),
        status: s.status,
        isSupplement: s.isSupplement,
        blocksDate: !s.isSupplement,
      }))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.id - b.id);
    row.alreadyExisting = existingViews;
    const blockingByDate = new Map<string, ExistingSessionView>();
    for (const v of existingViews) if (v.blocksDate && !blockingByDate.has(v.date)) blockingByDate.set(v.date, v);

    const closureDates = new Set(
      closureList.filter((c) => c.agentId === null || c.agentId === (e.studentAgentId ?? null)).map((c) => c.kstDate),
    );

    const planned: PlannedSession[] = [];
    for (const iso of windowDays) {
      const blocker = blockingByDate.get(iso);
      if (blocker) {
        row.skippedExisting.push({ date: iso, sessionId: blocker.id, status: blocker.status });
        continue;
      }
      if (closureDates.has(iso)) {
        row.skippedClosure.push(iso);
        continue;
      }
      const weekday = weekdayOfIso(iso);
      const time = timeOf(weekday)!;
      const scheduledAt = parseAppDateTime(`${iso}T${time}`);
      // 오늘 이미 시작했거나 지금 시작하는 수업은 만들지 않는다(생성 시각 이후 슬롯만).
      if (scheduledAt.getTime() <= asOfMs) {
        row.skippedStartedToday.push(iso);
        continue;
      }
      planned.push({
        key: `${e.id}:${iso}`,
        enrollmentId: e.id,
        studentId: e.studentId,
        teacherId: e.teacherId!,
        date: iso,
        time,
        weekday,
        scheduledAt,
        durationMin: e.classDurationMin,
        status: "SCHEDULED",
        isSupplement: false,
      });
    }

    if (planned.length === 0) {
      row.reasons.push(windowDays.length > 0 && row.skippedExisting.length === windowDays.length ? "ALL_SLOTS_ALREADY_EXIST" : "NO_FUTURE_SLOTS");
      continue;
    }

    // 경고(생성을 막지는 않는다).
    if (planned.length > e.totalSessions) row.warnings.push("PLANNED_EXCEEDS_TOTAL_SESSIONS");
    const hours = e.teacherAvailableHours;
    if (hours !== null) {
      if (hours.length === 0) row.warnings.push("TEACHER_NO_AVAILABLE_HOURS");
      else if (planned.some((p) => !isWithinAvailableHours(hours, timeStringToMinuteOfDay(p.time), p.durationMin))) {
        row.warnings.push("SLOT_OUTSIDE_TEACHER_HOURS");
      }
    }

    row.plannedSessions = planned;
    candidates.push({ row, enrollment: e });
  }

  // ---- 2단계: 강사 시간 충돌 (생성 후보끼리 / 기존 수업 / 레벨테스트) ----------------------------------------
  // 후보끼리의 충돌은 양쪽 모두 CONFLICT로 표시된다(결과가 처리 순서에 의존하지 않도록).
  const plannedByTeacherDate = new Map<string, { p: PlannedSession; label: string }[]>();
  for (const c of candidates) {
    for (const p of c.row.plannedSessions) {
      const k = `${p.teacherId}|${p.date}`;
      const list = plannedByTeacherDate.get(k) ?? [];
      list.push({ p, label: `수강 #${c.enrollment.id} (${c.enrollment.studentName})` });
      plannedByTeacherDate.set(k, list);
    }
  }
  const existingByTeacher = new Map<number, PlanExistingSessionInput[]>();
  for (const s of input.existingSessions) {
    if (s.deletedAt || (s.status !== "SCHEDULED" && s.status !== "COMPLETED")) continue;
    const list = existingByTeacher.get(s.teacherId) ?? [];
    list.push(s);
    existingByTeacher.set(s.teacherId, list);
  }
  const busyByTeacher = new Map<number, PlanTeacherBusyInput[]>();
  for (const b of input.teacherBusy ?? []) {
    const list = busyByTeacher.get(b.teacherId) ?? [];
    list.push(b);
    busyByTeacher.set(b.teacherId, list);
  }

  const conflictPairKeys = new Set<string>();
  let conflictSlots = 0;

  for (const c of candidates) {
    const groups = new Map<string, ConflictGroup>();
    const addHit = (p: PlannedSession, g: Omit<ConflictGroup, "dates" | "weekday" | "time" | "durationMin">) => {
      const key = `${g.kind}|${g.otherEnrollmentId ?? ""}|${g.otherSessionId ?? ""}|${g.otherLabel}|${p.weekday}|${p.time}|${g.otherTime}`;
      const existing = groups.get(key);
      if (existing) existing.dates.push(p.date);
      else groups.set(key, { ...g, weekday: p.weekday, time: p.time, durationMin: p.durationMin, dates: [p.date] });
    };

    for (const p of c.row.plannedSessions) {
      const start = p.scheduledAt.getTime();
      const end = start + p.durationMin * MS_PER_MINUTE;
      let hit = false;

      for (const other of plannedByTeacherDate.get(`${p.teacherId}|${p.date}`) ?? []) {
        if (other.p.enrollmentId === p.enrollmentId) continue;
        const oStart = other.p.scheduledAt.getTime();
        const oEnd = oStart + other.p.durationMin * MS_PER_MINUTE;
        if (!overlaps(start, end, oStart, oEnd)) continue;
        hit = true;
        conflictPairKeys.add([p.enrollmentId, other.p.enrollmentId].sort((x, y) => x - y).join("-"));
        addHit(p, {
          kind: "PLANNED_VS_PLANNED",
          otherEnrollmentId: other.p.enrollmentId,
          otherSessionId: null,
          otherLabel: other.label,
          otherTime: other.p.time,
          otherDurationMin: other.p.durationMin,
        });
      }

      for (const s of existingByTeacher.get(p.teacherId) ?? []) {
        const sStart = s.scheduledAt.getTime();
        const sEnd = sStart + s.durationMin * MS_PER_MINUTE;
        if (!overlaps(start, end, sStart, sEnd)) continue;
        hit = true;
        addHit(p, {
          kind: "PLANNED_VS_EXISTING_SESSION",
          otherEnrollmentId: s.enrollmentId,
          otherSessionId: s.id,
          otherLabel: `기존 수업 #${s.id} (수강 #${s.enrollmentId}, ${s.status})`,
          otherTime: formatAppTime(s.scheduledAt),
          otherDurationMin: s.durationMin,
        });
      }

      for (const b of busyByTeacher.get(p.teacherId) ?? []) {
        const bStart = b.start.getTime();
        const bEnd = bStart + b.durationMin * MS_PER_MINUTE;
        if (!overlaps(start, end, bStart, bEnd)) continue;
        hit = true;
        addHit(p, {
          kind: "PLANNED_VS_LEVEL_TEST",
          otherEnrollmentId: null,
          otherSessionId: null,
          otherLabel: b.label,
          otherTime: formatAppTime(b.start),
          otherDurationMin: b.durationMin,
        });
      }
      if (hit) conflictSlots++;
    }

    if (groups.size > 0) {
      c.row.conflicts = [...groups.values()]
        .map((g) => ({ ...g, dates: [...g.dates].sort() }))
        .sort((a, b) => a.dates[0].localeCompare(b.dates[0]) || a.kind.localeCompare(b.kind) || a.otherLabel.localeCompare(b.otherLabel));
    }
  }

  // 같은 학생의 서로 다른 수강이 시간이 겹치는지(경고만 — 이번 PR 범위에서는 자동 제외하지 않는다).
  const byStudentDate = new Map<string, PlannedSession[]>();
  for (const c of candidates) {
    for (const p of c.row.plannedSessions) {
      const k = `${p.studentId}|${p.date}`;
      const list = byStudentDate.get(k) ?? [];
      list.push(p);
      byStudentDate.set(k, list);
    }
  }
  for (const c of candidates) {
    const overlapsSelf = c.row.plannedSessions.some((p) =>
      (byStudentDate.get(`${p.studentId}|${p.date}`) ?? []).some((o) => {
        if (o.enrollmentId === p.enrollmentId) return false;
        const s = p.scheduledAt.getTime();
        const os = o.scheduledAt.getTime();
        return overlaps(s, s + p.durationMin * MS_PER_MINUTE, os, os + o.durationMin * MS_PER_MINUTE);
      }),
    );
    if (overlapsSelf) c.row.warnings.push("STUDENT_SELF_OVERLAP");
  }

  // ---- 3단계: 결과 확정 -------------------------------------------------------------------------------------
  for (const c of candidates) {
    const row = c.row;
    if (row.conflicts.length > 0) {
      row.outcome = "CONFLICT";
      row.withheldCount = row.plannedSessions.length;
    } else {
      row.outcome = "ELIGIBLE";
      row.willCreateCount = row.plannedSessions.length;
      row.generationEligible = row.timeVerification === "SINGLE_WEEKDAY" || row.timeVerification === "CLASS_TIMES_EXPLICIT";
    }
  }

  const active = rows.filter((r) => r.status === "ACTIVE");
  const summary: PlanSummary = {
    asOfIso: input.asOf.toISOString(),
    todayKst,
    totalEnrollmentsInput: rows.length,
    totalActive: active.length,
    eligible: active.filter((r) => r.outcome === "ELIGIBLE").length,
    conflict: active.filter((r) => r.outcome === "CONFLICT").length,
    excluded: active.filter((r) => r.outcome === "EXCLUDED").length,
    errors: active.filter((r) => r.outcome === "ERROR").length,
    nonActiveExcluded: rows.length - active.length,
    sessionsWouldBeCreated: active.reduce((n, r) => n + r.willCreateCount, 0),
    sessionsSkipped: { pastDates: 0, startedToday: 0, closure: 0, alreadyExisting: 0, withheldByConflict: 0, total: 0 },
    generationEligible: active.filter((r) => r.generationEligible).length,
    generationSessions: active.filter((r) => r.generationEligible).reduce((n, r) => n + r.willCreateCount, 0),
    timeUnverifiedEnrollments: active.filter((r) => r.outcome === "ELIGIBLE" && !r.generationEligible).length,
    timeUnverifiedSessions: active.filter((r) => r.outcome === "ELIGIBLE" && !r.generationEligible).reduce((n, r) => n + r.willCreateCount, 0),
    plannerVersion: PLANNER_VERSION,
    conflictEnrollments: active.filter((r) => r.outcome === "CONFLICT").length,
    conflictPairs: conflictPairKeys.size,
    conflictSlots,
    excludedByReason: {},
    warningsByCode: {},
  };
  for (const r of active) {
    summary.sessionsSkipped.pastDates += r.skippedPastDates.length;
    summary.sessionsSkipped.startedToday += r.skippedStartedToday.length;
    summary.sessionsSkipped.closure += r.skippedClosure.length;
    summary.sessionsSkipped.alreadyExisting += r.skippedExisting.length;
    summary.sessionsSkipped.withheldByConflict += r.withheldCount;
    if (r.outcome === "EXCLUDED") for (const reason of r.reasons) summary.excludedByReason[reason] = (summary.excludedByReason[reason] ?? 0) + 1;
    for (const w of r.warnings) summary.warningsByCode[w] = (summary.warningsByCode[w] ?? 0) + 1;
  }
  const sk = summary.sessionsSkipped;
  sk.total = sk.pastDates + sk.startedToday + sk.closure + sk.alreadyExisting + sk.withheldByConflict;

  return { rows, summary };
}

/**
 * 승인된 계획의 지문. 같은 입력(같은 asOf, 같은 데이터)이면 항상 같은 값이고, 수강의 결과(outcome/시각 검증/updatedAt)나
 * 생성될 세션(key, 시각, 길이, 강사, 학생)이 하나라도 달라지면 바뀐다. 세션은 generationEligible인 수강의 것만 포함한다
 * (보류된 후보는 결과 줄(E)로만 반영). 실행기는 --expect-plan-hash가 재계산 값과 다르면 어떤 것도 쓰지 않고 중단한다.
 */
export function computePlanHash(rows: EnrollmentPlanRow[]): string {
  const lines: string[] = [`planner=${PLANNER_VERSION}`];
  for (const r of [...rows].sort((a, b) => a.enrollmentId - b.enrollmentId)) {
    lines.push(`E|${r.enrollmentId}|${r.outcome}|${r.generationEligible ? 1 : 0}|${r.timeVerification}|${r.enrollmentUpdatedAt ?? "-"}`);
    if (!r.generationEligible) continue;
    for (const p of r.plannedSessions) {
      lines.push(`S|${p.key}|${p.scheduledAt.toISOString()}|${p.durationMin}|${p.teacherId}|${p.studentId}`);
    }
  }
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** 실제 생성 대상 세션 수(= --expect-sessions와 비교하는 값). */
export function countGenerationSessions(rows: EnrollmentPlanRow[]): number {
  return rows.filter((r) => r.generationEligible).reduce((n, r) => n + r.plannedSessions.length, 0);
}
