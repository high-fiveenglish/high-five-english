// 수업 생성 dry-run용 "읽기 전용" 데이터 로더. findMany만 사용한다 — 어떤 것도 만들거나 바꾸지 않는다
// (scripts/test-sessionPlan.ts가 이 파일에 쓰기성 Prisma 호출이 없는지 정적으로 검사한다).
// 같은 로더를 생성 실행기(lib/sessionGeneration.ts)도 쓴다 — 트랜잭션 안에서 "지금 상태"를 다시 읽어 계획과 대조하기 위해
// db 클라이언트(일반/트랜잭션)를 인자로 받는다.
import type { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { appDayStart } from "@/lib/appTime";
import { LEVEL_TEST_DURATION_MIN } from "@/lib/scheduleConflict";
import { planClassSessions, type PlanInput, type PlanResult } from "@/lib/sessionPlan";

/** 로더가 쓰는 모델만 — 일반 클라이언트와 $transaction 콜백의 tx 둘 다 받는다. */
export type PlanDb = Pick<PrismaClient, "enrollment" | "classSession" | "levelTest" | "academyClosure">;

/**
 * 현재 DB 상태를 읽어 계획 입력을 만든다.
 *  - 수강 건: COMPLETED를 제외한 전부(ACTIVE 외 상태는 "제외 사유"와 함께 결과에 남는다).
 *  - 기존 세션: 어제 00:00(KST) 이후 것만 읽는다 — 계획기는 "오늘 이후" 날짜만 보기 때문에 그 이전 세션은 결과에
 *    영향을 주지 않는다(대신 그 이전 세션은 "이미 존재하는 session" 목록에 나오지 않는다).
 *  - 강사 일정: 위 기간 이후의 레벨테스트(수업과 같은 강사 시간을 점유).
 *  - 휴강: 오늘 이후의 AcademyClosure. 생성 이력: 생성 배치로 만들어진 적 있는 수강(삭제된 세션 포함).
 */
export async function loadSessionPlanInput(db: PlanDb, asOf: Date = new Date()): Promise<PlanInput> {
  const horizonStart = appDayStart(asOf, -1);
  const todayStart = appDayStart(asOf, 0);

  const enrollments = await db.enrollment.findMany({
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
      updatedAt: true,
      student: { select: { name: true, agentId: true } },
      teacher: { select: { realName: true, accountStatus: true, approvalStatus: true, availableHours: true } },
    },
  });

  const enrollmentIds = enrollments.map((e) => e.id);
  const teacherIds = [...new Set(enrollments.flatMap((e) => (e.teacherId === null ? [] : [e.teacherId])))];

  const sessions =
    enrollmentIds.length === 0
      ? []
      : await db.classSession.findMany({
          where: {
            siteId: DEFAULT_SITE_ID,
            deletedAt: null,
            scheduledAt: { gte: horizonStart },
            OR: [{ enrollmentId: { in: enrollmentIds } }, { teacherId: { in: teacherIds } }],
          },
          select: {
            id: true,
            enrollmentId: true,
            teacherId: true,
            scheduledAt: true,
            durationMin: true,
            status: true,
            isSupplement: true,
            deletedAt: true,
            generationBatchId: true,
          },
        });

  const generated =
    enrollmentIds.length === 0
      ? []
      : await db.classSession.findMany({
          where: { enrollmentId: { in: enrollmentIds }, generationBatchId: { not: null } },
          select: { enrollmentId: true },
          distinct: ["enrollmentId"],
        });

  const levelTests =
    teacherIds.length === 0
      ? []
      : await db.levelTest.findMany({
          where: { siteId: DEFAULT_SITE_ID, teacherId: { in: teacherIds }, scheduledTestDate: { gte: horizonStart } },
          select: { id: true, teacherId: true, scheduledTestDate: true, student: { select: { name: true } }, leadStudentEnglishName: true },
        });

  const closures = await db.academyClosure.findMany({
    where: { siteId: DEFAULT_SITE_ID, date: { gte: todayStart } },
    select: { date: true, agentId: true },
  });

  return {
    asOf,
    enrollments: enrollments.map((e) => ({
      id: e.id,
      status: e.status,
      studentId: e.studentId,
      studentName: e.student.name,
      studentAgentId: e.student.agentId,
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
      updatedAt: e.updatedAt,
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
    closures,
    alreadyGeneratedEnrollmentIds: generated.map((g) => g.enrollmentId),
  };
}

export async function loadSessionPlan(db: PlanDb, asOf: Date = new Date()): Promise<PlanResult> {
  return planClassSessions(await loadSessionPlanInput(db, asOf));
}
