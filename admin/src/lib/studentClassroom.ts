// 마케팅 사이트(Vite)의 "내 강의실"(수업/휴강/연기 화면)이 admin의 실제 DB를 그대로
// 보도록 하는 공용 로직 — admin 자체 학생 화면(student/(dashboard)/sessions)과
// api/public/classroom* 라우트 양쪽에서 이 파일을 쓴다. 한쪽만 고치고 다른 쪽을
// 깜빡하는 일이 없도록 여기 하나로 모은다.
import { prisma } from "./prisma";
import { TEACHER_SUMMARY_SELECT } from "./teacherSelect";
import { formatAppDate, formatAppTime } from "./appTime";
import { applyClassLeave } from "./leaveApply";

const EXTENDED_DAYS = 1;

// Vite 사이트(src/lib/scheduling/types.ts)의 LessonStatus와 정확히 맞춘 값이다 — 문자열이
// 조금이라도 다르면 그쪽 화면에서 "예정"으로도 안 뜨고 조용히 깨진다.
type ViteLessonStatus =
  | "scheduled"
  | "completed"
  | "absent"
  | "rescheduled"
  | "teacher_absent"
  | "academy_closed"
  | "admin_cancelled";

function mapLessonStatus(session: {
  status: string;
  leaveRequest: { requestedByRole: string; academyClosureId: number | null } | null;
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
    case "LEAVE": {
      const lr = session.leaveRequest;
      if (lr?.academyClosureId) return "academy_closed";
      if (lr?.requestedByRole === "STUDENT") return "rescheduled";
      return "teacher_absent";
    }
    default:
      return "scheduled";
  }
}

const CLASS_METHOD_TO_PLATFORM: Record<string, "zoom" | "teams" | "voov"> = {
  zoom: "zoom",
  teams: "teams",
  tencent: "voov",
};

export type StudentClassroomSnapshot = {
  enrollment: {
    id: number;
    startDate: string;
    endDate: string;
    totalLessons: number;
    remainingLessons: number;
    classDurationMin: number;
    meetingPlatform: "zoom" | "teams" | "voov";
    teacherId: number | null;
    teacherName: string | null;
    teacherMeetingLinks: Partial<Record<"zoom" | "teams" | "voov", string>>;
  };
  allEnrollments: { id: number; startDate: string; endDate: string }[];
  lessons: {
    id: number;
    scheduledDate: string;
    scheduledTime: string;
    status: ViteLessonStatus;
    reason?: string;
    evaluationStatus: "not_started" | "completed";
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

  const remainingLessons = Math.max(
    0,
    enrollment.totalSessions - sessions.filter((s) => s.status === "COMPLETED" || s.status === "MAKEUP_NEEDED").length,
  );

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
      remainingLessons,
      classDurationMin: enrollment.classDurationMin,
      meetingPlatform: CLASS_METHOD_TO_PLATFORM[enrollment.classMethod] ?? "zoom",
      teacherId: teacher?.id ?? null,
      teacherName: teacher?.realName ?? null,
      teacherMeetingLinks,
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
    const remainingLessons = Math.max(
      0,
      enrollment.totalSessions -
        enrollmentSessions.filter((s) => s.status === "COMPLETED" || s.status === "MAKEUP_NEEDED").length,
    );
    const teacher = enrollment.teacher;

    return {
      enrollment: {
        id: enrollment.id,
        startDate: formatAppDate(enrollment.startDate),
        endDate: formatAppDate(enrollment.endDate),
        totalLessons: enrollment.totalSessions,
        remainingLessons,
        classDurationMin: enrollment.classDurationMin,
        meetingPlatform: CLASS_METHOD_TO_PLATFORM[enrollment.classMethod] ?? "zoom",
        teacherId: teacher?.id ?? null,
        teacherName: teacher?.realName ?? null,
        teacherMeetingLinks: {},
      },
      lessons: enrollmentSessions.map((s) => ({
        id: s.id,
        scheduledDate: formatAppDate(s.scheduledAt),
        scheduledTime: formatAppTime(s.scheduledAt),
        status: mapLessonStatus(s),
        reason: s.leaveRequest?.reason ?? undefined,
        evaluationStatus: s.evaluation ? "completed" : "not_started",
      })),
    };
  });
}

// 학생 셀프 연기 신청의 실제 처리 로직 — 쿠키 세션(student/(dashboard)/sessions/actions.ts
// requestLeave)과 Bearer 토큰(api/public/classroom/reschedule) 양쪽에서 studentId만
// 다르게 구해서 이 함수 하나를 공유한다.
export async function applyStudentRequestedLeave(
  studentId: number,
  sessionId: number,
  reason: string,
): Promise<{ error?: string; leaveRequestId?: number }> {
  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session || session.studentId !== studentId) {
    return { error: "본인 수업만 휴강 신청할 수 있습니다." };
  }
  if (session.status !== "SCHEDULED") {
    return { error: "예정된 수업만 휴강 신청할 수 있습니다." };
  }
  if (session.scheduledAt.getTime() < Date.now()) {
    return { error: "이미 지난 수업은 휴강 신청할 수 없습니다." };
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: session.enrollmentId } });
  if (!enrollment) {
    return { error: "연결된 수강신청 정보를 찾을 수 없습니다." };
  }

  const leaveRequestId = await prisma.$transaction(async (tx) => {
    await applyClassLeave(tx, {
      classSessionId: sessionId,
      enrollmentId: enrollment.id,
      currentEndDate: enrollment.endDate,
      extendedDays: EXTENDED_DAYS,
    });
    const created = await tx.leaveRequest.create({
      data: {
        siteId: enrollment.siteId,
        classSessionId: sessionId,
        enrollmentId: enrollment.id,
        studentId,
        reason: reason.trim() || null,
        extendedDays: EXTENDED_DAYS,
        status: "APPROVED",
        requestedByRole: "STUDENT",
        approvedById: null,
        approvedAt: new Date(),
      },
    });
    return created.id;
  });

  return { leaveRequestId };
}
