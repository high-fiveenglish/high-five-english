"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";

export async function requestHold(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const teacher = await requireTeacher();
  const actor = {
    role: "TEACHER" as const,
    id: teacher.id,
    name: teacher.realName,
    permissions: await resolveRolePermissions("TEACHER"),
  };
  requirePermission(actor, "own_leave_requests.create");

  const sessionId = Number(formData.get("classSessionId"));
  const reason = String(formData.get("reason") ?? "").trim();
  const extendedDaysRaw = Number(formData.get("extendedDays"));
  const extendedDays = Number.isInteger(extendedDaysRaw) && extendedDaysRaw > 0 ? extendedDaysRaw : 1;

  if (!sessionId) {
    return { error: "수업을 선택해주세요." };
  }

  // 클라이언트가 보낸 sessionId를 그대로 믿지 않고, 서버에서 다시 소유권과
  // 신청 가능 조건을 전부 재검증한다.
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { leaveRequest: true },
  });
  if (!session || session.teacherId !== teacher.id || session.deletedAt) {
    return { error: "본인에게 배정된 수업만 Hold 신청할 수 있습니다." };
  }
  if (session.status !== "SCHEDULED") {
    return { error: "예정된 수업만 Hold 신청할 수 있습니다." };
  }
  if (session.scheduledAt.getTime() < Date.now()) {
    return { error: "이미 지난 수업은 Hold 신청할 수 없습니다." };
  }

  const existing = session.leaveRequest;
  if (existing?.status === "PENDING") {
    return { error: "이미 승인 대기 중인 Hold 신청이 있습니다." };
  }
  if (existing?.status === "APPROVED") {
    return { error: "이미 승인되어 적용된 휴강입니다." };
  }

  let leaveRequestId: number;
  if (existing?.status === "REJECTED") {
    // classSessionId가 unique라 새 레코드를 만들지 않고, 거부된 기존 레코드를
    // 재사용해 다시 PENDING으로 되돌린다.
    const updated = await prisma.leaveRequest.update({
      where: { id: existing.id },
      data: {
        reason: reason || null,
        extendedDays,
        status: "PENDING",
        requestedByRole: "TEACHER",
        approvedById: null,
        approvedAt: null,
      },
    });
    leaveRequestId = updated.id;
  } else {
    const created = await prisma.leaveRequest.create({
      data: {
        siteId: DEFAULT_SITE_ID,
        classSessionId: sessionId,
        enrollmentId: session.enrollmentId,
        studentId: session.studentId,
        reason: reason || null,
        extendedDays,
        status: "PENDING",
        requestedByRole: "TEACHER",
      },
    });
    leaveRequestId = created.id;
  }

  // Hold 신청은 승인 대기일 뿐이므로 ClassSession/Enrollment는 여기서 전혀
  // 건드리지 않는다 — 실제 반영은 관리자 승인(approveLeaveRequest) 시점에만 일어난다.
  await logAudit({
    actor,
    action: "LEAVE_REQUESTED",
    targetType: "LeaveRequest",
    targetId: leaveRequestId,
    description: "강사 Hold 신청",
  });

  revalidatePath("/teacher/hold");
  redirect("/teacher/hold");
}
