"use server";

import { revalidatePath } from "next/cache";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { runTx } from "@/lib/appTransaction";
import { approvePaidLeave, PaidLeaveSessionError, rejectPaidLeave, requestPaidLeave, revokePaidLeave } from "@/lib/teacherPaidLeave";
import { syncTeacherScheduleToGoogleSheet } from "@/lib/teacherScheduleSheet";

// 정규 강사 유급휴가 관리 — 본사(ADMIN/MANAGER)만. 협력사(AGENT)는 강사 급여/일정과 무관하므로 접근할 수 없다.
// 정책(정규 강사만, 상반기/하반기 5회 + 연 10회, 사전 승인 원칙·관리자 사후 승인, 급여 = 레이트×8)은 lib/paidLeavePolicy.ts·teacherPaidLeave.ts.
async function actorForPaidLeave() {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");
  if (actor.role === "AGENT") throw new Error("협력사 계정은 강사 유급휴가를 관리할 수 없습니다.");
  return actor;
}

function refresh() {
  revalidatePath("/teacher-paid-leaves");
  revalidatePath("/schedule");
  revalidatePath("/teacher/schedule");
  revalidatePath("/student/sessions");
  revalidatePath("/leave-requests");
}

export async function createPaidLeave(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const actor = await actorForPaidLeave();
  const teacherId = Number(formData.get("teacherId"));
  const leaveDate = String(formData.get("leaveDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!teacherId || !leaveDate) return { error: "강사와 휴가일을 선택해 주세요." };
  const res = await runTx((tx) =>
    requestPaidLeave(tx, { teacherId, leaveDate, reason, actor: { role: actor.role, id: actor.id, name: actor.name }, siteId: DEFAULT_SITE_ID, now: new Date() }),
  );
  if (!res.ok) return { error: res.error };
  refresh();
  return { success: "유급휴가 요청을 등록했습니다. 승인하면 그 날 수업이 정규 수업 시퀀스에서 뒤로 밀립니다." };
}

export async function approvePaidLeaveAction(id: number): Promise<{ error?: string; success?: string }> {
  const actor = await actorForPaidLeave();
  try {
    const res = await runTx((tx) => approvePaidLeave(tx, { paidLeaveId: id, actor: { role: actor.role, id: actor.id, name: actor.name }, now: new Date() }), {
      timeout: 120_000,
      maxWait: 30_000,
    });
    if (!res.ok) return { error: res.error };
    refresh();
    syncTeacherScheduleToGoogleSheet().catch(() => {});
    return { success: `${res.postApproval ? "사후 승인했습니다. " : "승인했습니다. "}정규 수업 ${res.movedSessions}건을 재배치했습니다.` };
  } catch (e) {
    if (e instanceof PaidLeaveSessionError) return { error: e.message };
    throw e;
  }
}

export async function rejectPaidLeaveAction(id: number): Promise<{ error?: string }> {
  const actor = await actorForPaidLeave();
  const res = await runTx((tx) => rejectPaidLeave(tx, { paidLeaveId: id, actor: { role: actor.role, id: actor.id, name: actor.name }, now: new Date() }));
  if (!res.ok) return { error: res.error };
  refresh();
  return {};
}

export async function revokePaidLeaveAction(id: number): Promise<{ error?: string }> {
  const actor = await actorForPaidLeave();
  try {
    const res = await runTx((tx) => revokePaidLeave(tx, { paidLeaveId: id, actor: { role: actor.role, id: actor.id, name: actor.name }, now: new Date() }), {
      timeout: 120_000,
      maxWait: 30_000,
    });
    if (!res.ok) return { error: res.error };
    refresh();
    syncTeacherScheduleToGoogleSheet().catch(() => {});
    return {};
  } catch (e) {
    if (e instanceof PaidLeaveSessionError) return { error: e.message };
    throw e;
  }
}
