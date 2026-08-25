"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import type { EnrollmentStatus, PaymentStatus } from "@/generated/prisma/client";

export async function createEnrollment(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.create");

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
  const textbookName = String(formData.get("textbookName") ?? "").trim();
  const classTime = String(formData.get("classTime") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();
  const returnToRaw = String(formData.get("returnTo") ?? "/enrollments");
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/enrollments";

  if (!studentId || !classMethod || !scheduleDays || !totalSessions || !startDate || !endDate) {
    return { error: "필수 항목을 모두 입력해주세요." };
  }

  const enrollment = await prisma.enrollment.create({
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
      textbookName: textbookName || null,
      classTime: classTime || null,
      adminNote: adminNote || null,
      status: "APPLIED",
      paymentStatus: "UNPAID",
    },
  });
  await logAudit({ actor, action: "CREATE", targetType: "Enrollment", targetId: enrollment.id });

  revalidatePath("/enrollments");
  revalidatePath("/students");
  redirect(returnTo);
}

export async function updateEnrollmentStatus(id: number, status: EnrollmentStatus) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.update");
  await prisma.enrollment.update({ where: { id }, data: { status } });
  await logAudit({ actor, action: "UPDATE", targetType: "Enrollment", targetId: id, description: `상태 변경: ${status}` });
  revalidatePath("/enrollments");
}

export async function updateEnrollmentPaymentStatus(id: number, paymentStatus: PaymentStatus | null) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.update");
  await prisma.enrollment.update({ where: { id }, data: { paymentStatus } });
  await logAudit({ actor, action: "UPDATE", targetType: "Enrollment", targetId: id, description: `결제상태 변경: ${paymentStatus ?? "미설정"}` });
  revalidatePath("/enrollments");
}

export async function deleteEnrollment(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.delete");
  await prisma.enrollment.delete({ where: { id } });
  await logAudit({ actor, action: "DELETE", targetType: "Enrollment", targetId: id });
  revalidatePath("/enrollments");
}
