// 정규 강사의 유급휴가(PAID LEAVE) 정책 — 순수 함수. DB 접근은 teacherPaidLeave.ts가 한다.
//
// 확정 정책:
//  - 정규 강사(Teacher.employmentType = REGULAR)만 대상이다.
//  - 달력 기준: 1/1~6/30 최대 5회, 7/1~12/31 최대 5회, 연간 최대 10회(입사일 기준 rolling이 아니다). 승인된 건만 센다.
//  - 승인 원칙은 휴가일 이전. 휴가일이 지난 뒤의 승인/수정은 관리자(ADMIN)만 할 수 있고 사후 승인으로 기록한다.
//  - 승인된 1건의 급여는 강사 레이트 × 8 — 그날 학생 수업이 몇 건이든 같다(같은 강사·같은 날은 DB unique로 1건).
//  - 일반 LEAVE(개인 사정, 정전, 인터넷 문제, 지각 등)는 이 정책과 무관하다: 급여 0, 한도 미차감.
import { formatAppDate } from "./appTime";

export const PAID_LEAVE_HALF_YEAR_MAX = 5;
export const PAID_LEAVE_YEAR_MAX = 10;
export const PAID_LEAVE_RATE_UNITS = 8;

/** "YYYY-MM-DD" → { year, half(1|2) } — 1~6월은 1, 7~12월은 2. */
export function paidLeavePeriod(leaveDate: string): { year: number; half: 1 | 2 } {
  const [y, m] = leaveDate.split("-").map(Number);
  return { year: y, half: m <= 6 ? 1 : 2 };
}

export type PaidLeaveQuotaCheck =
  | { ok: true; halfUsed: number; yearUsed: number }
  | { ok: false; error: "HALF_YEAR_QUOTA_EXCEEDED" | "YEAR_QUOTA_EXCEEDED"; halfUsed: number; yearUsed: number };

/**
 * 이 휴가일을 승인해도 한도 안인지. existingApprovedDates는 같은 강사의 "이미 승인된" 유급휴가일(이 건 자신은 제외).
 * 반기 한도를 먼저 본다(반기 5회 × 2 = 10회라 연간 한도는 반기 한도가 다 지켜지면 자동으로 지켜지지만, 정책을 코드로 그대로 둔다).
 */
export function checkPaidLeaveQuota(leaveDate: string, existingApprovedDates: readonly string[]): PaidLeaveQuotaCheck {
  const p = paidLeavePeriod(leaveDate);
  let halfUsed = 0;
  let yearUsed = 0;
  for (const d of new Set(existingApprovedDates)) {
    const q = paidLeavePeriod(d);
    if (q.year !== p.year) continue;
    yearUsed++;
    if (q.half === p.half) halfUsed++;
  }
  if (halfUsed >= PAID_LEAVE_HALF_YEAR_MAX) return { ok: false, error: "HALF_YEAR_QUOTA_EXCEEDED", halfUsed, yearUsed };
  if (yearUsed >= PAID_LEAVE_YEAR_MAX) return { ok: false, error: "YEAR_QUOTA_EXCEEDED", halfUsed, yearUsed };
  return { ok: true, halfUsed, yearUsed };
}

export type PaidLeaveTimingCheck = { ok: true; postApproval: boolean } | { ok: false; error: "POST_APPROVAL_ADMIN_ONLY" };

/** 승인 시점(KST 날짜)이 휴가일보다 뒤면 사후 승인 — 관리자(ADMIN)만 가능하다. 휴가일 당일까지는 사전 승인으로 본다. */
export function checkPaidLeaveApprovalTiming(input: { leaveDate: string; now: Date; actorRole: string }): PaidLeaveTimingCheck {
  const postApproval = formatAppDate(input.now) > input.leaveDate;
  if (postApproval && input.actorRole !== "ADMIN") return { ok: false, error: "POST_APPROVAL_ADMIN_ONLY" };
  return { ok: true, postApproval };
}

/** 승인된 유급휴가 1건의 급여(레이트 × 8). 학생 수와 무관하다. */
export function paidLeavePay(ratePerUnit: number): number {
  return Math.round(ratePerUnit * PAID_LEAVE_RATE_UNITS);
}
