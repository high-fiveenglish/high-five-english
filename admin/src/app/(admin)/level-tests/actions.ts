"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { DEFAULT_SITE_ID } from "@/lib/constants";

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

export async function assignLevelTestTeacher(id: number, teacherId: number | null) {
  await requireAuth();
  await prisma.levelTest.update({ where: { id }, data: { teacherId } });
  revalidatePath("/level-tests");
}

export async function deleteLevelTest(id: number) {
  await requireAuth();
  await prisma.levelTest.delete({ where: { id } });
  revalidatePath("/level-tests");
}
