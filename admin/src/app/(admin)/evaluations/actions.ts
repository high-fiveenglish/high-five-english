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
  const textbookName = String(formData.get("textbookName") ?? "").trim();
  const progressNote = String(formData.get("progressNote") ?? "").trim();
  if (!content) {
    return { error: "내용을 입력해주세요." };
  }
  if (content.length > MAX_LENGTH) {
    return { error: `${MAX_LENGTH}자를 초과했습니다. (현재 ${content.length}자)` };
  }

  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === "CANCELLED" || session.status === "LEAVE" || session.status === "HOLD") {
    return { error: "취소·휴강·홀드 처리된 수업은 평가서를 작성할 수 없습니다." };
  }
  if (session.scheduledAt.getTime() > Date.now()) {
    return { error: "수업 시작 시각이 지나야 평가서를 작성할 수 있습니다." };
  }

  const existing = await prisma.lessonEvaluation.findUnique({ where: { classSessionId: sessionId } });
  await prisma.lessonEvaluation.upsert({
    where: { classSessionId: sessionId },
    update: { content },
    create: { classSessionId: sessionId, content },
  });
  // 교재는 이 수업 한 건이 아니라 수강 건 전체에 걸린 값이라 Enrollment에 저장한다.
  // 진도는 그날 수업 하나에만 해당하는 메모라 ClassSession에 저장한다. 강사가 평가서를
  // 쓸 때와 동일하게, 관리자가 평가서를 저장하는 것도 "수업이 진행되었다"는 확정
  // 신호로 보고 상태를 COMPLETED로 전환한다.
  await prisma.$transaction([
    prisma.classSession.update({
      where: { id: sessionId },
      data: { progressNote: progressNote || null, status: session.status !== "COMPLETED" ? "COMPLETED" : undefined },
    }),
    prisma.enrollment.update({ where: { id: session.enrollmentId }, data: { textbookName: textbookName || null } }),
  ]);
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
