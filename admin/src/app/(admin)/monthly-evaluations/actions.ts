"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";

const MAX_LENGTH = 4000;

export async function saveMonthlyEvaluation(
  enrollmentId: number,
  cycleNumber: number,
  sessionsPerCycle: number,
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

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) {
    return { error: "존재하지 않는 수강 건입니다." };
  }

  const evaluation = await prisma.monthlyEvaluation.upsert({
    where: { enrollmentId_cycleNumber: { enrollmentId, cycleNumber } },
    update: { content },
    create: {
      siteId: DEFAULT_SITE_ID,
      studentId: enrollment.studentId,
      teacherId: enrollment.teacherId,
      enrollmentId,
      cycleNumber,
      sessionsPerCycle,
      content,
    },
  });
  await logAudit({
    actor,
    action: "UPDATE",
    targetType: "MonthlyEvaluation",
    targetId: evaluation.id,
    description: `${cycleNumber}차 회차`,
  });

  revalidatePath("/monthly-evaluations");
  revalidatePath(`/monthly-evaluations/${enrollmentId}/${cycleNumber}`);
  redirect("/monthly-evaluations");
}

export async function deleteMonthlyEvaluation(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "monthly_evaluations.delete");
  await prisma.monthlyEvaluation.delete({ where: { id } });
  await logAudit({ actor, action: "DELETE", targetType: "MonthlyEvaluation", targetId: id });
  revalidatePath("/monthly-evaluations");
}
