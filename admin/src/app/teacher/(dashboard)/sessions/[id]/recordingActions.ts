"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { languageForRegion, translateLessonEvaluation, shouldTranslate } from "@/lib/levelTestTranslation";
import { shouldRequireOverwriteConfirmation } from "@/lib/recordingWorkflow";

// AudioRecording.aiDraft를 검토 후 LessonEvaluation으로 발행한다. saveEvaluation(위
// actions.ts)과 같은 소유권 검증·번역 캐시 패턴을 그대로 재사용한다 — 다른 점은
// "이미 작성된 평가서가 있으면 명시적 확인 없이 덮어쓰지 않는다"는 보호 규칙뿐이다.
// 반환 타입을 명시적으로 고정하는 이유: useActionState의 오버로드 추론이 3갈래
// union(error/needsConfirmation/success)을 bind()와 함께 쓸 때 타입을 제대로 좁히지
// 못해 일으키는 TS 오버로드 불일치를 막기 위함(ClassRecordingPanel.tsx 참고).
export type PublishAIDraftState = { error?: string; success?: true; needsConfirmation?: true } | undefined;

export async function publishAIDraft(
  sessionId: number,
  _prevState: PublishAIDraftState,
  formData: FormData,
): Promise<PublishAIDraftState> {
  const teacher = await requireTeacher();
  const actor = {
    role: "TEACHER" as const,
    id: teacher.id,
    name: teacher.realName,
    permissions: await resolveRolePermissions("TEACHER"),
  };
  requirePermission(actor, "own_evaluations.update");

  const content = String(formData.get("content") ?? "").trim();
  const confirmOverwrite = formData.get("confirmOverwrite") === "true";
  if (!content) {
    return { error: "Draft content is empty." };
  }

  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { student: { select: { region: true } }, audioRecording: true },
  });
  if (!session || session.teacherId !== teacher.id) {
    return { error: "You can only publish drafts for your own classes." };
  }
  if (!session.audioRecording || session.audioRecording.processingStatus !== "NEEDS_REVIEW") {
    return { error: "No AI draft is ready for review." };
  }

  const existing = await prisma.lessonEvaluation.findUnique({ where: { classSessionId: sessionId } });
  if (shouldRequireOverwriteConfirmation(!!existing, confirmOverwrite)) {
    // 기존 평가서가 있다 — AI 초안으로 교체할지 호출부(화면)에서 명시적으로 다시
    // 확인받아야 한다. 여기서 바로 덮어쓰지 않는다.
    return { needsConfirmation: true };
  }

  const targetLang = languageForRegion(session.student.region);
  let contentTranslated: string | null = existing?.contentTranslated ?? null;
  let contentTranslatedLang: string | null = existing?.contentTranslatedLang ?? null;
  if (
    shouldTranslate({
      newContent: content,
      targetLangCode: targetLang?.code ?? null,
      previousContent: existing?.content ?? null,
      previousTranslatedLangCode: contentTranslatedLang,
    })
  ) {
    contentTranslated = await translateLessonEvaluation(content, targetLang!.name);
    contentTranslatedLang = contentTranslated ? targetLang!.code : null;
  } else if (!targetLang) {
    contentTranslated = null;
    contentTranslatedLang = null;
  }

  await prisma.$transaction([
    prisma.lessonEvaluation.upsert({
      where: { classSessionId: sessionId },
      update: { content, contentTranslated, contentTranslatedLang },
      create: { classSessionId: sessionId, content, contentTranslated, contentTranslatedLang },
    }),
    prisma.audioRecording.update({
      where: { id: session.audioRecording.id },
      data: { processingStatus: "PUBLISHED", reviewedAt: new Date() },
    }),
  ]);
  await logAudit({
    actor,
    action: existing ? "EVALUATION_UPDATED" : "EVALUATION_CREATED",
    targetType: "LessonEvaluation",
    targetId: sessionId,
    description: "Published from AI-generated draft",
  });

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  revalidatePath(`/teacher/sessions/${sessionId}`);
  return { success: true as const };
}
