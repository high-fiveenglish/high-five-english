// 월평가서는 달력 월이 아니라 "그 수강 건의 완료된 수업 수"를 기준으로 한 회차제다.
// 회차 길이는 등록 당시 주당 수업 횟수로 정해진다(약 4주치 수업 수) — 관리자·강사
// 양쪽 화면이 같은 계산을 쓰도록 이 파일 하나로 공유한다.
export const SESSIONS_PER_CYCLE_BY_WEEKDAY_COUNT: Record<number, number> = {
  2: 8,
  3: 12,
  4: 16,
  5: 20,
};

/** 이 주당 횟수에 대응하는 회차 길이. 표준 4가지(주2/3/4/5회)가 아니면 null —
 * 그런 커스텀 스케줄은 회차 자동 계산 대상이 아니라는 뜻이다. */
export function sessionsPerCycleFor(weekdayCount: number): number | null {
  return SESSIONS_PER_CYCLE_BY_WEEKDAY_COUNT[weekdayCount] ?? null;
}

export type CompletedSessionRef = { id: number; scheduledAt: Date };

export type CycleInfo = {
  cycleNumber: number;
  sessionsPerCycle: number;
  /** 이 회차에 포함되는 첫 수업(시간순). */
  startSession: CompletedSessionRef;
  /** 이 회차에 포함되는 마지막 수업(시간순) — 이 수업까지 끝나야 이 회차가 "완료"된다. */
  endSession: CompletedSessionRef;
};

/** completedSessions는 반드시 status=COMPLETED만, scheduledAt 오름차순으로 전달한다.
 * 완료된 수업 수가 sessionsPerCycle의 배수에 도달한 만큼만 회차가 생긴다 — 아직 다
 * 안 끝난 진행 중 회차는 목록에 없다(평가서를 쓸 수 있는 시점이 아니므로). */
export function computeCompletedCycles(
  completedSessions: CompletedSessionRef[],
  sessionsPerCycle: number,
): CycleInfo[] {
  const totalCycles = Math.floor(completedSessions.length / sessionsPerCycle);
  const cycles: CycleInfo[] = [];
  for (let n = 1; n <= totalCycles; n++) {
    cycles.push({
      cycleNumber: n,
      sessionsPerCycle,
      startSession: completedSessions[(n - 1) * sessionsPerCycle],
      endSession: completedSessions[n * sessionsPerCycle - 1],
    });
  }
  return cycles;
}
