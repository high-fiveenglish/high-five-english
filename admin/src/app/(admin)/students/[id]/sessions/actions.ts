"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { runTx } from "@/lib/appTransaction";
import { createSupplementSession } from "@/lib/supplement";
import { adjustLeaveQuota, rescheduleErrorMessage, rescheduleSession, resetSessionEvaluation } from "@/lib/reschedule";
import { syncTeacherScheduleToGoogleSheet } from "@/lib/teacherScheduleSheet";
import { findTeacherScheduleConflict } from "@/lib/scheduleConflict";
import { parseAppDateTime } from "@/lib/appTime";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { isWithinAvailableHours, timeStringToMinuteOfDay } from "@/lib/timeSlots";
import { requireInScope } from "@/lib/agentScope";

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
  // 보충수업 폼(schedules.create)이 쓰는 조회 — 권한 없이 로그인만으로 모든 강사의 근무 가능 시간·일정 충돌 여부를 알 수 없게 한다.
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.create");
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
  await requireInScope(prisma, actor, "student", studentId);

  const enrollmentId = Number(formData.get("enrollmentId"));
  const teacherId = Number(formData.get("teacherId"));
  const scheduledAt = String(formData.get("scheduledAt") ?? "");
  const durationMin = Number(formData.get("durationMin") ?? 25);
  const relatedRaw = String(formData.get("relatedSessionId") ?? "").trim();
  const relatedSessionId = relatedRaw ? Number(relatedRaw) : null;

  if (!enrollmentId || !scheduledAt || !teacherId) {
    return { error: "수강신청·수업 일시·담당 강사는 필수입니다." };
  }
  if (relatedSessionId !== null && !Number.isInteger(relatedSessionId)) return { error: "관련 정규 수업 값이 올바르지 않습니다." };
  const scopeError = await assertStudentInScope(actor, studentId);
  if (scopeError) return { error: scopeError };

  // 강사·학생 일정 충돌, 학원 휴강일, 수강 기간, 중복 검사와 생성이 한 트랜잭션(강사·수강·학생 advisory lock)이다.
  const result = await runTx((tx) =>
    createSupplementSession(tx, {
      studentId,
      enrollmentId,
      teacherId,
      scheduledAt: parseAppDateTime(scheduledAt),
      durationMin,
      relatedSessionId,
      siteId: DEFAULT_SITE_ID,
    }),
  );
  if (!result.ok) return { error: result.error };
  await logAudit({ actor, action: "SCHEDULE_CREATED", targetType: "ClassSession", targetId: result.sessionId, description: "보충수업 추가" });

  revalidatePath(`/students/${studentId}/sessions`);
  revalidatePath("/schedule");
  revalidatePath("/student/sessions");
  revalidatePath("/teacher/schedule");
  return {};
}

// AGENT는 자기 협력사 학생만 다룰 수 있다.
async function assertStudentInScope(actor: Awaited<ReturnType<typeof requireBackofficeActor>>, studentId: number): Promise<string | null> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { agentId: true, deletedAt: true } });
  if (!student || student.deletedAt) return "학생을 찾을 수 없습니다.";
  if (actor.role === "AGENT" && student.agentId !== actor.agentId) return "다른 협력사 학생입니다.";
  return null;
}

// 관리자가 실행하는 두 가지 연기 — 같은 재배치 로직(reschedule.ts)을 쓰고 사유(source)만 다르다.
//  - 학생연기: 학생 대신 관리자가 누르는 "학생 연기". 사유는 STUDENT_POSTPONEMENT(학생 연기 횟수 차감, 부족하면 거부), 실행자만 관리자다. 2시간 제한은 없다.
//  - 관리자연기: 사유 ADMIN_POSTPONEMENT. 횟수 차감 없음, 시간 제한 없음, 평가서가 없는 모든 수업(과거·오늘·미래, 완료/결석 포함)이 대상이다.
const STUDENT_LEAVE_STATUSES = ["SCHEDULED"] as const;
const ADMIN_LEAVE_STATUSES = ["SCHEDULED", "COMPLETED", "MAKEUP_NEEDED"] as const;

async function createLeaveForSession(
  actor: Awaited<ReturnType<typeof requireBackofficeActor>>,
  studentId: number,
  sessionId: number,
  reason: string,
  source: "STUDENT_POSTPONEMENT" | "ADMIN_POSTPONEMENT",
): Promise<{ error?: string }> {
  const scopeError = await assertStudentInScope(actor, studentId);
  if (scopeError) return { error: scopeError };
  const owner = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { studentId: true } });
  if (!owner || owner.studentId !== studentId) return { error: "이 학생의 수업이 아닙니다." };

  let leaveRequestId: number;
  try {
    const r = await runTx((tx) =>
      rescheduleSession(tx, {
        sessionId,
        source,
        actor: { role: actor.role, id: actor.id },
        now: new Date(),
        reason: reason.trim() || null,
        allowedStatuses: source === "STUDENT_POSTPONEMENT" ? STUDENT_LEAVE_STATUSES : ADMIN_LEAVE_STATUSES,
      }),
    );
    leaveRequestId = r.leaveRequestId;
  } catch (e) {
    const msg = rescheduleErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  await logAudit({
    actor,
    action: "LEAVE_REQUESTED",
    targetType: "LeaveRequest",
    targetId: leaveRequestId,
    description:
      source === "STUDENT_POSTPONEMENT"
        ? "관리자가 학생 대신 학생연기 등록 (source=STUDENT_POSTPONEMENT, actor=관리자, 학생 연기 횟수 -1)"
        : "관리자연기 등록 (source=ADMIN_POSTPONEMENT, 학생 연기 횟수 영향 없음)",
  });

  revalidatePath(`/students/${studentId}/sessions`);
  revalidatePath("/leave-requests");
  revalidatePath("/schedule");
  revalidatePath("/student/sessions");
  revalidatePath("/teacher/schedule");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
  return {};
}

// 학생수업연기 — 학생이 직접 신청한 것과 같은 사유(STUDENT_POSTPONEMENT)로 처리해 학생의 연기 가능 횟수에서 차감한다.
// 실행자가 관리자일 뿐이라 2시간 제한은 적용하지 않는다.
export async function applyStudentLeave(studentId: number, sessionId: number, reason: string) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");
  await requireInScope(prisma, actor, "student", studentId);
  return createLeaveForSession(actor, studentId, sessionId, reason, "STUDENT_POSTPONEMENT");
}

// 관리자수업연기 — 학생의 연기 가능 횟수에서 차감하지 않는다.
export async function applyAdminLeave(studentId: number, sessionId: number, reason: string) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");
  await requireInScope(prisma, actor, "student", studentId);
  return createLeaveForSession(actor, studentId, sessionId, reason, "ADMIN_POSTPONEMENT");
}

// 평가 초기화 — 평가서가 이미 있는 수업을 관리자연기하기 전에 거치는 단계. 녹음 원본은 삭제하지 않는다.
export async function resetEvaluation(studentId: number, sessionId: number, reason: string): Promise<{ error?: string }> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.update");
  const scopeError = await assertStudentInScope(actor, studentId);
  if (scopeError) return { error: scopeError };
  const owner = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { studentId: true } });
  if (!owner || owner.studentId !== studentId) return { error: "이 학생의 수업이 아닙니다." };
  const result = await runTx((tx) => resetSessionEvaluation(tx, { sessionId, actor: { role: actor.role, id: actor.id, name: actor.name }, reason }));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/students/${studentId}/sessions`);
  revalidatePath("/teacher/schedule");
  revalidatePath("/student/sessions");
  return {};
}

// 학생 연기 횟수 수정 — 기본 정책값에 대한 관리자 가감. 이미 쓴 횟수보다 작게는 못 낮춘다. 변경 이력은 감사 로그에 남는다.
export async function adjustStudentLeaveQuota(studentId: number, enrollmentId: number, newAdjustment: number, reason: string): Promise<{ error?: string }> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.update");
  const scopeError = await assertStudentInScope(actor, studentId);
  if (scopeError) return { error: scopeError };
  const e = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, select: { studentId: true } });
  if (!e || e.studentId !== studentId) return { error: "이 학생의 수강신청이 아닙니다." };
  const result = await runTx((tx) => adjustLeaveQuota(tx, { enrollmentId, newAdjustment, reason, actor: { role: actor.role, id: actor.id, name: actor.name } }));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/students/${studentId}/sessions`);
  revalidatePath("/enrollments");
  revalidatePath("/student/sessions");
  return {};
}

// 수업 취소 — 연기(휴강)와 달리 수강기간 연장 없이 그대로 취소 처리한다.
export async function cancelSession(studentId: number, sessionId: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "schedules.update");
  await requireInScope(prisma, actor, "student", studentId);

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
  await requireInScope(prisma, actor, "student", studentId);

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
