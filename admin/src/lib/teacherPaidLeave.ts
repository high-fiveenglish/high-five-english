// 정규 강사 유급휴가(TeacherPaidLeave) 요청/승인/취소 — DB 처리. 정책 계산은 paidLeavePolicy.ts(순수 함수).
//
//  - 요청/승인 대상은 정규 강사(Teacher.employmentType = REGULAR)뿐이다.
//  - 승인하면 그 강사의 그 날(KST) 예정 수업이 자동으로 정규 시퀀스 재배치(cascade)된다 — 유급휴가는 보충수업이 아니다.
//  - 강사 단위 advisory lock 아래에서 한도를 세므로 동시 승인으로 한도를 넘길 수 없고, (teacherId, leaveDate) unique로 같은 날 중복 요청도 없다.
//  - 급여는 teacherStats가 승인된 건 1개당 레이트 × 8로 계산한다(그날 수업 수와 무관).
import type { RoleName } from "../generated/prisma/client";
import { lockAll, type Tx } from "./advisoryLock";
import { checkPaidLeaveApprovalTiming, checkPaidLeaveQuota } from "./paidLeavePolicy";
import { auditInTx, RescheduleError, rescheduleSession, revertReschedule } from "./reschedule";

export type PaidLeaveActor = { role: RoleName; id: number; name?: string | null };
export type PaidLeaveResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dateOnlyToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isoToDateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** 유급휴가 요청 생성(PENDING). 비정규 강사나 같은 강사·같은 날의 중복은 거부한다. */
export async function requestPaidLeave(
  tx: Tx,
  input: { teacherId: number; leaveDate: string; reason?: string | null; actor: PaidLeaveActor; siteId: number; now: Date },
): Promise<PaidLeaveResult<{ paidLeaveId: number }>> {
  if (!ISO_DATE.test(input.leaveDate) || Number.isNaN(isoToDateOnly(input.leaveDate).getTime())) return { ok: false, error: "휴가일 형식이 올바르지 않습니다." };
  await lockAll(tx, { teacherIds: [input.teacherId] });
  const teacher = await tx.teacher.findUnique({ where: { id: input.teacherId }, select: { id: true, employmentType: true, siteId: true } });
  if (!teacher) return { ok: false, error: "강사를 찾을 수 없습니다." };
  if (teacher.employmentType !== "REGULAR") return { ok: false, error: "유급휴가는 정규 강사만 신청할 수 있습니다." };
  const dup = await tx.teacherPaidLeave.findUnique({ where: { teacherId_leaveDate: { teacherId: teacher.id, leaveDate: isoToDateOnly(input.leaveDate) } } });
  if (dup) return { ok: false, error: `이미 이 날짜의 유급휴가 요청이 있습니다(상태: ${dup.status}).` };
  const created = await tx.teacherPaidLeave.create({
    data: {
      siteId: teacher.siteId,
      teacherId: teacher.id,
      leaveDate: isoToDateOnly(input.leaveDate),
      reason: input.reason?.trim() || null,
      requestedAt: input.now,
      requestedById: input.actor.id,
    },
  });
  await auditInTx(tx, {
    actor: input.actor,
    action: "LEAVE_REQUESTED",
    targetType: "TeacherPaidLeave",
    targetId: created.id,
    text: "유급휴가 요청",
    meta: { teacherId: teacher.id, leaveDate: input.leaveDate, reason: input.reason?.trim() || null },
  });
  return { ok: true, paidLeaveId: created.id };
}

/**
 * 유급휴가 승인(PENDING 또는 거부됐던 건). 휴가일 이전 승인이 원칙이고, 휴가일이 지난 뒤의 승인/수정은 관리자(ADMIN)만 가능하며
 * 사후 승인으로 기록한다. 승인과 함께 그 강사의 그 날 예정 수업이 정규 시퀀스 재배치된다(한 트랜잭션).
 */
export async function approvePaidLeave(
  tx: Tx,
  input: { paidLeaveId: number; actor: PaidLeaveActor; now: Date },
): Promise<PaidLeaveResult<{ postApproval: boolean; movedSessions: number; supplementSessions: number }>> {
  const head = await tx.teacherPaidLeave.findUnique({ where: { id: input.paidLeaveId }, select: { teacherId: true, leaveDate: true } });
  if (!head) return { ok: false, error: "유급휴가 요청을 찾을 수 없습니다." };
  const leaveIso = dateOnlyToIso(head.leaveDate);
  // 휴가일(KST 달력 날짜)의 하루 구간
  const dayStartExact = new Date(`${leaveIso}T00:00:00+09:00`);
  const dayEnd = new Date(dayStartExact.getTime() + 24 * 60 * 60 * 1000);

  // 그날 수업이 걸린 수강/학생까지 한꺼번에 전역 순서(강사→수강→학생)로 잠근다.
  const sessions = await tx.classSession.findMany({
    where: { teacherId: head.teacherId, deletedAt: null, status: "SCHEDULED", scheduledAt: { gte: dayStartExact, lt: dayEnd } },
    select: { id: true, enrollmentId: true, studentId: true, isSupplement: true, scheduledAt: true },
    orderBy: { scheduledAt: "asc" },
  });
  await lockAll(tx, { teacherIds: [head.teacherId], enrollmentIds: sessions.map((s) => s.enrollmentId), studentIds: sessions.map((s) => s.studentId) });

  const pl = await tx.teacherPaidLeave.findUnique({ where: { id: input.paidLeaveId }, include: { teacher: { select: { employmentType: true } } } });
  if (!pl) return { ok: false, error: "유급휴가 요청을 찾을 수 없습니다." };
  if (pl.status === "APPROVED") return { ok: false, error: "이미 승인된 유급휴가입니다." };
  if (pl.teacher.employmentType !== "REGULAR") return { ok: false, error: "유급휴가는 정규 강사만 승인할 수 있습니다." };

  const timing = checkPaidLeaveApprovalTiming({ leaveDate: leaveIso, now: input.now, actorRole: input.actor.role });
  if (!timing.ok) return { ok: false, error: "휴가일이 지난 유급휴가의 승인/수정은 관리자만 할 수 있습니다." };

  const year = Number(leaveIso.slice(0, 4));
  const approved = await tx.teacherPaidLeave.findMany({
    where: { teacherId: pl.teacherId, status: "APPROVED", id: { not: pl.id }, leaveDate: { gte: isoToDateOnly(`${year}-01-01`), lt: isoToDateOnly(`${year + 1}-01-01`) } },
    select: { leaveDate: true },
  });
  const quota = checkPaidLeaveQuota(leaveIso, approved.map((a) => dateOnlyToIso(a.leaveDate)));
  if (!quota.ok) {
    return {
      ok: false,
      error:
        quota.error === "HALF_YEAR_QUOTA_EXCEEDED"
          ? `이 반기(${leaveIso.slice(5, 7) <= "06" ? "1~6월" : "7~12월"})의 유급휴가 한도(5회)를 모두 사용했습니다.`
          : "연간 유급휴가 한도(10회)를 모두 사용했습니다.",
    };
  }

  const claimed = await tx.teacherPaidLeave.updateMany({
    where: { id: pl.id, status: { in: ["PENDING", "REJECTED"] } },
    data: { status: "APPROVED", approvedById: input.actor.id, approvedAt: input.now, postApproval: timing.postApproval },
  });
  if (claimed.count !== 1) return { ok: false, error: "다른 처리가 먼저 이 유급휴가를 변경했습니다. 새로고침 후 다시 확인해 주세요." };

  let moved = 0;
  let supplements = 0;
  try {
    for (const s of sessions) {
      await rescheduleSession(tx, { sessionId: s.id, source: "PAID_LEAVE", actor: input.actor, now: input.now, reason: pl.reason, paidLeaveId: pl.id });
      if (s.isSupplement) supplements++;
      else moved++;
    }
  } catch (e) {
    if (e instanceof RescheduleError) throw new PaidLeaveSessionError(e.message);
    throw e;
  }

  await auditInTx(tx, {
    actor: input.actor,
    action: "LEAVE_APPROVED",
    targetType: "TeacherPaidLeave",
    targetId: pl.id,
    text: timing.postApproval ? "유급휴가 사후 승인(관리자)" : "유급휴가 승인",
    meta: {
      teacherId: pl.teacherId,
      leaveDate: leaveIso,
      previousStatus: pl.status,
      newStatus: "APPROVED",
      postApproval: timing.postApproval,
      movedRegularSessions: moved,
      supplementSessions: supplements,
      reason: pl.reason,
    },
  });
  return { ok: true, postApproval: timing.postApproval, movedSessions: moved, supplementSessions: supplements };
}

/** 트랜잭션을 롤백시키면서 사용자에게 보여줄 메시지를 전달하는 오류. */
export class PaidLeaveSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaidLeaveSessionError";
  }
}

/** 승인된 유급휴가를 거부 상태로 되돌린다(관리자). 그 건으로 재배치됐던 수업은 전부 원래대로 되돌린다 — 되돌릴 수 없는 후속 변경이 있으면 거부한다. */
export async function revokePaidLeave(
  tx: Tx,
  input: { paidLeaveId: number; actor: PaidLeaveActor; now: Date; reason?: string | null },
): Promise<PaidLeaveResult<{ revertedSessions: number }>> {
  const pl = await tx.teacherPaidLeave.findUnique({ where: { id: input.paidLeaveId }, include: { leaveRequests: { select: { id: true } } } });
  if (!pl) return { ok: false, error: "유급휴가 요청을 찾을 수 없습니다." };
  if (pl.status !== "APPROVED") return { ok: false, error: "승인된 유급휴가만 취소할 수 있습니다." };
  await lockAll(tx, { teacherIds: [pl.teacherId] });
  let reverted = 0;
  try {
    for (const lr of pl.leaveRequests) {
      await revertReschedule(tx, lr.id);
      reverted++;
    }
  } catch (e) {
    if (e instanceof RescheduleError) throw new PaidLeaveSessionError(e.message);
    throw e;
  }
  await tx.teacherPaidLeave.update({ where: { id: pl.id }, data: { status: "REJECTED", approvedById: input.actor.id, approvedAt: input.now } });
  await auditInTx(tx, {
    actor: input.actor,
    action: "LEAVE_REJECTED",
    targetType: "TeacherPaidLeave",
    targetId: pl.id,
    text: "유급휴가 승인 취소",
    meta: { teacherId: pl.teacherId, leaveDate: dateOnlyToIso(pl.leaveDate), previousStatus: "APPROVED", newStatus: "REJECTED", revertedSessions: reverted, reason: input.reason?.trim() || null },
  });
  return { ok: true, revertedSessions: reverted };
}

/** 대기 중인 요청을 거부한다. */
export async function rejectPaidLeave(tx: Tx, input: { paidLeaveId: number; actor: PaidLeaveActor; now: Date }): Promise<PaidLeaveResult> {
  const res = await tx.teacherPaidLeave.updateMany({
    where: { id: input.paidLeaveId, status: "PENDING" },
    data: { status: "REJECTED", approvedById: input.actor.id, approvedAt: input.now },
  });
  if (res.count !== 1) return { ok: false, error: "대기 중인 요청만 거부할 수 있습니다." };
  await auditInTx(tx, { actor: input.actor, action: "LEAVE_REJECTED", targetType: "TeacherPaidLeave", targetId: input.paidLeaveId, text: "유급휴가 거부", meta: { previousStatus: "PENDING", newStatus: "REJECTED" } });
  return { ok: true };
}
