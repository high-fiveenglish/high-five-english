import type { Enrollment, RescheduleRequest } from "./types";

// Reschedules a student may use per month, keyed by weekly class frequency — matches the
// priced course frequencies (freq2/freq3/freq5, see data/pricing.ts). The enrollment's
// total allowance is this rate multiplied by its contracted length in months.
const MONTHLY_ALLOWANCE_BY_WEEKLY_COUNT: Record<number, number> = {
  2: 1,
  3: 2,
  5: 3,
};

/** Falls back to the nearest known weekly frequency (2/3/5) for any other class-day
 * count, so an unusual schedule still gets a sane allowance instead of none at all. */
function monthlyAllowanceFor(weeklyCount: number): number {
  const known = Object.keys(MONTHLY_ALLOWANCE_BY_WEEKLY_COUNT).map(Number);
  if (known.includes(weeklyCount)) return MONTHLY_ALLOWANCE_BY_WEEKLY_COUNT[weeklyCount];
  const nearest = known.reduce((a, b) => (Math.abs(b - weeklyCount) < Math.abs(a - weeklyCount) ? b : a));
  return MONTHLY_ALLOWANCE_BY_WEEKLY_COUNT[nearest];
}

/** Enrollment has no separate "plan length" field, so the contracted month count is
 * derived from totalLessons at a nominal 4 lessons/week/month — a 60-lesson enrollment
 * at 5x/week reads as 3 months, matching the 3-month package it corresponds to. */
function contractedMonths(enrollment: Enrollment): number {
  const lessonsPerMonth = enrollment.weeklyDays.length * 4;
  return Math.max(1, Math.round(enrollment.totalLessons / lessonsPerMonth));
}

export interface RescheduleAllowance {
  /** Total reschedules this enrollment's plan allows the student to use. */
  total: number;
  /** How many of those the student has already used (cause "rescheduled"). */
  usedByStudent: number;
  /** Reschedules caused by the school (teacher absence, academy closure, admin
   * correction) — tracked separately and never deducted from the student's allowance. */
  usedByAdmin: number;
}

export function computeRescheduleAllowance(
  enrollment: Enrollment,
  rescheduleRequests: RescheduleRequest[],
): RescheduleAllowance {
  const total = monthlyAllowanceFor(enrollment.weeklyDays.length) * contractedMonths(enrollment);
  const usedByStudent = rescheduleRequests.filter((r) => r.initiatedBy === "student").length;
  const usedByAdmin = rescheduleRequests.filter((r) => r.initiatedBy !== "student").length;
  return { total, usedByStudent, usedByAdmin };
}
