import { WEEKDAYS, parseScheduleDaysLabel } from "@/lib/weekdays";

export { parseScheduleDaysLabel };

// 월~일 표시 순서 — enrollments/actions.ts의 체크박스 제출 순서 정렬과 동일한 기준.
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function dayLabel(day: number): string {
  return WEEKDAYS.find((d) => d.value === day)!.label;
}

/** 같은 시간을 쓰는 요일끼리 묶어 "월~금" 또는 "월수금"처럼 표시용 라벨을 만든다.
 * 3일 이상 연속된 요일일 때만 물결표로 축약하고, 그 외에는 글자를 이어붙인다. */
function formatDayGroupLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => WEEKDAY_DISPLAY_ORDER.indexOf(a) - WEEKDAY_DISPLAY_ORDER.indexOf(b));
  const indices = sorted.map((d) => WEEKDAY_DISPLAY_ORDER.indexOf(d));
  const isContiguousRun = sorted.length >= 3 && indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
  if (isContiguousRun) return `${dayLabel(sorted[0])}~${dayLabel(sorted[sorted.length - 1])}`;
  return sorted.map(dayLabel).join("");
}

/**
 * 수강내역관리 목록의 "요일" 컬럼용 — scheduleDays + classTime(s)로부터 요일과 실제 시각을
 * 함께 보여주는 문자열을 만든다. 모든 요일 시간이 같으면 "월~금 - 17:30"처럼 한 덩어리로,
 * 요일별로 시간이 다르면 같은 시간을 쓰는 요일끼리 묶어 "월수 - 17:30, 금 - 17:00"처럼
 * 쉼표로 나열한다.
 */
export function formatScheduleDayTime(scheduleDays: string, classTime: string | null, classTimes: unknown): string {
  const days = parseScheduleDaysLabel(scheduleDays).sort(
    (a, b) => WEEKDAY_DISPLAY_ORDER.indexOf(a) - WEEKDAY_DISPLAY_ORDER.indexOf(b),
  );
  if (days.length === 0) return "-";

  const byTime = new Map<string, number[]>();
  for (const day of days) {
    const time = resolveScheduleTime(classTime, classTimes, day) ?? "";
    const list = byTime.get(time) ?? [];
    list.push(day);
    byTime.set(time, list);
  }

  const groups = [...byTime.entries()].sort(
    (a, b) =>
      Math.min(...a[1].map((d) => WEEKDAY_DISPLAY_ORDER.indexOf(d))) -
      Math.min(...b[1].map((d) => WEEKDAY_DISPLAY_ORDER.indexOf(d))),
  );

  return groups
    .map(([time, groupDays]) => {
      const label = formatDayGroupLabel(groupDays);
      return time ? `${label} - ${time}` : label;
    })
    .join(", ");
}

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
