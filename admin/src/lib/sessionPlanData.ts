// 수업 생성 dry-run용 "읽기 전용" 데이터 로더. findMany/count만 사용한다 — 어떤 것도 만들거나 바꾸지 않는다
// (scripts/test-sessionPlan.ts가 이 파일에 쓰기성 Prisma 호출이 없는지 정적으로 검사한다).
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { appDayStart } from "@/lib/appTime";
import { LEVEL_TEST_DURATION_MIN } from "@/lib/scheduleConflict";
import { planClassSessions, type PlanResult } from "@/lib/sessionPlan";

/**
 * 현재 DB 상태를 읽어 dry-run 계획을 계산한다.
 *  - 수강 건: COMPLETED를 제외한 전부(ACTIVE 외 상태는 "제외 사유"와 함께 결과에 남는다).
 *  - 기존 세션: 어제 00:00(KST) 이후 것만 읽는다 — 계획기는 "오늘 이후" 날짜만 보기 때문에 그 이전 세션은 결과에
 *    영향을 주지 않는다(대신 그 이전 세션은 "이미 존재하는 session" 목록에 나오지 않는다).
 *  - 강사 일정: 위 기간 이후의 레벨테스트(수업과 같은 강사 시간을 점유).
 */
export async function loadSessionPlan(asOf: Date = new Date()): Promise<PlanResult> {
  const horizonStart = appDayStart(asOf, -1);

  const enrollments = await prisma.enrollment.findMany({
    where: { siteId: DEFAULT_SITE_ID, status: { not: "COMPLETED" } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      studentId: true,
      teacherId: true,
      scheduleDays: true,
      classTime: true,
      classTimes: true,
      classDurationMin: true,
      startDate: true,
      endDate: true,
      totalSessions: true,
      student: { select: { name: true } },
      teacher: { select: { realName: true, accountStatus: true, approvalStatus: true, availableHours: true } },
    },
  });

  const enrollmentIds = enrollments.map((e) => e.id);
  const teacherIds = [...new Set(enrollments.flatMap((e) => (e.teacherId === null ? [] : [e.teacherId])))];

  const sessions =
    enrollmentIds.length === 0
      ? []
      : await prisma.classSession.findMany({
          where: {
            siteId: DEFAULT_SITE_ID,
            deletedAt: null,
            scheduledAt: { gte: horizonStart },
            OR: [{ enrollmentId: { in: enrollmentIds } }, { teacherId: { in: teacherIds } }],
          },
          select: { id: true, enrollmentId: true, teacherId: true, scheduledAt: true, durationMin: true, status: true, isSupplement: true, deletedAt: true },
        });

  const levelTests =
    teacherIds.length === 0
      ? []
      : await prisma.levelTest.findMany({
          where: { siteId: DEFAULT_SITE_ID, teacherId: { in: teacherIds }, scheduledTestDate: { gte: horizonStart } },
          select: { id: true, teacherId: true, scheduledTestDate: true, student: { select: { name: true } }, leadStudentEnglishName: true },
        });

  return planClassSessions({
    asOf,
    enrollments: enrollments.map((e) => ({
      id: e.id,
      status: e.status,
      studentId: e.studentId,
      studentName: e.student.name,
      teacherId: e.teacherId,
      teacherName: e.teacher?.realName ?? null,
      teacherAccountStatus: e.teacher?.accountStatus ?? null,
      teacherApprovalStatus: e.teacher?.approvalStatus ?? null,
      teacherAvailableHours: e.teacher?.availableHours ?? null,
      scheduleDays: e.scheduleDays,
      classTime: e.classTime,
      classTimes: e.classTimes,
      classDurationMin: e.classDurationMin,
      startDate: e.startDate,
      endDate: e.endDate,
      totalSessions: e.totalSessions,
    })),
    existingSessions: sessions,
    teacherBusy: levelTests.flatMap((lt) =>
      lt.teacherId !== null && lt.scheduledTestDate
        ? [
            {
              teacherId: lt.teacherId,
              start: lt.scheduledTestDate,
              durationMin: LEVEL_TEST_DURATION_MIN,
              label: `레벨테스트 #${lt.id} (${lt.student?.name ?? lt.leadStudentEnglishName ?? "리드"})`,
            },
          ]
        : [],
    ),
  });
}
