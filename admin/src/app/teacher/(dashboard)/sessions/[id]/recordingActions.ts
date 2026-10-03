"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { languageForRegion, translateLessonEvaluation, shouldTranslate } from "@/lib/levelTestTranslation";
import { shouldRequireOverwriteConfirmation } from "@/lib/recordingWorkflow";
import { triggerRecordingProcessing } from "@/lib/recordingTrigger";
import { CONFIRM_ERROR_MESSAGES, confirmTeacherSpeaker } from "@/lib/speakerConfirmation";
import {
  commitAIDraftPublish,
  evaluationBlockedReason,
  MAX_PUBLISH_CONTENT_LENGTH,
  PublishConflictError,
  PUBLISH_CONFLICT_MESSAGES,
} from "@/lib/recordingPublish";

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
  if (content.length > MAX_PUBLISH_CONTENT_LENGTH) {
    return { error: `Draft is too long (max ${MAX_PUBLISH_CONTENT_LENGTH} characters).` };
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
  const blocked = evaluationBlockedReason(session);
  if (blocked) return { error: blocked };

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

  // 읽기(existing)와 쓰기 사이에 번역 API 호출 등이 끼어 있으므로, 쓰기는 한 트랜잭션 안에서
  // 조건부로만 한다 — 동시 publish·동시 수동 저장이 있어도 다른 평가서를 조용히 덮어쓰지 않는다
  // (규칙과 근거는 recordingPublish.ts).
  const recordingId = session.audioRecording.id;
  const data = { content, contentTranslated, contentTranslatedLang };
  try {
    await prisma.$transaction(async (tx) => {
      await commitAIDraftPublish(
        {
          async claimRecordingForPublish(id) {
            const res = await tx.audioRecording.updateMany({
              where: { id, processingStatus: "NEEDS_REVIEW" },
              data: { processingStatus: "PUBLISHED", reviewedAt: new Date() },
            });
            return res.count === 1;
          },
          async updateEvaluationIfUnchanged(classSessionId, expectedUpdatedAt, d) {
            const res = await tx.lessonEvaluation.updateMany({ where: { classSessionId, updatedAt: expectedUpdatedAt }, data: d });
            return res.count === 1;
          },
          async createEvaluation(classSessionId, d) {
            try {
              await tx.lessonEvaluation.create({ data: { classSessionId, ...d } });
              return true;
            } catch (err) {
              if ((err as { code?: string }).code === "P2002") return false;
              throw err;
            }
          },
          async markSessionCompleted(classSessionId) {
            await tx.classSession.update({ where: { id: classSessionId }, data: { status: "COMPLETED" } });
          },
        },
        { recordingId, classSessionId: sessionId, sessionStatus: session.status, existing, data },
      );
    });
  } catch (err) {
    if (err instanceof PublishConflictError) return { error: PUBLISH_CONFLICT_MESSAGES[err.reason] };
    throw err;
  }
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

// ── Teacher Confirmation of the speaker roles ──────────────────────────────────────────────────────────────────────
// The analysis stopped because the application could not tell with enough confidence which voice is the teacher. The teacher of THIS
// lesson picks the voice; the analysis then resumes from the transcript that is already stored (AssemblyAI is not called again).
// Who may confirm, which labels are valid and what happens on a repeated request are decided in speakerConfirmation.ts (server side);
// this action only authenticates, wires the database and revalidates the page.
export type ConfirmSpeakerState = { error?: string; success?: true; message?: string } | undefined;

export async function confirmTeacherSpeakerAction(
  sessionId: number,
  _prevState: ConfirmSpeakerState,
  formData: FormData,
): Promise<ConfirmSpeakerState> {
  const teacher = await requireTeacher();
  const actor = {
    role: "TEACHER" as const,
    id: teacher.id,
    name: teacher.realName,
    permissions: await resolveRolePermissions("TEACHER"),
  };
  requirePermission(actor, "own_evaluations.update");

  const result = await confirmTeacherSpeaker(
    {
      async findSession(id) {
        if (!Number.isSafeInteger(id) || id <= 0) return null;
        const session = await prisma.classSession.findUnique({
          where: { id },
          select: {
            teacherId: true,
            audioRecording: { select: { id: true, processingStatus: true, confirmedTeacherSpeaker: true, transcriptUtterances: true } },
          },
        });
        if (!session) return null;
        const rec = session.audioRecording;
        return {
          sessionTeacherId: session.teacherId ?? -1,
          recording: rec
            ? { id: rec.id, processingStatus: rec.processingStatus, confirmedTeacherSpeaker: rec.confirmedTeacherSpeaker, utterances: rec.transcriptUtterances }
            : null,
        };
      },
      async markConfirmed(recordingId, label, teacherId) {
        // One conditional UPDATE: only a recording that is still waiting changes; of two concurrent requests only one gets count 1.
        const res = await prisma.audioRecording.updateMany({
          where: { id: recordingId, processingStatus: "NEEDS_SPEAKER_CONFIRMATION" },
          data: {
            processingStatus: "TEACHER_SPEAKER_CONFIRMED",
            speakerMappingStatus: "TEACHER_CONFIRMED",
            confirmedTeacherSpeaker: label,
            speakerConfirmedAt: new Date(),
            speakerConfirmedByTeacherId: teacherId,
            errorMessage: null,
          },
        });
        return res.count === 1;
      },
      triggerProcessing: triggerRecordingProcessing,
    },
    { teacherId: teacher.id, sessionId, label: formData.get("teacherSpeaker") },
  );

  if (!result.ok) return { error: CONFIRM_ERROR_MESSAGES[result.error] };
  revalidatePath(`/teacher/sessions/${sessionId}`);
  return {
    success: true as const,
    message:
      result.state === "confirmed"
        ? "Thank you. The AI draft is being prepared from the existing transcript."
        : "This speaker was already confirmed.",
  };
}
