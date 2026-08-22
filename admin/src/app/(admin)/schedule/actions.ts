"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { findTeacherScheduleConflict } from "@/lib/scheduleConflict";
import type { SessionStatus } from "@/generated/prisma/client";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    throw new Error("인증되지 않은 요청입니다.");
  }
}

export async function createClassSession(_prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();

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

  await prisma.classSession.create({
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

  revalidatePath("/schedule");
  redirect("/schedule");
}

export async function updateClassSessionStatus(id: number, status: SessionStatus) {
  await requireAuth();
  await prisma.classSession.update({ where: { id }, data: { status } });
  revalidatePath("/schedule");
}

export async function deleteClassSession(id: number) {
  await requireAuth();
  await prisma.classSession.delete({ where: { id } });
  revalidatePath("/schedule");
}
