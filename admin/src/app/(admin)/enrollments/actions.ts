"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import type { EnrollmentStatus } from "@/generated/prisma/client";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    throw new Error("인증되지 않은 요청입니다.");
  }
}

export async function createEnrollment(_prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();

  const studentId = Number(formData.get("studentId"));
  const teacherIdRaw = String(formData.get("teacherId") ?? "");
  const packageMonths = Number(formData.get("packageMonths") ?? 1);
  const classMethod = String(formData.get("classMethod") ?? "").trim();
  const scheduleDays = String(formData.get("scheduleDays") ?? "").trim();
  const classDurationMin = Number(formData.get("classDurationMin") ?? 25);
  const totalSessions = Number(formData.get("totalSessions") ?? 0);
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const classType = String(formData.get("classType") ?? "1:1");

  if (!studentId || !classMethod || !scheduleDays || !totalSessions || !startDate || !endDate) {
    return { error: "필수 항목을 모두 입력해주세요." };
  }

  await prisma.enrollment.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      studentId,
      teacherId: teacherIdRaw ? Number(teacherIdRaw) : null,
      packageMonths,
      classMethod,
      scheduleDays,
      classDurationMin,
      totalSessions,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      classType,
      status: "APPLIED",
    },
  });

  revalidatePath("/enrollments");
  redirect("/enrollments");
}

export async function updateEnrollmentStatus(id: number, status: EnrollmentStatus) {
  await requireAuth();
  await prisma.enrollment.update({ where: { id }, data: { status } });
  revalidatePath("/enrollments");
}

export async function deleteEnrollment(id: number) {
  await requireAuth();
  await prisma.enrollment.delete({ where: { id } });
  revalidatePath("/enrollments");
}
