"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { languageForRegion, translateLessonEvaluation, shouldTranslate } from "@/lib/levelTestTranslation";

const MAX_LENGTH = 2000;

export async function saveEvaluation(
  sessionId: number,
  _prevState: { error?: string; success?: true } | undefined,
  formData: FormData,
) {
  const teacher = await requireTeacher();
  const actor = { role: "TEACHER" as const, id: teacher.id, name: teacher.realName, permissions: await resolveRolePermissions("TEACHER") };
  requirePermission(actor, "own_evaluations.update");

  const content = String(formData.get("content") ?? "").trim();
  const textbookName = String(formData.get("textbookName") ?? "").trim();
  const progressNote = String(formData.get("progressNote") ?? "").trim();
  if (!content) {
    return { error: "Please enter the evaluation content." };
  }
  if (content.length > MAX_LENGTH) {
    return { error: `Exceeded ${MAX_LENGTH} characters. (currently ${content.length})` };
  }

  // 세션 렌더 시점뿐 아니라 저장 시점에도 다시 소유권을 확인한다 — 폼 자체는 누구나
  // 열어볼 수 있는 게 아니지만(페이지에서 이미 막음), 서버 액션은 별도 POST 엔드포인트라
  // 클라이언트를 신뢰하지 않고 여기서도 검증해야 한다.
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { student: { select: { region: true } } },
  });
  if (!session || session.teacherId !== teacher.id) {
    return { error: "You can only write evaluations for your own classes." };
  }
  // 관리자가 수동으로 COMPLETED 처리해야만 평가서를 쓸 수 있던 기존 방식 대신, 수업
  // 시작 시각이 지나면 강사가 직접 평가서를 작성할 수 있다 — 평가서 저장 자체가
  // "수업이 진행되었다"는 확정 신호이므로 아래에서 상태를 COMPLETED로 전환한다.
  if (session.status === "CANCELLED" || session.status === "LEAVE" || session.status === "HOLD") {
    return { error: "Evaluations cannot be written for a cancelled, on-hold, or paused class." };
  }
  if (session.scheduledAt.getTime() > Date.now()) {
    return { error: "You can write an evaluation once the class time has arrived." };
  }

  const existing = await prisma.lessonEvaluation.findUnique({ where: { classSessionId: sessionId } });

  // Daily Evaluation 번역 — 관리자 쪽 saveEvaluationAdmin과 동일한 저장 시점 번역·캐시
  // 패턴. content가 안 바뀌었고 대상 언어도 그대로면 번역 API를 다시 부르지 않는다.
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

  await prisma.lessonEvaluation.upsert({
    where: { classSessionId: sessionId },
    update: { content, contentTranslated, contentTranslatedLang },
    create: { classSessionId: sessionId, content, contentTranslated, contentTranslatedLang },
  });
  // 교재는 이 수업 한 건이 아니라 수강 건 전체에 걸린 값이라 Enrollment에 저장한다 —
  // 평가서에서 바꾸면 그 수강 건의 다음 수업들에도 그대로 이어진다. 진도는 그날 수업
  // 하나에만 해당하는 메모라 ClassSession에 저장한다.
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

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  revalidatePath(`/teacher/sessions/${sessionId}`);
  return { success: true as const };
}
