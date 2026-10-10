// 마케팅 사이트(Vite)의 "내 강의실"(수업/휴강/연기 화면)이 admin의 실제 DB를 그대로
// 보도록 하는 공용 로직 — admin 자체 학생 화면(student/(dashboard)/sessions)과
// api/public/classroom* 라우트 양쪽에서 이 파일을 쓴다. 한쪽만 고치고 다른 쪽을
// 깜빡하는 일이 없도록 여기 하나로 모은다.
import { prisma } from "./prisma";
import { TEACHER_SUMMARY_SELECT } from "./teacherSelect";
import { formatAppDate, formatAppTime } from "./appTime";
import { countLessons } from "./lessonCounts";
import { summarizeLeaveQuota, usedFromLeaveRows, type LeaveQuotaSummary } from "./leavePolicy";
import { RESCHEDULE_ERROR_MESSAGE, RescheduleError, rescheduleSession, type RescheduleErrorCode } from "./reschedule";
import { runTx } from "./appTransaction";

// Vite 사이트(src/lib/scheduling/types.ts)의 LessonStatus와 정확히 맞춘 값이다 — 문자열이
// 조금이라도 다르면 그쪽 화면에서 "예정"으로도 안 뜨고 조용히 깨진다.
type ViteLessonStatus =
  | "scheduled"
  | "completed"
  | "absent"
  | "rescheduled"
  | "teacher_absent"
  | "academy_closed"
  | "admin_cancelled"
  | "on_hold";

function mapLessonStatus(session: {
  status: string;
  leaveRequest: { requestedByRole: string; academyClosureId: number | null; finalSource?: string | null } | null;
}): ViteLessonStatus {
  switch (session.status) {
    case "SCHEDULED":
      return "scheduled";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "admin_cancelled";
    case "MAKEUP_NEEDED":
      return "absent";
    case "HOLD":
      return "on_hold";
    case "LEAVE": {
      const lr = session.leaveRequest;
      // 학생 연기가 나중에 학원 휴강으로 대체되면(finalSource) 학원 휴강으로 보인다.
      if (lr?.academyClosureId || lr?.finalSource === "ACADEMY_CLOSURE") return "academy_closed";
      if (lr?.requestedByRole === "STUDENT") return "rescheduled";
      return "teacher_absent";
    }
    default:
      return "scheduled";
  }
}

// 정규/보충 분리 집계 + 학생 연기 횟수(lessonCounts.ts, leavePolicy.ts) — 두 스냅샷 함수와 관리자 화면이 같은 계산을 쓴다.
function enrollmentCounts(
  enrollment: { totalSessions: number; scheduleDays: string; packageMonths: number; leaveQuotaAdjustment: number },
  sessions: readonly {
    status: string;
    isSupplement: boolean;
    leaveRequest: { status: string; quotaImpact: number; source: string | null; requestedByRole: string; academyClosureId: number | null } | null;
  }[],
) {
  const c = countLessons(sessions, enrollment.totalSessions);
  return {
    remainingLessons: c.regularRemaining,
    supplementLessons: c.supplementTotal,
    supplementTaken: c.supplementTaken,
    providedLessons: c.providedLessons,
    availableLessons: c.availableLessons,
    leaveQuota: summarizeLeaveQuota({
      scheduleDays: enrollment.scheduleDays,
      packageMonths: enrollment.packageMonths,
      adminAdjustment: enrollment.leaveQuotaAdjustment,
      usedCount: usedFromLeaveRows(sessions.flatMap((s) => (s.leaveRequest ? [s.leaveRequest] : []))),
    }),
  };
}

const CLASS_METHOD_TO_PLATFORM: Record<string, "zoom" | "teams" | "voov"> = {
  zoom: "zoom",
  teams: "teams",
  tencent: "voov",
};

// 마케팅 사이트(Vite)의 "현재 수강 상태" 표시 + "홀드 해제 요청" 버튼 노출 여부가
// 이 값을 그대로 쓴다(src/lib/community/types.ts의 RealEnrollmentStatus와 값을
// 맞춘다) — admin 자체 EnrollmentStatus와 동일한 문자열이라 별도 변환 없이 내려준다.
export type StudentClassroomSnapshot = {
  enrollment: {
    id: number;
    startDate: string;
    endDate: string;
    /** 정규 등록 회차(보충수업과 무관) */
    totalLessons: number;
    /** 정규 잔여 회차 — 보충수업은 정규 회차를 소모하지 않는다. */
    remainingLessons: number;
    /** 보충수업(제공 가능한 것) 수 / 그 중 받은 것 / 받은 수업 합계(정규+보충) / 제공 가능 합계(정규 등록 회차+보충) */
    supplementLessons: number;
    supplementTaken: number;
    providedLessons: number;
    availableLessons: number;
    /** 학생 연기 횟수(등록기간 전체 기준) */
    leaveQuota: LeaveQuotaSummary;
    classDurationMin: number;
    meetingPlatform: "zoom" | "teams" | "voov";
    teacherId: number | null;
    teacherName: string | null;
    teacherMeetingLinks: Partial<Record<"zoom" | "teams" | "voov", string>>;
    status: "APPLIED" | "PAID" | "ACTIVE" | "HOLDING" | "COMPLETED";
  };
  allEnrollments: { id: number; startDate: string; endDate: string }[];
  lessons: {
    id: number;
    scheduledDate: string;
    scheduledTime: string;
    status: ViteLessonStatus;
    reason?: string;
    evaluationStatus: "not_started" | "completed";
    /** 보충수업 여부 — 정규 수업과 구분해서 보여줘야 한다. */
    isSupplement: boolean;
  }[];
  closures: { id: number; date: string; reason: string }[];
};

// enrollmentId를 안 주면 "오늘이 그 안에 들어가는 수강 건"을 우선하고, 없으면 가장
// 최근에 시작한 수강 건으로 기본값을 정한다 — admin 화면들이 이미 쓰는 것과 같은
// "오늘 진행 중인 걸 기본으로" 관례를 그대로 따른다.
export async function getStudentClassroomSnapshot(
  studentId: number,
  enrollmentId?: number,
): Promise<StudentClassroomSnapshot | null> {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    orderBy: { startDate: "desc" },
    include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
  });
  if (enrollments.length === 0) return null;

  const now = new Date();
  const enrollment =
    (enrollmentId ? enrollments.find((e) => e.id === enrollmentId) : undefined) ??
    enrollments.find((e) => e.startDate <= now && e.endDate >= now) ??
    enrollments[0];

  const sessions = await prisma.classSession.findMany({
    where: { enrollmentId: enrollment.id, deletedAt: null },
    include: { leaveRequest: true, evaluation: true },
    orderBy: { scheduledAt: "asc" },
  });

  const closures = await prisma.academyClosure.findMany({
    where: { siteId: enrollment.siteId },
    orderBy: { date: "desc" },
    take: 60,
  });

  const counts = enrollmentCounts(enrollment, sessions);

  const teacher = enrollment.teacher;
  const teacherMeetingLinks: Partial<Record<"zoom" | "teams" | "voov", string>> = {};
  if (teacher?.zoomUrl) teacherMeetingLinks.zoom = teacher.zoomUrl;
  if (teacher?.teamsUrl) teacherMeetingLinks.teams = teacher.teamsUrl;
  if (teacher?.tencentUrl) teacherMeetingLinks.voov = teacher.tencentUrl;

  return {
    enrollment: {
      id: enrollment.id,
      startDate: formatAppDate(enrollment.startDate),
      endDate: formatAppDate(enrollment.endDate),
      totalLessons: enrollment.totalSessions,
      ...counts,
      classDurationMin: enrollment.classDurationMin,
      meetingPlatform: CLASS_METHOD_TO_PLATFORM[enrollment.classMethod] ?? "zoom",
      teacherId: teacher?.id ?? null,
      teacherName: teacher?.realName ?? null,
      teacherMeetingLinks,
      status: enrollment.status,
    },
    allEnrollments: enrollments.map((e) => ({
      id: e.id,
      startDate: formatAppDate(e.startDate),
      endDate: formatAppDate(e.endDate),
    })),
    lessons: sessions.map((s) => ({
      id: s.id,
      scheduledDate: formatAppDate(s.scheduledAt),
      scheduledTime: formatAppTime(s.scheduledAt),
      status: mapLessonStatus(s),
      reason: s.leaveRequest?.reason ?? undefined,
      evaluationStatus: s.evaluation ? "completed" : "not_started",
      isSupplement: s.isSupplement,
    })),
    closures: closures.map((c) => ({ id: c.id, date: formatAppDate(c.date), reason: c.reason })),
  };
}

// 마케팅 사이트 "내 강의실 > 수강내역" 탭용 — getStudentClassroomSnapshot이 선택된
// 수강 건 하나만 보여주는 것과 달리, 이 학생이 가진 모든 수강 건 각각의 수업 목록을
// 함께 돌려준다(수강내역 화면은 건마다 출석/결석/연기 통계를 계산해서 보여줘야 하므로).
export type StudentEnrollmentHistoryRow = {
  enrollment: StudentClassroomSnapshot["enrollment"];
  lessons: StudentClassroomSnapshot["lessons"];
};

export async function getStudentEnrollmentHistory(studentId: number): Promise<StudentEnrollmentHistoryRow[]> {
  // 수강 시작일이 아니라 "등록한(신청 처리된) 시점" 기준으로 최신순 — 시작일이
  // 이후라도 나중에 등록한 수강 건이 아래로 밀리지 않고 맨 위에 오도록 한다.
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
  });
  if (enrollments.length === 0) return [];

  const sessions = await prisma.classSession.findMany({
    where: { enrollmentId: { in: enrollments.map((e) => e.id) }, deletedAt: null },
    include: { leaveRequest: true, evaluation: true },
    orderBy: { scheduledAt: "asc" },
  });
  const sessionsByEnrollment = new Map<number, typeof sessions>();
  for (const s of sessions) {
    if (!sessionsByEnrollment.has(s.enrollmentId)) sessionsByEnrollment.set(s.enrollmentId, []);
    sessionsByEnrollment.get(s.enrollmentId)!.push(s);
  }

  return enrollments.map((enrollment) => {
    const enrollmentSessions = sessionsByEnrollment.get(enrollment.id) ?? [];
    const counts = enrollmentCounts(enrollment, enrollmentSessions);
    const teacher = enrollment.teacher;

    return {
      enrollment: {
        id: enrollment.id,
        startDate: formatAppDate(enrollment.startDate),
        endDate: formatAppDate(enrollment.endDate),
        totalLessons: enrollment.totalSessions,
        ...counts,
        classDurationMin: enrollment.classDurationMin,
        meetingPlatform: CLASS_METHOD_TO_PLATFORM[enrollment.classMethod] ?? "zoom",
        teacherId: teacher?.id ?? null,
        teacherName: teacher?.realName ?? null,
        teacherMeetingLinks: {},
        status: enrollment.status,
      },
      lessons: enrollmentSessions.map((s) => ({
        id: s.id,
        scheduledDate: formatAppDate(s.scheduledAt),
        scheduledTime: formatAppTime(s.scheduledAt),
        status: mapLessonStatus(s),
        reason: s.leaveRequest?.reason ?? undefined,
        evaluationStatus: s.evaluation ? "completed" : "not_started",
        isSupplement: s.isSupplement,
      })),
    };
  });
}

// 학생 셀프 연기 신청의 실제 처리 로직 — 쿠키 세션(student/(dashboard)/sessions/actions.ts
// requestLeave)과 Bearer 토큰(api/public/classroom/reschedule) 양쪽에서 studentId만
// 다르게 구해서 이 함수 하나를 공유한다.
//
// 학생이 직접 하는 학생 연기: 연기 횟수(quota) 차감 + 수업 시작 2시간 전까지만 + 정규 시퀀스 재배치(reschedule.ts).
// 관리자가 학생 대신 누르는 "학생 연기"는 같은 재배치를 쓰되 2시간 제한만 없다(students/[id]/sessions/actions.ts).
export async function applyStudentRequestedLeave(
  studentId: number,
  sessionId: number,
  reason: string,
): Promise<{ error?: string; code?: RescheduleErrorCode; leaveRequestId?: number }> {
  const owner = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { studentId: true } });
  if (!owner || owner.studentId !== studentId) {
    return { error: RESCHEDULE_ERROR_MESSAGE.NOT_OWN_SESSION, code: "NOT_OWN_SESSION" };
  }
  try {
    const r = await runTx((tx) =>
      rescheduleSession(tx, {
        sessionId,
        source: "STUDENT_POSTPONEMENT",
        actor: { role: "STUDENT", id: studentId },
        now: new Date(),
        reason,
        studentSelfService: true,
      }),
    );
    return { leaveRequestId: r.leaveRequestId };
  } catch (e) {
    if (e instanceof RescheduleError) return { error: e.message, code: e.code };
    throw e;
  }
}
