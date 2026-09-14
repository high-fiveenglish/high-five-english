import { parseScheduleDaysLabel } from "@/lib/weekdays";

export { parseScheduleDaysLabel };

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 시작일 + 수업 요일 + 총 회차로부터 마지막 수업일(=수강 종료일)을 계산한다.
 * 공휴일/휴강 등은 고려하지 않는 단순 계산이다 — 실제 수업이 생성되는 시점에
 * 조정될 수 있으므로 등록 시점의 참고용 기본값으로만 쓴다.
 */
export function computeEndDate(startDate: string, weekdayValues: number[], totalSessions: number): string | null {
  if (!startDate || weekdayValues.length === 0 || totalSessions <= 0) return null;

  const cursor = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return null;

  let count = 0;
  const maxIterations = 366 * 5; // 최대 5년치 탐색으로 무한루프 방지
  for (let i = 0; i < maxIterations; i++) {
    if (weekdayValues.includes(cursor.getUTCDay())) {
      count += 1;
      if (count === totalSessions) return toIsoDate(cursor);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function timeRangesOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  return startA < startB + durationB && startB < startA + durationA;
}

/** classTime(기본)/classTimes(요일별 오버라이드, JSON)로부터 특정 요일의 실제 시각을 구한다. */
export function resolveScheduleTime(
  classTime: string | null,
  classTimes: unknown,
  day: number,
): string | null {
  if (classTimes && typeof classTimes === "object") {
    const override = (classTimes as Record<string, string>)[String(day)];
    if (override) return override;
  }
  return classTime;
}

export type ScheduleConflictCandidate = {
  weekdayValues: number[];
  classTime: string | null;
  classTimes: Record<string, string>;
  durationMin: number;
};

export type OtherEnrollmentSchedule = {
  id: number;
  scheduleDays: string;
  classTime: string | null;
  classTimes: unknown;
  classDurationMin: number;
};

/** 후보 요일별 시각 패턴이 같은 강사의 다른 활성 수강 건과 시간대가 겹치는지 확인한다. */
export function findRecurringScheduleConflicts(
  candidate: ScheduleConflictCandidate,
  others: OtherEnrollmentSchedule[],
): OtherEnrollmentSchedule[] {
  const conflicting: OtherEnrollmentSchedule[] = [];
  for (const other of others) {
    const otherDays = parseScheduleDaysLabel(other.scheduleDays);
    const overlapsDay = candidate.weekdayValues.some((day) => otherDays.includes(day));
    if (!overlapsDay) continue;

    const hasTimeOverlap = candidate.weekdayValues.some((day) => {
      if (!otherDays.includes(day)) return false;
      const candidateTime = resolveScheduleTime(candidate.classTime, candidate.classTimes, day);
      const otherTime = resolveScheduleTime(other.classTime, other.classTimes, day);
      if (!candidateTime || !otherTime) return false;
      return timeRangesOverlap(
        timeToMinutes(candidateTime),
        candidate.durationMin,
        timeToMinutes(otherTime),
        other.classDurationMin,
      );
    });
    if (hasTimeOverlap) conflicting.push(other);
  }
  return conflicting;
}
