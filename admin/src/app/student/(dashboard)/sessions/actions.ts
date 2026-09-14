"use server";

import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/studentAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { applyStudentRequestedLeave } from "@/lib/studentClassroom";

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
