"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { runTx } from "@/lib/appTransaction";
import { rescheduleErrorMessage, rescheduleSession, revertReschedule } from "@/lib/reschedule";
import { ClosureError, registerAcademyClosure, revertAcademyClosure as revertClosureFlow } from "@/lib/academyClosureFlow";
import { syncTeacherScheduleToGoogleSheet } from "@/lib/teacherScheduleSheet";

// 연기/휴강/강사 홀드는 전부 lib/reschedule.ts의 같은 "정규 수업 재배치"를 쓴다 — 사유(source)와 권한/승인만 다르다.
// 관리자가 이 화면에서 만드는 연기는 관리자연기(ADMIN_POSTPONEMENT)다: 학생 연기 횟수를 차감하지 않는다.
const ADMIN_LEAVE_STATUSES = ["SCHEDULED", "COMPLETED", "MAKEUP_NEEDED"] as const;

function revalidateScheduleViews(studentIds: Iterable<number> = []) {
  revalidatePath("/leave-requests");
  revalidatePath("/schedule");
  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher/hold");
  revalidatePath("/student/sessions");
  for (const studentId of new Set(studentIds)) revalidatePath(`/students/${studentId}/sessions`);
}

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

  const session = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { studentId: true } });
  if (!session) {
    return { error: "존재하지 않는 수업입니다." };
  }

  let leaveRequestId: number;
  try {
    const r = await runTx((tx) =>
      rescheduleSession(tx, {
        sessionId,
        source: "ADMIN_POSTPONEMENT",
        actor: { role: actor.role, id: actor.id },
        now: new Date(),
        reason: reason || null,
        allowedStatuses: ADMIN_LEAVE_STATUSES,
      }),
    );
    leaveRequestId = r.leaveRequestId;
  } catch (e) {
    const msg = rescheduleErrorMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  await logAudit({ actor, action: "LEAVE_REQUESTED", targetType: "LeaveRequest", targetId: leaveRequestId, description: "관리자가 연기 생성·적용 (source=ADMIN_POSTPONEMENT)" });

  revalidateScheduleViews([session.studentId]);
  syncTeacherScheduleToGoogleSheet().catch(() => {});
  redirect("/leave-requests");
}

// 강사 Hold 승인 — 강사 신청은 PENDING으로만 쌓이고, 승인하는 순간 같은 정규 수업 재배치를 실행한다(학생 연기 횟수·유급휴가 한도 모두 차감 없음).
export async function approveLeaveRequest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");

  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leaveRequest) throw new Error("존재하지 않는 요청입니다.");
  if (leaveRequest.status !== "PENDING") throw new Error("대기 중인 요청만 승인할 수 있습니다.");

  try {
    await runTx((tx) =>
      rescheduleSession(tx, {
        sessionId: leaveRequest.classSessionId,
        source: "TEACHER_HOLD",
        actor: { role: actor.role, id: actor.id },
        now: new Date(),
        reason: leaveRequest.reason,
        existingLeaveRequestId: leaveRequest.id,
      }),
    );
  } catch (e) {
    const msg = rescheduleErrorMessage(e);
    if (msg) throw new Error(msg);
    throw e;
  }
  await logAudit({ actor, action: "LEAVE_APPROVED", targetType: "LeaveRequest", targetId: id, description: "강사 Hold 승인 (source=TEACHER_HOLD)" });

  revalidateScheduleViews([leaveRequest.studentId]);
  syncTeacherScheduleToGoogleSheet().catch(() => {});
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

  // 새 방식 건은 재배치로 만들어진 정규 수업을 지우고 수강 종료일을 되돌린다. 옛 방식 건은 기존처럼 수업 상태/종료일(-extendedDays)만 되돌린다.
  // LeaveRequest 행이 사라지므로 학생 연기 횟수(행에서 계산)는 자동으로 복구된다 — 별도 카운터가 없어 이중 복구가 없다.
  try {
    await runTx((tx) => revertReschedule(tx, id));
  } catch (e) {
    const msg = rescheduleErrorMessage(e);
    if (msg) throw new Error(msg);
    throw e;
  }
  await logAudit({ actor, action: "DELETE", targetType: "LeaveRequest", targetId: id, description: "연기 되돌리기" });

  revalidateScheduleViews([leaveRequest.studentId]);
  syncTeacherScheduleToGoogleSheet().catch(() => {});
}

// 전체수업휴강(어학원 휴강) — 고른 날짜의 예정 수업을 정규 수업 재배치(cascade)로 한 번에 처리한다. 이미 학생이 연기한 그 날 수업은 다시 재배치하지 않고
// 학원 휴강으로 대체(학생 연기 횟수 복구)한다. 한 트랜잭션이라 중간에 실패하면 전부 되돌아간다. 상세는 lib/academyClosureFlow.ts.
export async function createAcademyClosure(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "academy_closures.create");

  const dateStr = String(formData.get("date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!dateStr || !reason) {
    return { error: "날짜와 사유를 모두 입력해주세요." };
  }

  // AGENT가 등록하면 자기 협력사 소속 학생 수업만 휴강 처리된다 — 본사/다른 협력사 수업은 절대 건드리지 않는다.
  const scopeAgentId = actor.role === "AGENT" ? actor.agentId : undefined;

  let result: Awaited<ReturnType<typeof registerAcademyClosure>>;
  try {
    result = await runTx(
      (tx) =>
        registerAcademyClosure(tx, {
          siteId: DEFAULT_SITE_ID,
          dateStr,
          reason,
          actor: { role: actor.role, id: actor.id, name: actor.name },
          agentScopeId: scopeAgentId ?? null,
          now: new Date(),
        }),
      { timeout: 120_000, maxWait: 30_000 },
    );
  } catch (e) {
    if (e instanceof ClosureError) return { error: e.message };
    throw e;
  }

  revalidateScheduleViews(result.affectedStudentIds);
  syncTeacherScheduleToGoogleSheet().catch(() => {});

  const total = result.rescheduled + result.supplementSessions;
  return {
    success:
      total > 0 || result.superseded > 0
        ? `${dateStr} 예정 수업 ${total}건을 휴강 처리했습니다.` +
          (result.superseded > 0 ? ` (이미 학생이 연기한 ${result.superseded}건은 학원 휴강으로 대체되어 학생 연기 횟수가 복구되었습니다.)` : "")
        : `${dateStr}에는 예정된 수업이 없어 휴강 기록만 등록했습니다.`,
  };
}

// 전체수업휴강 되돌리기 — 그 날 휴강으로 재배치됐던 수업/수강 종료일을 전부 원래대로 되돌리고, 대체됐던 학생 연기는 원래대로 복원하고(횟수 -1),
// 관련 LeaveRequest와 AcademyClosure 레코드를 삭제한다.
export async function revertAcademyClosure(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "academy_closures.revert");

  let result: Awaited<ReturnType<typeof revertClosureFlow>>;
  try {
    result = await runTx(
      (tx) =>
        revertClosureFlow(tx, {
          closureId: id,
          actor: { role: actor.role, id: actor.id, name: actor.name },
          agentScopeId: actor.role === "AGENT" ? actor.agentId : null,
        }),
      { timeout: 120_000, maxWait: 30_000 },
    );
  } catch (e) {
    if (e instanceof ClosureError) throw new Error(e.message);
    throw e;
  }
  if (!result) return;

  revalidateScheduleViews(result.studentIds);
  syncTeacherScheduleToGoogleSheet().catch(() => {});
}
