import type { ISODate, ISOTime, WeekDay } from "./types";

const MS_PER_DAY = 86_400_000;
/** Asia/Seoul is a fixed UTC+9 offset year-round (no DST). */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function assertIsoDate(date: ISODate): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid ISODate: "${date}"`);
  }
}

/** Days since the Unix epoch for a given calendar date, computed via Date.UTC (no local-TZ drift). */
export function toEpochDay(date: ISODate): number {
  assertIsoDate(date);
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromEpochDay(n: number): ISODate {
  const ms = n * MS_PER_DAY;
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(date) + n);
}

/** 0 = Sunday .. 6 = Saturday. */
export function dayOfWeek(date: ISODate): WeekDay {
  // epoch day 0 (1970-01-01) was a Thursday (4).
  return (((toEpochDay(date) + 4) % 7) + 7) % 7 as WeekDay;
}

export function compareDates(a: ISODate, b: ISODate): number {
  return toEpochDay(a) - toEpochDay(b);
}

export function isAfter(a: ISODate, b: ISODate): boolean {
  return compareDates(a, b) > 0;
}

/** Combines a date + KST wall-clock time into a real UTC epoch millisecond timestamp. */
export function combineDateTimeMs(date: ISODate, time: ISOTime): number {
  assertIsoDate(date);
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error(`Invalid ISOTime: "${time}"`);
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  // Date.UTC(y,m,d,hh,mm) treats hh:mm as UTC; subtracting the KST offset converts
  // "this wall-clock time in Seoul" into the correct absolute UTC instant.
  return Date.UTC(y, m - 1, d, hh, mm) - KST_OFFSET_MS;
}

export function hoursBetween(fromMs: number, toMs: number): number {
  return (toMs - fromMs) / (60 * 60 * 1000);
}

/** First day of the calendar month containing `date`, e.g. "2026-08-17" -> "2026-08-01". */
export function firstOfMonth(date: ISODate): ISODate {
  const [y, m] = date.split("-");
  return `${y}-${m}-01`;
}

/** Adds whole calendar months to `date` (clamped to day 1 first, so this is always exact —
 * no day-count drift across months of different lengths). */
export function addMonths(date: ISODate, n: number): ISODate {
  const [y, m] = firstOfMonth(date).split("-").map(Number);
  const total = (m - 1) + n;
  const targetYear = y + Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12;
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`;
}

export function todayIso(): ISODate {
  return new Date().toISOString().slice(0, 10);
}
