// 정규 수업 재배치(cascade)에서 "연기된 수업이 들어갈 다음 유효한 정규 슬롯"을 고르는 순수 함수.
//
// 정책: 정규 수업 시퀀스는 연기된 수업을 건너뛰고 뒤로 순차적으로 밀린다. 예) 월/수/금에서 수요일을 연기하면
//   월 → 수(연기) → 금 → 월 → 수 → 금   ⇒   월 → 금 → 월 → 수 → 금 → 월
// 시퀀스를 한 칸씩 미는 것과, "연기된 날짜를 비우고 연기된 수업 이후 첫 번째 비어 있는 유효 슬롯 하나를 채우는 것"은 날짜 집합이 정확히
// 같다(수업 행끼리는 서로 구별되지 않는다). 그래서 실제 DB 변경은 필요한 최소(연기 행 1개 + 채워지는 슬롯 1개)로 하고, 그 결과가
// 전체 시퀀스를 실제로 한 칸씩 민 것과 같다는 것은 test-regularSlot.ts가 "한 칸씩 미는 참조 구현"과 비교해 증명한다.
//
// 유효한 슬롯 = 수강의 수업 요일 + 요일별 수업 시각이고, 아래는 건너뛴다:
//  - 이미 그 수강의 정규 수업(어떤 상태든)이나 자동 생성 키(generationKey)가 차지한 날짜 — 같은 날 정규 수업이 둘이 되면 안 된다
//  - 학원 휴강일(KST 날짜)
//  - 강사/학생의 다른 일정과 시간이 겹치는 슬롯
import { formatAppDate, parseAppDateTime } from "./appTime";

export interface BusyInterval {
  start: number; // epoch ms
  end: number;
}

export interface Slot {
  /** KST 달력 날짜 "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" (KST) */
  time: string;
  scheduledAt: Date;
}

export interface NextSlotInput {
  /** 수업 요일(0=일~6=토) */
  weekdays: readonly number[];
  /** 요일별 수업 시각 "HH:mm" */
  timeByWeekday: (weekday: number) => string;
  durationMin: number;
  /** 이 순간보다 "엄밀히 뒤"에 시작하는 슬롯만 후보다. */
  lowerBound: Date;
  /** 이 수강의 정규 수업(상태 무관)이나 generationKey가 이미 차지한 KST 날짜 */
  occupiedDates: ReadonlySet<string>;
  closureDates: ReadonlySet<string>;
  /** 강사/학생/레벨테스트의 다른 일정(겹치면 그 슬롯은 건너뛴다) */
  busy: readonly BusyInterval[];
  /** 탐색 상한(일). 기본 400일. */
  horizonDays?: number;
}

export const DEFAULT_SLOT_HORIZON_DAYS = 400;

function timeOrFallback(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return fallback;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** 요일별 수업 시각 규칙: classTimes[요일] → classTime → fallbackTime(보통 그 수업 자신의 시각). 형식이 이상한 값은 건너뛴다. */
export function buildTimeByWeekday(enrollment: { classTime: string | null; classTimes: unknown }, fallbackTime: string): (weekday: number) => string {
  const overrides =
    enrollment.classTimes && typeof enrollment.classTimes === "object" && !Array.isArray(enrollment.classTimes)
      ? (enrollment.classTimes as Record<string, unknown>)
      : {};
  return (w: number) => timeOrFallback(overrides[String(w)], timeOrFallback(enrollment.classTime, fallbackTime));
}

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

/** "YYYY-MM-DD"에 달력 일수를 더한다(UTC 달력 산술 — 서버 시간대와 무관). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOfIso(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Enrollment.endDate는 "그 날짜의 UTC 자정"으로 저장된다(planner의 isoOfDateOnly와 동일). */
export function endDateToIso(endDate: Date): string {
  return endDate.toISOString().slice(0, 10);
}

export function isoToEndDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function overlaps(aStart: number, aEnd: number, busy: readonly BusyInterval[]): boolean {
  return busy.some((b) => aStart < b.end && b.start < aEnd);
}

/** lowerBound 이후 첫 번째 비어 있는 유효 정규 슬롯. 없으면 null. */
export function findNextFreeRegularSlot(input: NextSlotInput): Slot | null {
  const days = [...new Set(input.weekdays)];
  if (days.length === 0) return null;
  const horizon = input.horizonDays ?? DEFAULT_SLOT_HORIZON_DAYS;
  const startIso = formatAppDate(input.lowerBound);
  for (let i = 0; i <= horizon; i++) {
    const date = addDaysIso(startIso, i);
    const weekday = weekdayOfIso(date);
    if (!days.includes(weekday)) continue;
    if (input.occupiedDates.has(date) || input.closureDates.has(date)) continue;
    const time = input.timeByWeekday(weekday);
    const scheduledAt = parseAppDateTime(`${date}T${time}`);
    if (Number.isNaN(scheduledAt.getTime())) continue;
    if (scheduledAt.getTime() <= input.lowerBound.getTime()) continue;
    const startMs = scheduledAt.getTime();
    if (overlaps(startMs, startMs + input.durationMin * MS_PER_MINUTE, input.busy)) continue;
    return { date, time, scheduledAt };
  }
  return null;
}

/** 수강 종료일(UTC 자정으로 저장된 날짜)이 새 슬롯 날짜보다 앞이면 슬롯 날짜로 늘린다. 늘릴 필요가 없으면 null. */
export function extendedEndDate(currentEndDate: Date, slotDate: string): Date | null {
  return slotDate > endDateToIso(currentEndDate) ? isoToEndDate(slotDate) : null;
}

export { MS_PER_DAY };
