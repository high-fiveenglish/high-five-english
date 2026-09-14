"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";

const MAX_LENGTH = 4000;

export async function saveMonthlyEvaluation(
  enrollmentId: number,
  cycleNumber: number,
  sessionsPerCycle: number,
  _prevState: { error?: string; success?: true } | undefined,
  formData: FormData,
) {
  const teacher = await requireTeacher();
  const actor = {
    role: "TEACHER" as const,
    id: teacher.id,
    name: teacher.realName,
    permissions: await resolveRolePermissions("TEACHER"),
  };
  requirePermission(actor, "own_monthly_evaluations.update");

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    return { error: "Please enter the evaluation content." };
  }
  if (content.length > MAX_LENGTH) {
    return { error: `Exceeded ${MAX_LENGTH} characters. (currently ${content.length})` };
  }

  // 세션 렌더 시점과 마찬가지로 저장 시점에도 이 강사 본인의 수강생인지 다시 확인한다.
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.teacherId !== teacher.id) {
    return { error: "You can only write evaluations for your own students." };
  }

  const existing = await prisma.monthlyEvaluation.findUnique({
    where: { enrollmentId_cycleNumber: { enrollmentId, cycleNumber } },
  });
  await prisma.monthlyEvaluation.upsert({
    where: { enrollmentId_cycleNumber: { enrollmentId, cycleNumber } },
    update: { content, teacherId: teacher.id },
    create: {
      siteId: DEFAULT_SITE_ID,
      studentId: enrollment.studentId,
      teacherId: teacher.id,
      enrollmentId,
      cycleNumber,
      sessionsPerCycle,
      content,
    },
  });
  await logAudit({
    actor,
    action: existing ? "EVALUATION_UPDATED" : "EVALUATION_CREATED",
    targetType: "MonthlyEvaluation",
    targetId: enrollmentId,
    description: `cycle ${cycleNumber}`,
  });

  revalidatePath("/teacher/monthly-evaluations");
  revalidatePath(`/teacher/monthly-evaluations/${enrollmentId}/${cycleNumber}`);
  return { success: true as const };
}
