"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { findTeacherScheduleConflict, LEVEL_TEST_DURATION_MIN } from "@/lib/scheduleConflict";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    throw new Error("인증되지 않은 요청입니다.");
  }
}

export async function createLevelTest(_prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();

  const studentId = Number(formData.get("studentId"));
  const subject = String(formData.get("subject") ?? "").trim();
  const classMethod = String(formData.get("classMethod") ?? "").trim();
  const scheduledTestDate = String(formData.get("scheduledTestDate") ?? "");

  if (!studentId) {
    return { error: "학생을 선택해주세요." };
  }

  await prisma.levelTest.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      studentId,
      subject: subject || null,
      classMethod: classMethod || null,
      scheduledTestDate: scheduledTestDate ? new Date(scheduledTestDate) : null,
      progressStatus: "신청",
    },
  });

  revalidatePath("/level-tests");
  redirect("/level-tests");
}

export async function updateLevelTestProgress(id: number, progressStatus: string) {
  await requireAuth();
  await prisma.levelTest.update({ where: { id }, data: { progressStatus } });
  revalidatePath("/level-tests");
}

export async function assignLevelTestTeacher(id: number, teacherId: number | null): Promise<{ error?: string }> {
  await requireAuth();

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
  revalidatePath("/level-tests");
  return {};
}

export async function deleteLevelTest(id: number) {
  await requireAuth();
  await prisma.levelTest.delete({ where: { id } });
  revalidatePath("/level-tests");
}
