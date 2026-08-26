"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { findTeacherScheduleConflict, LEVEL_TEST_DURATION_MIN } from "@/lib/scheduleConflict";
import { parseAppDateTime } from "@/lib/appTime";

export async function createLevelTest(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.create");

  const studentId = Number(formData.get("studentId"));
  const subject = String(formData.get("subject") ?? "").trim();
  const classMethod = String(formData.get("classMethod") ?? "").trim();
  const scheduledTestDate = String(formData.get("scheduledTestDate") ?? "");

  if (!studentId) {
    return { error: "학생을 선택해주세요." };
  }

  const levelTest = await prisma.levelTest.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      studentId,
      subject: subject || null,
      classMethod: classMethod || null,
      scheduledTestDate: scheduledTestDate ? parseAppDateTime(scheduledTestDate) : null,
      progressStatus: "신청",
    },
  });
  await logAudit({ actor, action: "CREATE", targetType: "LevelTest", targetId: levelTest.id });

  revalidatePath("/level-tests");
  redirect("/level-tests");
}

export async function updateLevelTestProgress(id: number, progressStatus: string) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.update");
  await prisma.levelTest.update({ where: { id }, data: { progressStatus } });
  await logAudit({ actor, action: "UPDATE", targetType: "LevelTest", targetId: id, description: `진행상태 변경: ${progressStatus}` });
  revalidatePath("/level-tests");
}

export async function assignLevelTestTeacher(id: number, teacherId: number | null): Promise<{ error?: string }> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.update");

  if (teacherId) {
    const levelTest = await prisma.levelTest.findUnique({ where: { id } });
    if (levelTest?.scheduledTestDate) {
      const conflict = await findTeacherScheduleConflict({
        teacherId,
        start: levelTest.scheduledTestDate,
        durationMin: LEVEL_TEST_DURATION_MIN,
        excludeLevelTestId: id,
      });
      if (conflict) {
        return { error: `해당 강사는 같은 시간에 이미 다른 일정이 있습니다: ${conflict.label}` };
      }
    }
  }

  await prisma.levelTest.update({ where: { id }, data: { teacherId } });
  await logAudit({ actor, action: "UPDATE", targetType: "LevelTest", targetId: id, description: teacherId ? `강사 배정: ${teacherId}` : "강사 배정 해제" });
  revalidatePath("/level-tests");
  return {};
}

export async function deleteLevelTest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.delete");
  await prisma.levelTest.delete({ where: { id } });
  await logAudit({ actor, action: "DELETE", targetType: "LevelTest", targetId: id });
  revalidatePath("/level-tests");
}
