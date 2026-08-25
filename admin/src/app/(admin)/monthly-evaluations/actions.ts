"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";

const MAX_LENGTH = 4000;

export async function createMonthlyEvaluation(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "monthly_evaluations.create");

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

  const evaluation = await prisma.monthlyEvaluation.upsert({
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
  await logAudit({ actor, action: "CREATE", targetType: "MonthlyEvaluation", targetId: evaluation.id });

  revalidatePath("/monthly-evaluations");
  redirect("/monthly-evaluations");
}

export async function updateMonthlyEvaluation(
  id: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "monthly_evaluations.update");

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    return { error: "내용을 입력해주세요." };
  }
  if (content.length > MAX_LENGTH) {
    return { error: `${MAX_LENGTH}자를 초과했습니다. (현재 ${content.length}자)` };
  }

  await prisma.monthlyEvaluation.update({ where: { id }, data: { content } });
  await logAudit({ actor, action: "UPDATE", targetType: "MonthlyEvaluation", targetId: id });

  revalidatePath("/monthly-evaluations");
  revalidatePath(`/monthly-evaluations/${id}`);
  redirect("/monthly-evaluations");
}

export async function deleteMonthlyEvaluation(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "monthly_evaluations.delete");
  await prisma.monthlyEvaluation.delete({ where: { id } });
  await logAudit({ actor, action: "DELETE", targetType: "MonthlyEvaluation", targetId: id });
  revalidatePath("/monthly-evaluations");
}
