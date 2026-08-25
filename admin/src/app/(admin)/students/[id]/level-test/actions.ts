"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { findTeacherScheduleConflict, LEVEL_TEST_DURATION_MIN } from "@/lib/scheduleConflict";

export async function createLevelTestForStudent(
  studentId: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
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

  // 이미 진행 중인(완료되지 않은) 레벨테스트가 있으면 중복 신청을 막는다.
  const existing = await prisma.levelTest.findFirst({
    where: { studentId, subject, progressStatus: { not: "완료" } },
    orderBy: { id: "desc" },
  });
  if (existing) {
    return {
      error: `이미 진행 중인 레벨테스트 신청이 있습니다 (신청일: ${existing.appliedAt.toISOString().slice(0, 10)}, 진행상태: ${existing.progressStatus ?? "신청"}). 중복 신청할 수 없습니다.`,
    };
  }

  let scheduledTestDate: Date | null = null;
  if (testDate) {
    scheduledTestDate = new Date(`${testDate}T${testTime || "00:00"}:00`);
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
      progressStatus: "신청",
    },
  });
  await logAudit({ actor, action: "CREATE", targetType: "LevelTest", targetId: levelTest.id, description: `학생 ${studentId} 레벨테스트 등록` });

  revalidatePath("/students");
  revalidatePath("/level-tests");
  redirect("/students?notice=level-test-created");
}

export type TeacherAvailability = {
  teacherId: number;
  teacherName: string;
  hours: { hour: number; free: boolean }[];
};

// "찾아보기" — 선택한 날짜 기준으로 각 강사의 등록된 근무가능 시간대 중 실제로 비어있는
// 시간만 골라 보여준다(기존 강사 데이터 + 실시간 충돌검사를 그대로 재사용).
export async function checkTeacherAvailability(dateStr: string): Promise<TeacherAvailability[]> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.view");
  if (!dateStr) return [];

  const teachers = await prisma.teacher.findMany({
    where: { siteId: DEFAULT_SITE_ID, approvalStatus: "APPROVED", accountStatus: "ACTIVE" },
    orderBy: { realName: "asc" },
  });

  const results: TeacherAvailability[] = [];
  for (const t of teachers) {
    const sortedHours = [...t.availableHours].sort((a, b) => a - b);
    const hours: { hour: number; free: boolean }[] = [];
    for (const h of sortedHours) {
      const start = new Date(`${dateStr}T00:00:00`);
      start.setHours(h, 0, 0, 0);
      const conflict = await findTeacherScheduleConflict({
        teacherId: t.id,
        start,
        durationMin: LEVEL_TEST_DURATION_MIN,
      });
      hours.push({ hour: h, free: !conflict });
    }
    results.push({ teacherId: t.id, teacherName: t.realName, hours });
  }
  return results;
}
