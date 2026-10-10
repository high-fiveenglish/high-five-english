// 학생 연기(Student Postponement) 정책 — 횟수(quota)와 신청 시간 제한. 순수 함수만 둔다(DB 접근 없음).
// 학생 화면, 마케팅 사이트 API, 관리자의 "학생 연기" 버튼이 전부 같은 계산을 쓰도록 이 파일 하나로 모았다.
//
// 확정 정책:
//  - 주 2회: 등록 개월 수 × 1회, 주 3회: × 2회, 주 5회: × 3회. 주 1/4/6/7회는 0회(정책에 값이 없다 — 임의로 다른 값을 적용하지 않는다).
//  - 등록기간 전체 기준이다(월별 reset 없음). 첫 달에 전부 써도 된다.
//  - 관리자는 수강건별로 횟수를 가감할 수 있다(Enrollment.leaveQuotaAdjustment).
//  - 학생이 직접 신청할 때만 수업 시작 2시간 전까지(>= 2시간)라는 제한이 있다. 관리자가 대신 눌러도 횟수는 차감되지만 시간 제한은 없다.
import { parseScheduleDaysLabel } from "./weekdays";

/** 주당 수업 횟수 → 등록 1개월당 연기 허용 횟수. 여기에 없는 횟수(1/4/6/7)는 0이다. */
export const LEAVE_QUOTA_PER_MONTH: Readonly<Record<number, number>> = { 2: 1, 3: 2, 5: 3 };

/** 학생이 직접 연기하려면 수업 시작까지 이 시간 이상 남아 있어야 한다. */
export const STUDENT_LEAVE_MIN_LEAD_MS = 2 * 60 * 60 * 1000;

/** Enrollment.scheduleDays("월수금")에서 주당 수업 횟수(서로 다른 요일 수)를 구한다. */
export function weeklyLessonCount(scheduleDays: string): number {
  return new Set(parseScheduleDaysLabel(scheduleDays)).size;
}

/** 기본 정책값(관리자 가감 전). */
export function policyLeaveQuota(input: { scheduleDays: string; packageMonths: number }): number {
  const perMonth = LEAVE_QUOTA_PER_MONTH[weeklyLessonCount(input.scheduleDays)] ?? 0;
  const months = Number.isFinite(input.packageMonths) && input.packageMonths > 0 ? Math.floor(input.packageMonths) : 0;
  return perMonth * months;
}

export interface LeaveQuotaSummary {
  policyQuota: number;
  adminAdjustment: number;
  effectiveQuota: number;
  usedCount: number;
  remainingCount: number;
}

export function summarizeLeaveQuota(input: {
  scheduleDays: string;
  packageMonths: number;
  adminAdjustment: number;
  usedCount: number;
}): LeaveQuotaSummary {
  const policyQuota = policyLeaveQuota(input);
  const effectiveQuota = Math.max(0, policyQuota + input.adminAdjustment);
  return {
    policyQuota,
    adminAdjustment: input.adminAdjustment,
    effectiveQuota,
    usedCount: input.usedCount,
    remainingCount: Math.max(0, effectiveQuota - input.usedCount),
  };
}

export type QuotaAdjustmentCheck = { ok: true; effectiveQuota: number } | { ok: false; error: "NEGATIVE_QUOTA" | "BELOW_USED"; effectiveQuota: number };

/** 관리자가 가감값을 바꿀 때: 결과 횟수가 음수이거나 이미 쓴 횟수보다 작으면(데이터 모순) 막는다. */
export function checkQuotaAdjustment(input: { policyQuota: number; newAdjustment: number; usedCount: number }): QuotaAdjustmentCheck {
  const effectiveQuota = input.policyQuota + input.newAdjustment;
  if (effectiveQuota < 0) return { ok: false, error: "NEGATIVE_QUOTA", effectiveQuota };
  if (effectiveQuota < input.usedCount) return { ok: false, error: "BELOW_USED", effectiveQuota };
  return { ok: true, effectiveQuota };
}

export type StudentLeadTimeCheck = { ok: true } | { ok: false; error: "ALREADY_STARTED" | "TOO_LATE" };

/**
 * 학생이 직접 신청하는 경우의 2시간 제한. 정확히 2시간 전은 허용, 1ms라도 모자라면 거부, 이미 시작했거나 지난 수업은 거부.
 * 순간(절대 시각) 비교라서 KST/서버 시간대와 무관하다 — scheduledAt은 KST 벽시계 시각을 절대 순간으로 저장한 값이다.
 */
export function checkStudentLeadTime(scheduledAt: Date, now: Date): StudentLeadTimeCheck {
  const lead = scheduledAt.getTime() - now.getTime();
  if (lead <= 0) return { ok: false, error: "ALREADY_STARTED" };
  if (lead < STUDENT_LEAVE_MIN_LEAD_MS) return { ok: false, error: "TOO_LATE" };
  return { ok: true };
}

export interface LeaveUsageRow {
  status: string;
  quotaImpact: number;
  source: string | null;
  requestedByRole: string;
  academyClosureId: number | null;
}

/**
 * 학생 연기 사용 횟수 = 승인된 LeaveRequest 중 "지금 유효한 학생 연기"의 수. 새 방식(source 있음)은 quotaImpact(최종 사유가 STUDENT_POSTPONEMENT일 때만 1,
 * 학원 휴강으로 대체되면 0)의 합이고, 새 필드가 생기기 전의 옛 건(source 없음)은 학생이 신청한 건(학원 휴강 제외)을 1회로 센다.
 * 별도 카운터가 없고 행에서 계산하므로, 행을 지우거나 대체해도 이중으로 차감/복구되지 않는다.
 */
export function usedFromLeaveRows(rows: readonly LeaveUsageRow[]): number {
  let used = 0;
  for (const r of rows) {
    if (r.status !== "APPROVED") continue;
    if (r.source === null) {
      if (r.requestedByRole === "STUDENT" && r.academyClosureId === null) used += 1;
    } else {
      used += r.quotaImpact;
    }
  }
  return used;
}
