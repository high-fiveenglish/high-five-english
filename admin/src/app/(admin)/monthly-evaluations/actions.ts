"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { DEFAULT_SITE_ID } from "@/lib/constants";

const MAX_LENGTH = 4000;

async function requireAuth() {
  if (!(await isAuthenticated())) {
    throw new Error("인증되지 않은 요청입니다.");
  }
}

export async function createMonthlyEvaluation(_prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();

  const studentId = Number(formData.get("studentId"));
  const yearMonth = String(formData.get("yearMonth") ?? "").trim();
  const teacherIdRaw = String(formData.get("teacherId") ?? "");
  const content = String(formData.get("content") ?? "").trim();

  if (!studentId || !yearMonth || !content) {
    return { error: "학생, 대상 월, 내용은 필수입니다." };
  }
  if (content.length > MAX_LENGTH) {
    return { error: `${MAX_LENGTH}자를 초과했습니다. (현재 ${content.length}자)` };
  }

  await prisma.monthlyEvaluation.upsert({
    where: { studentId_yearMonth: { studentId, yearMonth } },
    update: { content, teacherId: teacherIdRaw ? Number(teacherIdRaw) : null },
    create: {
      siteId: DEFAULT_SITE_ID,
      studentId,
      yearMonth,
      content,
      teacherId: teacherIdRaw ? Number(teacherIdRaw) : null,
    },
  });

  revalidatePath("/monthly-evaluations");
  redirect("/monthly-evaluations");
}

export async function updateMonthlyEvaluation(
  id: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  await requireAuth();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    return { error: "내용을 입력해주세요." };
  }
  if (content.length > MAX_LENGTH) {
    return { error: `${MAX_LENGTH}자를 초과했습니다. (현재 ${content.length}자)` };
  }

  await prisma.monthlyEvaluation.update({ where: { id }, data: { content } });

  revalidatePath("/monthly-evaluations");
  revalidatePath(`/monthly-evaluations/${id}`);
  redirect("/monthly-evaluations");
}

export async function deleteMonthlyEvaluation(id: number) {
  await requireAuth();
  await prisma.monthlyEvaluation.delete({ where: { id } });
  revalidatePath("/monthly-evaluations");
}
