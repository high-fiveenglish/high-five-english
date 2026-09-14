"use server";

// 레벨테스트 신규 등록 공용 로직 — 학생관리 화면에서 특정 학생으로 들어가 등록하는
// 경로(students/[id]/level-test)와, 레벨테스트관리 목록의 "+ 레벨테스트 신청 등록"
// 경로(level-tests/new) 양쪽 모두 학생을 고른 뒤부터는 완전히 같은 입력값·검증·저장
// 로직을 타야 한다 — 한쪽만 있고 다른 쪽은 간단한 필드 몇 개짜리로 남아있으면(실제로
// 그랬다) 같은 업무를 처리하는 화면인데 서로 다르게 동작해 혼란을 준다. 두 액션은
// 이 함수를 호출하기만 하고, 리다이렉트 대상만 각자 다르게 정한다.
import { prisma } from "./prisma";
import { requireBackofficeActor } from "./backofficeAuth";
import { requirePermission, logAudit } from "./rbac";
import { DEFAULT_SITE_ID } from "./constants";
import { findTeacherScheduleConflict, LEVEL_TEST_DURATION_MIN } from "./scheduleConflict";
import { parseAppDateTime } from "./appTime";
import { TERMINAL_PROGRESS_STATUSES } from "./levelTestOptions";

export type CreateLevelTestResult = { error: string; levelTestId?: undefined } | { error?: undefined; levelTestId: number };

export async function createLevelTestCore(studentId: number, formData: FormData): Promise<CreateLevelTestResult> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.create");

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.deletedAt) {
    return { error: "존재하지 않거나 삭제된 학생입니다." };
  }

  const subject = String(formData.get("subject") ?? "online_english");
  const landlinePhone = String(formData.get("landlinePhone") ?? "").trim();
  const mobilePhone = String(formData.get("mobilePhone") ?? "").trim();
  const classMethod = String(formData.get("classMethod") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const teamsId = String(formData.get("teamsId") ?? "").trim();
  const kakaoId = String(formData.get("kakaoId") ?? "").trim();
  const wechatId = String(formData.get("wechatId") ?? "").trim();
  const testDate = String(formData.get("testDate") ?? "");
  const testTime = String(formData.get("testTime") ?? "");
  const teacherIdRaw = String(formData.get("teacherId") ?? "");
  const englishLevel = String(formData.get("englishLevel") ?? "").trim();
  const ageGroup = String(formData.get("ageGroup") ?? "").trim();
  const interestTopic = String(formData.get("interestTopic") ?? "").trim();
  const teacherNote = String(formData.get("teacherNote") ?? "").trim();

  if (!classMethod || !englishLevel) {
    return { error: "수업방법과 영어실력은 필수입니다." };
  }

  // 이미 진행 중인(종결되지 않은) 레벨테스트가 있으면 중복 신청을 막는다.
  const existing = await prisma.levelTest.findFirst({
    where: { studentId, subject, progressStatus: { notIn: [...TERMINAL_PROGRESS_STATUSES] } },
    orderBy: { id: "desc" },
  });
  if (existing) {
    return {
      error: `이미 진행 중인 레벨테스트 신청이 있습니다 (신청일: ${existing.appliedAt.toISOString().slice(0, 10)}, 진행상태: ${existing.progressStatus ?? "접수"}). 중복 신청할 수 없습니다.`,
    };
  }

  let scheduledTestDate: Date | null = null;
  if (testDate) {
    scheduledTestDate = parseAppDateTime(`${testDate}T${testTime || "00:00"}`);
  }

  const teacherId = teacherIdRaw ? Number(teacherIdRaw) : null;
  if (teacherId && scheduledTestDate) {
    const conflict = await findTeacherScheduleConflict({
      teacherId,
      start: scheduledTestDate,
      durationMin: LEVEL_TEST_DURATION_MIN,
    });
    if (conflict) {
      return { error: `해당 강사는 같은 시간에 이미 다른 일정이 있습니다: ${conflict.label}` };
    }
  }

  // 폼에서 고친 연락처/수업방식은 학생 프로필에도 반영해 데이터가 갈라지지 않게 한다.
  await prisma.student.update({
    where: { id: studentId },
    data: {
      landlinePhone: landlinePhone || null,
      mobilePhone: mobilePhone || null,
      email: email || null,
      teamsId: teamsId || null,
      kakaoId: kakaoId || null,
      wechatId: wechatId || null,
      preferredClassMethod: classMethod || null,
    },
  });

  const levelTest = await prisma.levelTest.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      studentId,
      teacherId,
      subject,
      classMethod,
      scheduledTestDate,
      englishLevel,
      ageGroup: ageGroup || null,
      interestTopic: interestTopic || null,
      teacherNote: teacherNote || null,
      progressStatus: "접수",
    },
  });
  await logAudit({
    actor,
    action: "CREATE",
    targetType: "LevelTest",
    targetId: levelTest.id,
    description: `학생 ${studentId} 레벨테스트 등록`,
  });

  return { levelTestId: levelTest.id };
}
