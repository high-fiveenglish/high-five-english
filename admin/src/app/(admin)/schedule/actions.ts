"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { findTeacherScheduleConflict } from "@/lib/scheduleConflict";
import type { SessionStatus } from "@/generated/prisma/client";

export async function createClassSession(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.create");

  const enrollmentId = Number(formData.get("enrollmentId"));
  const scheduledAt = String(formData.get("scheduledAt") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 25);

  if (!enrollmentId || !scheduledAt) {
    return { error: "수강신청과 수업 일시는 필수입니다." };
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || !enrollment.teacherId) {
    return { error: "선택한 수강신청에 배정된 강사가 없습니다. 강사를 먼저 배정해주세요." };
  }

  const conflict = await findTeacherScheduleConflict({
    teacherId: enrollment.teacherId,
    start: new Date(scheduledAt),
    durationMin,
  });
  if (conflict) {
    return { error: `해당 강사는 같은 시간에 이미 다른 일정이 있습니다: ${conflict.label}` };
  }

  const session = await prisma.classSession.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      enrollmentId,
      studentId: enrollment.studentId,
      teacherId: enrollment.teacherId,
      scheduledAt: new Date(scheduledAt),
      durationMin,
      status: "SCHEDULED",
    },
  });
  await logAudit({ actor, action: "SCHEDULE_CREATED", targetType: "ClassSession", targetId: session.id });

  revalidatePath("/schedule");
  redirect("/schedule");
}

export async function updateClassSessionStatus(id: number, status: SessionStatus) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.update");
  await prisma.classSession.update({ where: { id }, data: { status } });
  await logAudit({ actor, action: "SCHEDULE_UPDATED", targetType: "ClassSession", targetId: id, description: `상태 변경: ${status}` });
  revalidatePath("/schedule");
}

export async function deleteClassSession(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.delete");
  await prisma.classSession.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit({ actor, action: "SCHEDULE_CANCELLED", targetType: "ClassSession", targetId: id });
  revalidatePath("/schedule");
  revalidatePath("/deleted-sessions");
}

export async function restoreClassSession(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.update");
  await prisma.classSession.update({ where: { id }, data: { deletedAt: null } });
  await logAudit({ actor, action: "SCHEDULE_UPDATED", targetType: "ClassSession", targetId: id, description: "삭제 취소(복원)" });
  revalidatePath("/schedule");
  revalidatePath("/deleted-sessions");
}
