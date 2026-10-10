// admin의 공개 classroom API(Authorization: Bearer 토큰)를 호출해, "내 강의실"의
// 수업/휴강/연기 데이터를 실제 DB에서 그대로 가져온다 — studentProfileService.ts와
// 같은 다리(bridge) 패턴. 이 파일이 돌려주는 값은 admin/src/lib/studentClassroom.ts의
// StudentClassroomSnapshot과 정확히 같은 모양이어야 한다.
import { ADMIN_API_URL } from "../lib/adminApi";

export type RealMeetingPlatform = "zoom" | "teams" | "voov";

export type RealLessonStatus =
  | "scheduled"
  | "completed"
  | "absent"
  | "rescheduled"
  | "teacher_absent"
  | "academy_closed"
  | "admin_cancelled"
  | "on_hold";

export type RealLesson = {
  id: number;
  scheduledDate: string;
  scheduledTime: string;
  status: RealLessonStatus;
  reason?: string;
  evaluationStatus: "not_started" | "completed";
  /** 보충수업 여부 — 정규 수업(총 회차에 포함)과 구분한다. 옛 서버 응답에는 없을 수 있다. */
  isSupplement?: boolean;
};

export type RealClosure = { id: number; date: string; reason: string };

export type RealEnrollmentStatus = "APPLIED" | "PAID" | "ACTIVE" | "HOLDING" | "COMPLETED";

export type RealClassroomSnapshot = {
  enrollment: {
    id: number;
    startDate: string;
    endDate: string;
    /** 정규 등록 회차 */
    totalLessons: number;
    /** 정규 잔여 회차 — 보충수업은 정규 회차를 소모하지 않는다. */
    remainingLessons: number;
    /** 보충수업(제공되는 것) 수 / 그 중 받은 수 / 받은 수업 합계(정규+보충) / 제공 가능 합계(정규 등록 회차+보충). 옛 서버 응답에는 없을 수 있다. */
    supplementLessons?: number;
    supplementTaken?: number;
    providedLessons?: number;
    availableLessons?: number;
    /** 학생 연기 횟수(서버가 정책으로 계산: 주2회=월1, 주3회=월2, 주5회=월3 × 등록 개월, 관리자 가감 반영) */
    leaveQuota?: { policyQuota: number; adminAdjustment: number; effectiveQuota: number; usedCount: number; remainingCount: number };
    classDurationMin: number;
    meetingPlatform: RealMeetingPlatform;
    teacherId: number | null;
    teacherName: string | null;
    teacherMeetingLinks: Partial<Record<RealMeetingPlatform, string>>;
    status: RealEnrollmentStatus;
  };
  allEnrollments: { id: number; startDate: string; endDate: string }[];
  lessons: RealLesson[];
  closures: RealClosure[];
};

export type BridgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: "NETWORK_ERROR" | "SESSION_EXPIRED" | "REQUEST_FAILED"; message: string } };

function okResult<T>(value: T): BridgeResult<T> {
  return { ok: true, value };
}
function errResult<T>(code: "NETWORK_ERROR" | "SESSION_EXPIRED" | "REQUEST_FAILED", message: string): BridgeResult<T> {
  return { ok: false, error: { code, message } };
}

async function parseSnapshotResponse(res: Response): Promise<BridgeResult<RealClassroomSnapshot>> {
  if (res.status === 401) {
    return errResult("SESSION_EXPIRED", "세션이 만료되었습니다. 다시 로그인해주세요.");
  }
  if (!res.ok) {
    let message = "수업 정보를 불러오지 못했습니다.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    return errResult("REQUEST_FAILED", message);
  }
  const data = (await res.json()) as RealClassroomSnapshot;
  return okResult(data);
}

export async function fetchRealClassroom(
  token: string,
  enrollmentId?: number,
): Promise<BridgeResult<RealClassroomSnapshot>> {
  const query = enrollmentId ? `?enrollmentId=${enrollmentId}` : "";
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/classroom${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return errResult("NETWORK_ERROR", "관리자 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  return parseSnapshotResponse(res);
}

// "내 강의실 > 평가서 보기" — admin의 GET /api/public/classroom/evaluation?lessonId=<수업 id>가 돌려주는, 이 학생
// 본인 수업에 게시된 평가서. 다른 학생의 수업이거나 평가서가 아직 없으면 admin은 똑같이 404를 준다(존재 여부를 숨김).
export type RealLessonEvaluation = {
  lessonId: number;
  date: string;
  content: string;
  contentTranslated: string | null;
  translatedLangLabel: string | null;
};

export type RealLessonEvaluationResult =
  | { status: "ok"; evaluation: RealLessonEvaluation }
  | { status: "not_found" }
  | { status: "session_expired" }
  | { status: "error"; kind: "network" | "server" };

export const EVALUATION_FETCH_TIMEOUT_MS = 15_000;

function isRealLessonEvaluation(v: unknown): v is RealLessonEvaluation {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lessonId === "number" &&
    typeof o.date === "string" &&
    typeof o.content === "string" &&
    (o.contentTranslated === null || typeof o.contentTranslated === "string") &&
    (o.translatedLangLabel === null || typeof o.translatedLangLabel === "string")
  );
}

// 어떤 경우에도 "불러오는 중"이 끝나도록 결과를 항상 돌려준다 — 네트워크 오류·응답 지연(타임아웃)·예상 밖 응답도
// 전부 { status: "error" }로 바뀌어 화면이 오류 안내와 다시 시도 버튼을 보여줄 수 있다.
export async function fetchRealLessonEvaluation(token: string, lessonId: number): Promise<RealLessonEvaluationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EVALUATION_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/classroom/evaluation?lessonId=${encodeURIComponent(String(lessonId))}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (res.status === 401) return { status: "session_expired" };
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error", kind: "server" };
    const data: unknown = await res.json();
    return isRealLessonEvaluation(data) ? { status: "ok", evaluation: data } : { status: "error", kind: "server" };
  } catch {
    return { status: "error", kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export type RealEnrollmentHistoryRow = {
  enrollment: RealClassroomSnapshot["enrollment"];
  lessons: RealLesson[];
};

// "내 강의실 > 수강내역" 탭용 — getMyClassroom(현재 선택된 수강 건 하나)과 달리,
// 이 학생이 가진 모든 수강 건 각각의 수업 목록을 한 번에 받아온다.
export async function fetchRealEnrollmentHistory(token: string): Promise<BridgeResult<RealEnrollmentHistoryRow[]>> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/classroom/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return errResult("NETWORK_ERROR", "관리자 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (res.status === 401) {
    return errResult("SESSION_EXPIRED", "세션이 만료되었습니다. 다시 로그인해주세요.");
  }
  if (!res.ok) {
    return errResult("REQUEST_FAILED", "수강 내역을 불러오지 못했습니다.");
  }
  const data = (await res.json()) as { rows: RealEnrollmentHistoryRow[] };
  return okResult(data.rows);
}

export async function requestRealReschedule(
  token: string,
  lessonId: number,
  reason: string,
): Promise<BridgeResult<RealClassroomSnapshot>> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/classroom/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lessonId, reason }),
    });
  } catch {
    return errResult("NETWORK_ERROR", "관리자 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  return parseSnapshotResponse(res);
}

// "홀드 해제 요청" — 승인 대기 없이 요청 즉시 적용된다(요청 자체가 곧 실행). 멈춰뒀던
// 예정 수업들이 쉬었던 주(週) 수만큼 뒤로 밀려 다시 예정으로 돌아오고, 수강 종료일도
// 같은 만큼 늘어난다(admin/src/lib/holdApply.ts releaseHold 참고).
export async function requestRealHoldRelease(
  token: string,
  enrollmentId: number,
): Promise<BridgeResult<RealClassroomSnapshot>> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/classroom/hold-release`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enrollmentId }),
    });
  } catch {
    return errResult("NETWORK_ERROR", "관리자 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  return parseSnapshotResponse(res);
}
