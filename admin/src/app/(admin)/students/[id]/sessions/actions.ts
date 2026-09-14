"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { applyClassLeave } from "@/lib/leaveApply";
import { findTeacherScheduleConflict } from "@/lib/scheduleConflict";
import { parseAppDateTime } from "@/lib/appTime";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { isWithinAvailableHours, timeStringToMinuteOfDay } from "@/lib/timeSlots";

const EXTENDED_DAYS = 1;

// 학생관리 > 수업관리 캘린더 전용 액션 모음. 기존 전체일정표(schedule)/휴강관리
// (leave-requests)의 로직을 그대로 재사용하되, 이 화면에서 바로 다시 그려질 수
// 있도록 redirect 없이 revalidatePath만 하고 이 페이지 경로를 함께 갱신한다.

// 대체수업은 수강신청 자체의 담당 강사가 아니라 다른 강사가 대신 진행하는 경우가
// 많아, 날짜/시간/수업시간을 먼저 정하면 그 슬롯에 (1) 근무 가능 시간으로 등록해뒀고
// (2) 실제 다른 일정과 겹치지 않는 강사만 골라 보여준다(담당 강사로 고정하지 않음).
// 승인(APPROVED)·활성(ACTIVE) 강사만 대상.
export async function getAvailableTeachersForSlot(
  scheduledAt: string,
  durationMin: number,
): Promise<{ id: number; label: string }[]> {
  await requireBackofficeActor();
  if (!scheduledAt || !durationMin) return [];

  const start = parseAppDateTime(scheduledAt);
  const startMinute = timeStringToMinuteOfDay(scheduledAt.split("T")[1] ?? "");
  const teachers = await prisma.teacher.findMany({
    where: { siteId: DEFAULT_SITE_ID, approvalStatus: "APPROVED", accountStatus: "ACTIVE" },
    orderBy: { realName: "asc" },
    select: TEACHER_SUMMARY_SELECT,
  });

  const available: { id: number; label: string }[] = [];
  for (const teacher of teachers) {
    if (!isWithinAvailableHours(teacher.availableHours, startMinute, durationMin)) continue;
    const conflict = await findTeacherScheduleConflict({ teacherId: teacher.id, start, durationMin });
    if (!conflict) available.push({ id: teacher.id, label: teacher.realName });
  }
  return available;
}

export async function addSupplementSession(
  studentId: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.create");

  const enrollmentId = Number(formData.get("enrollmentId"));
  const teacherId = Number(formData.get("teacherId"));
  const scheduledAt = String(formData.get("scheduledAt") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 25);

  if (!enrollmentId || !scheduledAt || !teacherId) {
    return { error: "수강신청·수업 일시·담당 강사는 필수입니다." };
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.studentId !== studentId) {
    return { error: "이 학생의 수강신청이 아닙니다." };
  }

  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher || teacher.siteId !== DEFAULT_SITE_ID) {
    return { error: "선택한 강사를 찾을 수 없습니다." };
  }

  // 목록을 보여준 뒤 제출까지 시간차가 있을 수 있으므로, 실제 저장 직전에 다시 한 번
  // 확인한다(그 사이 다른 일정이 잡혔을 수 있음).
  const conflict = await findTeacherScheduleConflict({
    teacherId,
    start: parseAppDateTime(scheduledAt),
    durationMin,
  });
  if (conflict) {
    return { error: `해당 강사는 같은 시간에 이미 다른 일정이 있습니다: ${conflict.label}` };
  }

  const session = await prisma.classSession.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      enrollmentId,
      studentId,
      teacherId,
      scheduledAt: parseAppDateTime(scheduledAt),
      durationMin,
      status: "SCHEDULED",
      isSupplement: true,
    },
  });
  await logAudit({ actor, action: "SCHEDULE_CREATED", targetType: "ClassSession", targetId: session.id, description: "대체수업 추가" });

  revalidatePath(`/students/${studentId}/sessions`);
  revalidatePath("/schedule");
  return {};
}

async function createLeaveForSession(
  actor: Awaited<ReturnType<typeof requireBackofficeActor>>,
  studentId: number,
  sessionId: number,
  reason: string,
  requestedByRole: "STUDENT" | "ADMIN" | "MANAGER",
): Promise<{ error?: string }> {
  const session = await prisma.classSession.findUnique({ where: { id: sessionId }, include: { leaveRequest: true } });
  if (!session || session.studentId !== studentId) {
    return { error: "이 학생의 수업이 아닙니다." };
  }
  if (session.status !== "SCHEDULED") {
    return { error: "예정된 수업만 연기 처리할 수 있습니다." };
  }
  if (session.leaveRequest && session.leaveRequest.status !== "REJECTED") {
    return { error: "이미 처리 중이거나 적용된 연기 신청이 있는 수업입니다." };
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: session.enrollmentId } });
  if (!enrollment) {
    return { error: "연결된 수강신청 정보를 찾을 수 없습니다." };
  }

  const leaveRequest = await prisma.$transaction(async (tx) => {
    await applyClassLeave(tx, {
      classSessionId: sessionId,
      enrollmentId: enrollment.id,
      currentEndDate: enrollment.endDate,
      extendedDays: EXTENDED_DAYS,
    });
    return tx.leaveRequest.upsert({
      where: { classSessionId: sessionId },
      create: {
        siteId: DEFAULT_SITE_ID,
        classSessionId: sessionId,
        enrollmentId: enrollment.id,
        studentId,
        reason: reason || null,
        extendedDays: EXTENDED_DAYS,
        status: "APPROVED",
        requestedByRole,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
      update: {
        reason: reason || null,
        extendedDays: EXTENDED_DAYS,
        status: "APPROVED",
        requestedByRole,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
    });
  });
  await logAudit({
    actor,
    action: "LEAVE_REQUESTED",
    targetType: "LeaveRequest",
    targetId: leaveRequest.id,
    description: requestedByRole === "STUDENT" ? "관리자가 학생연기(연기 횟수 차감) 등록" : "관리자가 관리자연기(연기 횟수 미차감) 등록",
  });

  revalidatePath(`/students/${studentId}/sessions`);
  revalidatePath("/leave-requests");
  revalidatePath("/student/sessions");
  revalidatePath("/teacher/schedule");
  return {};
}

// 학생수업연기 — 학생이 직접 신청한 것과 동일하게 처리(requestedByRole: STUDENT)해
// 학생의 연기 가능 횟수에서 차감된다.
export async function applyStudentLeave(studentId: number, sessionId: number, reason: string) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");
  return createLeaveForSession(actor, studentId, sessionId, reason, "STUDENT");
}

// 관리자수업연기 — 관리자 귀책으로 처리해 학생의 연기 가능 횟수에서 차감되지 않는다.
export async function applyAdminLeave(studentId: number, sessionId: number, reason: string) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");
  return createLeaveForSession(actor, studentId, sessionId, reason, actor.role === "MANAGER" ? "MANAGER" : "ADMIN");
}

// 수업 취소 — 연기(휴강)와 달리 수강기간 연장 없이 그대로 취소 처리한다.
export async function cancelSession(studentId: number, sessionId: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.update");

  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session || session.studentId !== studentId) {
    throw new Error("이 학생의 수업이 아닙니다.");
  }
  if (session.status !== "SCHEDULED") {
    throw new Error("예정된 수업만 취소할 수 있습니다.");
  }

  await prisma.classSession.update({ where: { id: sessionId }, data: { status: "CANCELLED" } });
  await logAudit({ actor, action: "SCHEDULE_UPDATED", targetType: "ClassSession", targetId: sessionId, description: "수업 취소" });

  revalidatePath(`/students/${studentId}/sessions`);
  revalidatePath("/schedule");
  revalidatePath("/student/sessions");
  revalidatePath("/teacher/schedule");
}

// 수업 취소 되돌리기 — 휴강 되돌리기(revertLeaveRequest)와 짝을 이루는 기능. 취소는
// 연기와 달리 LeaveRequest나 수강 종료일 연장을 건드리지 않았으므로, 되돌릴 때도
// 상태만 SCHEDULED로 되돌리면 된다.
export async function revertCancelSession(studentId: number, sessionId: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.update");

  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session || session.studentId !== studentId) {
    throw new Error("이 학생의 수업이 아닙니다.");
  }
  if (session.status !== "CANCELLED") {
    throw new Error("취소된 수업만 되돌릴 수 있습니다.");
  }

  await prisma.classSession.update({ where: { id: sessionId }, data: { status: "SCHEDULED" } });
  await logAudit({ actor, action: "SCHEDULE_UPDATED", targetType: "ClassSession", targetId: sessionId, description: "수업 취소 되돌리기" });

  revalidatePath(`/students/${studentId}/sessions`);
  revalidatePath("/schedule");
  revalidatePath("/student/sessions");
  revalidatePath("/teacher/schedule");
}
