"use server";

import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/studentAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { applyStudentRequestedLeave } from "@/lib/studentClassroom";
import { releaseHold } from "@/lib/holdApply";
import { prisma } from "@/lib/prisma";

export async function requestLeave(sessionId: number, reason: string): Promise<{ error?: string }> {
  const student = await requireStudent();
  const actor = { role: "STUDENT" as const, id: student.id, name: student.name, permissions: await resolveRolePermissions("STUDENT") };
  requirePermission(actor, "leave_requests.create");

  const result = await applyStudentRequestedLeave(student.id, sessionId, reason);
  if (result.error) return { error: result.error };

  await logAudit({ actor, action: "LEAVE_REQUESTED", targetType: "LeaveRequest", targetId: result.leaveRequestId });

  revalidatePath("/student/sessions");
  revalidatePath("/student");
  return {};
}

// 학생의 "홀드 해제 요청" — 관리자 승인 없이 바로 적용된다(요청 자체가 곧 실행이다),
// 학생 셀프 휴강 신청과 동일한 정책. 본인 소유(studentId 일치)가 아닌 수강 건은
// holdApply.releaseHold를 실행하기 전에 막는다.
export async function requestHoldRelease(enrollmentId: number): Promise<{ error?: string }> {
  const student = await requireStudent();
  const actor = {
    role: "STUDENT" as const,
    id: student.id,
    name: student.name,
    permissions: await resolveRolePermissions("STUDENT"),
  };
  requirePermission(actor, "own_enrollment.hold_release");

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.studentId !== student.id) {
    return { error: "본인 수강 건만 홀드 해제를 요청할 수 있습니다." };
  }

  const result = await releaseHold(enrollmentId);
  if (result.error) return result;

  await logAudit({ actor, action: "UPDATE", targetType: "Enrollment", targetId: enrollmentId, description: "학생 홀드 해제 요청" });

  revalidatePath("/student/sessions");
  revalidatePath("/student");
  return {};
}
