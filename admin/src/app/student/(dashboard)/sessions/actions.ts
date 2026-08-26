"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { applyClassLeave } from "@/lib/leaveApply";

const EXTENDED_DAYS = 1;

export async function requestLeave(sessionId: number, reason: string): Promise<{ error?: string }> {
  const student = await requireStudent();
  const actor = { role: "STUDENT" as const, id: student.id, name: student.name, permissions: await resolveRolePermissions("STUDENT") };
  requirePermission(actor, "leave_requests.create");

  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session || session.studentId !== student.id) {
    return { error: "본인 수업만 휴강 신청할 수 있습니다." };
  }
  if (session.status !== "SCHEDULED") {
    return { error: "예정된 수업만 휴강 신청할 수 있습니다." };
  }
  if (session.scheduledAt.getTime() < Date.now()) {
    return { error: "이미 지난 수업은 휴강 신청할 수 없습니다." };
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: session.enrollmentId } });
  if (!enrollment) {
    return { error: "연결된 수강신청 정보를 찾을 수 없습니다." };
  }

  // 학생 셀프 신청은 기존과 동일하게 즉시 확정(APPROVED)된다 — Teacher Hold만
  // 승인 대기(PENDING)를 거친다.
  const leaveRequest = await prisma.$transaction(async (tx) => {
    await applyClassLeave(tx, {
      classSessionId: sessionId,
      enrollmentId: enrollment.id,
      currentEndDate: enrollment.endDate,
      extendedDays: EXTENDED_DAYS,
    });
    return tx.leaveRequest.create({
      data: {
        siteId: DEFAULT_SITE_ID,
        classSessionId: sessionId,
        enrollmentId: enrollment.id,
        studentId: student.id,
        reason: reason.trim() || null,
        extendedDays: EXTENDED_DAYS,
        status: "APPROVED",
        requestedByRole: "STUDENT",
        approvedById: null,
        approvedAt: new Date(),
      },
    });
  });
  await logAudit({ actor, action: "LEAVE_REQUESTED", targetType: "LeaveRequest", targetId: leaveRequest.id });

  revalidatePath("/student/sessions");
  revalidatePath("/student");
  return {};
}
