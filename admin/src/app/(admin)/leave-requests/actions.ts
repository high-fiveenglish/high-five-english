"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { applyClassLeave } from "@/lib/leaveApply";

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

  const session = await prisma.classSession.findUnique({ where: { id: sessionId }, include: { leaveRequest: true } });
  if (!session) {
    return { error: "존재하지 않는 수업입니다." };
  }
  if (session.status !== "SCHEDULED") {
    return { error: "예정된 수업만 휴강 처리할 수 있습니다." };
  }
  // classSessionId가 unique라, 강사가 신청한 PENDING Hold가 이미 있는 수업에
  // 관리자가 별도로 등록을 시도하면 DB 제약 위반으로 죽는 대신 여기서 먼저 막는다.
  if (session.leaveRequest && session.leaveRequest.status !== "REJECTED") {
    return { error: "이미 처리 중이거나 적용된 휴강 신청이 있는 수업입니다." };
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: session.enrollmentId } });
  if (!enrollment) {
    return { error: "연결된 수강신청 정보를 찾을 수 없습니다." };
  }

  // 관리자 등록은 기존과 동일하게 즉시 확정(APPROVED)된다 — Teacher Hold만 승인
  // 대기(PENDING)를 거친다.
  const leaveRequest = await prisma.$transaction(async (tx) => {
    await applyClassLeave(tx, {
      classSessionId: sessionId,
      enrollmentId: enrollment.id,
      currentEndDate: enrollment.endDate,
      extendedDays: EXTENDED_DAYS,
    });
    // classSessionId가 unique이므로, 이전에 거부된(REJECTED) 강사 Hold 레코드가
    // 남아있는 경우를 위해 create 대신 upsert를 쓴다.
    return tx.leaveRequest.upsert({
      where: { classSessionId: sessionId },
      create: {
        siteId: DEFAULT_SITE_ID,
        classSessionId: sessionId,
        enrollmentId: enrollment.id,
        studentId: session.studentId,
        reason: reason || null,
        extendedDays: EXTENDED_DAYS,
        status: "APPROVED",
        requestedByRole: actor.role,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
      update: {
        reason: reason || null,
        extendedDays: EXTENDED_DAYS,
        status: "APPROVED",
        requestedByRole: actor.role,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
    });
  });
  await logAudit({ actor, action: "LEAVE_REQUESTED", targetType: "LeaveRequest", targetId: leaveRequest.id, description: "관리자가 연기 생성·적용" });

  revalidatePath("/leave-requests");
  redirect("/leave-requests");
}

export async function approveLeaveRequest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");

  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leaveRequest) throw new Error("존재하지 않는 요청입니다.");
  if (leaveRequest.status !== "PENDING") throw new Error("대기 중인 요청만 승인할 수 있습니다.");

  const enrollment = await prisma.enrollment.findUnique({ where: { id: leaveRequest.enrollmentId } });
  if (!enrollment) throw new Error("연결된 수강신청 정보를 찾을 수 없습니다.");

  await prisma.$transaction(async (tx) => {
    await applyClassLeave(tx, {
      classSessionId: leaveRequest.classSessionId,
      enrollmentId: enrollment.id,
      currentEndDate: enrollment.endDate,
      extendedDays: leaveRequest.extendedDays,
    });
    await tx.leaveRequest.update({
      where: { id },
      data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() },
    });
  });
  await logAudit({ actor, action: "LEAVE_APPROVED", targetType: "LeaveRequest", targetId: id });

  revalidatePath("/leave-requests");
  revalidatePath("/teacher/hold");
}

export async function rejectLeaveRequest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");

  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leaveRequest) throw new Error("존재하지 않는 요청입니다.");
  if (leaveRequest.status !== "PENDING") throw new Error("대기 중인 요청만 거부할 수 있습니다.");

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "REJECTED", approvedById: actor.id, approvedAt: new Date() },
  });
  await logAudit({ actor, action: "LEAVE_REJECTED", targetType: "LeaveRequest", targetId: id });

  revalidatePath("/leave-requests");
  revalidatePath("/teacher/hold");
}

export async function revertLeaveRequest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.revert");

  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leaveRequest) return;
  // PENDING/REJECTED 요청은 애초에 ClassSession/Enrollment를 건드리지 않았으므로
  // 되돌릴 대상이 없다 — APPROVED(실제 적용된) 요청만 되돌릴 수 있다.
  if (leaveRequest.status !== "APPROVED") {
    throw new Error("실제로 적용된(승인된) 요청만 되돌릴 수 있습니다.");
  }

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
