// 강사 "근무 가능 시간" 체크박스와 홈페이지 강사소개의 "근무시간" 표시가 공유하는
// 30분 단위 시간대 정의. 값은 자정 기준 분(minute-of-day)으로 저장한다 — 예:
// 06:00 = 360, 06:30 = 390 ... 23:30 = 1410. Teacher.availableHours(Int[])에는
// 이 minute-of-day 값들이 그대로 들어간다(과거에는 시(hour) 단위였으나, 30분
// 단위로 세분화하며 의미를 바꿨다).
export const AVAILABLE_TIME_SLOT_MINUTES: number[] = [];
for (let m = 6 * 60; m < 24 * 60; m += 30) {
  AVAILABLE_TIME_SLOT_MINUTES.push(m);
}

/** minute-of-day → "HH:mm" (기준시=Asia/Seoul, 표시용 포맷일 뿐 실제 타임존 변환은 없음). */
export function formatMinuteOfDay(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** 연속된 30분 슬롯을 하나의 구간으로 묶어 "06:00~08:00, 14:00~15:30"처럼
 * 사람이 읽기 좋은 문자열로 만든다. 연속되지 않는 슬롯은 쉼표로 구분한 별도 구간이 된다. */
export function formatAvailableTimeRanges(minutesOfDay: number[]): string | null {
  if (minutesOfDay.length === 0) return null;
  const sorted = [...minutesOfDay].sort((a, b) => a - b);

  const ranges: { start: number; end: number }[] = [];
  for (const m of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.end === m) {
      last.end = m + 30;
    } else {
      ranges.push({ start: m, end: m + 30 });
    }
  }

  return ranges.map((r) => `${formatMinuteOfDay(r.start)}~${formatMinuteOfDay(r.end)}`).join(", ");
}

/** "HH:mm" → 자정 기준 분(minute-of-day). */
export function timeStringToMinuteOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 강사가 등록해둔 30분 단위 근무가능 슬롯(availableHours)이 [startMinute,
 * startMinute+durationMin) 구간을 전부 커버하는지 확인한다 — 수업 시작 시각이 30분
 * 격자에 정확히 맞지 않아도(예: 19:15 시작) 겹치는 슬롯을 전부 요구한다. 레벨테스트
 * 등록, 대체수업 추가, 정규수업(수강신청) 강사 배정 등 "이 시간에 근무 가능한
 * 강사만" 걸러야 하는 모든 곳이 이 함수를 공유한다.
 */
export function isWithinAvailableHours(availableHours: number[], startMinute: number, durationMin: number): boolean {
  if (durationMin <= 0) return false;
  const slots = new Set(availableHours);
  const endMinute = startMinute + durationMin;
  let blockStart = Math.floor(startMinute / 30) * 30;
  while (blockStart < endMinute) {
    if (!slots.has(blockStart)) return false;
    blockStart += 30;
  }
  return true;
}
