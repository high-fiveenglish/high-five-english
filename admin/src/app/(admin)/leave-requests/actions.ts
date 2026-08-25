"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";

const EXTENDED_DAYS = 1;

export async function createLeaveRequestAdmin(
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");

  const sessionId = Number(formData.get("classSessionId"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!sessionId) {
    return { error: "수업을 선택해주세요." };
  }

  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return { error: "존재하지 않는 수업입니다." };
  }
  if (session.status !== "SCHEDULED") {
    return { error: "예정된 수업만 휴강 처리할 수 있습니다." };
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: session.enrollmentId } });
  if (!enrollment) {
    return { error: "연결된 수강신청 정보를 찾을 수 없습니다." };
  }

  const newEndDate = new Date(enrollment.endDate);
  newEndDate.setDate(newEndDate.getDate() + EXTENDED_DAYS);

  const [, , leaveRequest] = await prisma.$transaction([
    prisma.classSession.update({ where: { id: sessionId }, data: { status: "LEAVE" } }),
    prisma.enrollment.update({ where: { id: enrollment.id }, data: { endDate: newEndDate } }),
    prisma.leaveRequest.create({
      data: {
        siteId: DEFAULT_SITE_ID,
        classSessionId: sessionId,
        enrollmentId: enrollment.id,
        studentId: session.studentId,
        reason: reason || null,
        extendedDays: EXTENDED_DAYS,
      },
    }),
  ]);
  await logAudit({ actor, action: "LEAVE_REQUESTED", targetType: "LeaveRequest", targetId: leaveRequest.id, description: "관리자가 연기 생성·적용" });

  revalidatePath("/leave-requests");
  redirect("/leave-requests");
}

export async function revertLeaveRequest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.revert");

  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leaveRequest) return;

  const enrollment = await prisma.enrollment.findUnique({ where: { id: leaveRequest.enrollmentId } });
  if (!enrollment) return;

  const restoredEndDate = new Date(enrollment.endDate);
  restoredEndDate.setDate(restoredEndDate.getDate() - leaveRequest.extendedDays);

  await prisma.$transaction([
    prisma.classSession.update({ where: { id: leaveRequest.classSessionId }, data: { status: "SCHEDULED" } }),
    prisma.enrollment.update({ where: { id: enrollment.id }, data: { endDate: restoredEndDate } }),
    prisma.leaveRequest.delete({ where: { id } }),
  ]);
  await logAudit({ actor, action: "DELETE", targetType: "LeaveRequest", targetId: id, description: "연기 되돌리기" });

  revalidatePath("/leave-requests");
}
