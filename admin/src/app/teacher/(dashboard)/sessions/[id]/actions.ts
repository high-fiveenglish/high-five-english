"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";

const MAX_LENGTH = 2000;

export async function saveEvaluation(
  sessionId: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const teacher = await requireTeacher();
  const actor = { role: "TEACHER" as const, id: teacher.id, name: teacher.realName, permissions: await resolveRolePermissions("TEACHER") };
  requirePermission(actor, "own_evaluations.update");

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    return { error: "내용을 입력해주세요." };
  }
  if (content.length > MAX_LENGTH) {
    return { error: `${MAX_LENGTH}자를 초과했습니다. (현재 ${content.length}자)` };
  }

  // 세션 렌더 시점뿐 아니라 저장 시점에도 다시 소유권을 확인한다 — 폼 자체는 누구나
  // 열어볼 수 있는 게 아니지만(페이지에서 이미 막음), 서버 액션은 별도 POST 엔드포인트라
  // 클라이언트를 신뢰하지 않고 여기서도 검증해야 한다.
  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session || session.teacherId !== teacher.id) {
    return { error: "본인이 진행한 수업만 평가서를 작성할 수 있습니다." };
  }
  if (session.status !== "COMPLETED") {
    return { error: "완료된 수업만 평가서를 작성할 수 있습니다." };
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

  revalidatePath("/teacher/sessions");
  revalidatePath(`/teacher/sessions/${sessionId}`);
  redirect("/teacher/sessions");
}
