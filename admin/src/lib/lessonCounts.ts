// 정규 수업과 보충수업을 완전히 분리해서 세는 단일 helper — 학생 강의실, 마케팅 API, 관리자 수강 목록, 출석 증명서가 전부 이걸 쓴다.
//
// 정책: 보충수업은 정규 등록 회차(totalSessions)를 소모하지 않는다.
//   정규 20회 중 19회 + 보충 1회 완료 → 정규 잔여 1회, 보충 1회, 받은 수업 합계 20회
//   정규 20회 + 보충 1회             → 제공 가능한 수업 21회 (totalSessions는 그대로 20)
// 정규 수업을 "받은" 것으로 치는 상태: COMPLETED, MAKEUP_NEEDED(학생 결석 — 기존 정책 그대로 회차는 소진).

export interface CountableSession {
  status: string;
  isSupplement: boolean;
}

export interface LessonCounts {
  /** 등록한 정규 회차(Enrollment.totalSessions) — 보충과 무관하게 그대로다. */
  regularTotal: number;
  regularTaken: number;
  regularRemaining: number;
  /** 유효한(취소/휴강/홀드가 아닌) 보충수업 수 */
  supplementTotal: number;
  supplementTaken: number;
  supplementRemaining: number;
  /** 실제로 받은 수업 합계(정규 + 보충) */
  providedLessons: number;
  /** 제공 가능한 수업 합계(정규 등록 회차 + 보충) */
  availableLessons: number;
}

const TAKEN = new Set(["COMPLETED", "MAKEUP_NEEDED"]);
// 보충수업으로 "제공되는" 수업: 예정/완료/결석. 취소·휴강·홀드된 보충은 제공량에 넣지 않는다.
const SUPPLEMENT_COUNTED = new Set(["SCHEDULED", "COMPLETED", "MAKEUP_NEEDED"]);

export function countLessons(sessions: readonly CountableSession[], regularTotal: number): LessonCounts {
  let regularTaken = 0;
  let supplementTotal = 0;
  let supplementTaken = 0;
  let supplementRemaining = 0;
  for (const s of sessions) {
    if (s.isSupplement) {
      if (!SUPPLEMENT_COUNTED.has(s.status)) continue;
      supplementTotal++;
      if (TAKEN.has(s.status)) supplementTaken++;
      else supplementRemaining++;
    } else if (TAKEN.has(s.status)) {
      regularTaken++;
    }
  }
  return {
    regularTotal,
    regularTaken,
    regularRemaining: Math.max(0, regularTotal - regularTaken),
    supplementTotal,
    supplementTaken,
    supplementRemaining,
    providedLessons: regularTaken + supplementTaken,
    availableLessons: regularTotal + supplementTotal,
  };
}
