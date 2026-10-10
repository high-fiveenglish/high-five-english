"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { languageForRegion, translateLessonEvaluation, shouldTranslate } from "@/lib/levelTestTranslation";
import { requireHeadquarters } from "@/lib/agentScope";

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
  requireHeadquarters(actor);

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    return { error: "내용을 입력해주세요." };
  }
  if (content.length > MAX_LENGTH) {
    return { error: `${MAX_LENGTH}자를 초과했습니다. (현재 ${content.length}자)` };
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { student: { select: { region: true } } },
  });
  if (!enrollment) {
    return { error: "존재하지 않는 수강 건입니다." };
  }

  const existing = await prisma.monthlyEvaluation.findUnique({
    where: { enrollmentId_cycleNumber: { enrollmentId, cycleNumber } },
  });

  // Monthly Evaluation 번역 — 강사 쪽 saveMonthlyEvaluation과 동일한 저장 시점 번역·캐시
  // 패턴. content가 안 바뀌었고 대상 언어도 그대로면 번역 API를 다시 부르지 않는다.
  const targetLang = languageForRegion(enrollment.student.region);
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

  const evaluation = await prisma.monthlyEvaluation.upsert({
    where: { enrollmentId_cycleNumber: { enrollmentId, cycleNumber } },
    update: { content, contentTranslated, contentTranslatedLang },
    create: {
      siteId: DEFAULT_SITE_ID,
      studentId: enrollment.studentId,
      teacherId: enrollment.teacherId,
      enrollmentId,
      cycleNumber,
      sessionsPerCycle,
      content,
      contentTranslated,
      contentTranslatedLang,
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
  requireHeadquarters(actor);
  await prisma.monthlyEvaluation.delete({ where: { id } });
  await logAudit({ actor, action: "DELETE", targetType: "MonthlyEvaluation", targetId: id });
  revalidatePath("/monthly-evaluations");
}
