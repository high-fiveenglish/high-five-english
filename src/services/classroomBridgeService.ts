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
  | "admin_cancelled";

export type RealLesson = {
  id: number;
  scheduledDate: string;
  scheduledTime: string;
  status: RealLessonStatus;
  reason?: string;
  evaluationStatus: "not_started" | "completed";
};

export type RealClosure = { id: number; date: string; reason: string };

export type RealClassroomSnapshot = {
  enrollment: {
    id: number;
    startDate: string;
    endDate: string;
    totalLessons: number;
    remainingLessons: number;
    classDurationMin: number;
    meetingPlatform: RealMeetingPlatform;
    teacherId: number | null;
    teacherName: string | null;
    teacherMeetingLinks: Partial<Record<RealMeetingPlatform, string>>;
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
