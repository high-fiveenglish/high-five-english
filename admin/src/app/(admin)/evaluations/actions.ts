"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";

const MAX_LENGTH = 2000;

export async function saveEvaluationAdmin(
  sessionId: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "evaluations.update");

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    return { error: "내용을 입력해주세요." };
  }
  if (content.length > MAX_LENGTH) {
    return { error: `${MAX_LENGTH}자를 초과했습니다. (현재 ${content.length}자)` };
  }

  const existing = await prisma.lessonEvaluation.findUnique({ where: { classSessionId: sessionId } });
  await prisma.lessonEvaluation.upsert({
    where: { classSessionId: sessionId },
    update: { content },
    create: { classSessionId: sessionId, content },
  });
  await logAudit({
    actor,
    action: existing ? "EVALUATION_UPDATED" : "EVALUATION_CREATED",
    targetType: "LessonEvaluation",
    targetId: sessionId,
  });

  revalidatePath("/evaluations");
  revalidatePath(`/evaluations/${sessionId}`);
  redirect("/evaluations");
}
