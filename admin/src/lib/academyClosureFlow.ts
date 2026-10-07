// 학원 휴강(AcademyClosure) 등록/되돌리기 — 정규 수업 재배치(reschedule.ts)와 학생 연기 대체(supersede)를 한 트랜잭션으로 묶는다.
//
//  - 등록: 그 날(KST) 예정 수업을 전부 정규 시퀀스 재배치(source=ACADEMY_CLOSURE)한다. 휴강 행을 먼저 만들어 두므로 새 슬롯 탐색이 이 날짜를 건너뛴다.
//  - 이미 학생이 연기해 둔 그 날 수업은 다시 재배치하지 않는다(두 번 cascade/종료일 두 번 연장 없음): 그 연기를 "학원 휴강으로 대체"해
//    학생 연기 횟수만 복구한다(이력은 남는다).
//  - 휴강이 먼저 등록된 날에는 수업이 이미 LEAVE라서 학생이 그 수업을 연기할 수 없고, 따라서 횟수도 차감되지 않는다.
//  - 같은 날짜·같은 범위(본사/협력사)의 휴강은 중복 등록할 수 없다.
import type { RoleName } from "../generated/prisma/client";
import { parseAppDateTime } from "./appTime";
import { lockAll, lockClosureDay, type Tx } from "./advisoryLock";
import { auditInTx, RescheduleError, rescheduleSession, restoreSupersededStudentPostponements, revertReschedule, supersedeStudentPostponements } from "./reschedule";

export type ClosureActor = { role: RoleName; id: number; name?: string | null };

export class ClosureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosureError";
  }
}

export interface RegisterClosureInput {
  siteId: number;
  /** "YYYY-MM-DD" (KST 달력 날짜) */
  dateStr: string;
  reason: string;
  actor: ClosureActor;
  /** 협력사(AGENT)가 등록하면 그 협력사 소속 학생 수업에만 적용된다. 본사 등록은 null/undefined. */
  agentScopeId?: number | null;
  now: Date;
}

export interface RegisterClosureResult {
  closureId: number;
  rescheduled: number;
  supplementSessions: number;
  superseded: number;
  affectedStudentIds: number[];
}

export async function registerAcademyClosure(tx: Tx, input: RegisterClosureInput): Promise<RegisterClosureResult> {
  const dayStart = parseAppDateTime(`${input.dateStr}T00:00`);
  if (Number.isNaN(dayStart.getTime())) throw new ClosureError("날짜 형식이 올바르지 않습니다.");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const agentId = input.agentScopeId ?? null;

  await lockClosureDay(tx, dayStart);
  const dup = await tx.academyClosure.findFirst({ where: { siteId: input.siteId, date: dayStart, agentId }, select: { id: true } });
  if (dup) throw new ClosureError(`${input.dateStr}에는 이미 같은 범위의 학원 휴강이 등록되어 있습니다.`);

  const where = {
    siteId: input.siteId,
    status: "SCHEDULED" as const,
    deletedAt: null,
    scheduledAt: { gte: dayStart, lt: dayEnd },
    ...(agentId ? { student: { agentId } } : {}),
  };
  // 읽기 → 잠금 → 다시 읽기: 잠그기 전에 읽은 목록은 그 사이 학생이 연기한 수업을 포함할 수 있다.
  const pre = await tx.classSession.findMany({ where, select: { teacherId: true, enrollmentId: true, studentId: true } });
  await lockAll(tx, { teacherIds: pre.map((s) => s.teacherId), enrollmentIds: pre.map((s) => s.enrollmentId), studentIds: pre.map((s) => s.studentId) });
  const sessions = await tx.classSession.findMany({ where, select: { id: true, studentId: true, isSupplement: true }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }] });

  const closure = await tx.academyClosure.create({ data: { siteId: input.siteId, date: dayStart, reason: input.reason, createdById: input.actor.id, agentId } });
  const superseded = await supersedeStudentPostponements(tx, { closureId: closure.id, dayStart, dayEnd, agentScopeId: agentId, now: input.now });

  let rescheduled = 0;
  let supplementSessions = 0;
  try {
    for (const s of sessions) {
      await rescheduleSession(tx, { sessionId: s.id, source: "ACADEMY_CLOSURE", actor: input.actor, now: input.now, reason: input.reason, closureId: closure.id });
      if (s.isSupplement) supplementSessions++;
      else rescheduled++;
    }
  } catch (e) {
    if (e instanceof RescheduleError) throw new ClosureError(e.message);
    throw e;
  }

  await auditInTx(tx, {
    actor: input.actor,
    action: "CREATE",
    targetType: "AcademyClosure",
    targetId: closure.id,
    text: `전체수업휴강 등록: ${input.dateStr}, 정규 ${rescheduled}건 재배치, 보충 ${supplementSessions}건, 학생 연기 대체 ${superseded}건 (${input.reason})`,
    meta: { date: input.dateStr, agentId, rescheduled, supplementSessions, superseded },
  });
  return { closureId: closure.id, rescheduled, supplementSessions, superseded, affectedStudentIds: [...new Set(sessions.map((s) => s.studentId))] };
}

export interface RevertClosureResult {
  reverted: number;
  restoredStudentPostponements: number;
  studentIds: number[];
}

/** 휴강 되돌리기 — 이 휴강으로 재배치된 수업을 전부 원래대로 돌리고, 대체됐던 학생 연기를 복원하고, 휴강 행을 지운다(후속 변경이 있으면 전체 롤백). */
export async function revertAcademyClosure(tx: Tx, input: { closureId: number; actor: ClosureActor; agentScopeId?: number | null }): Promise<RevertClosureResult | null> {
  const closure = await tx.academyClosure.findUnique({ where: { id: input.closureId }, include: { leaveRequests: { include: { classSession: { select: { teacherId: true } } } } } });
  if (!closure) return null;
  if (input.agentScopeId && closure.agentId !== input.agentScopeId) return null;
  await lockClosureDay(tx, closure.date);
  await lockAll(tx, { teacherIds: closure.leaveRequests.map((l) => l.classSession.teacherId), enrollmentIds: closure.leaveRequests.map((l) => l.enrollmentId) });

  const studentIds = new Set<number>();
  try {
    for (const lr of closure.leaveRequests) {
      const r = await revertReschedule(tx, lr.id);
      studentIds.add(r.studentId);
    }
  } catch (e) {
    if (e instanceof RescheduleError) throw new ClosureError(e.message);
    throw e;
  }
  const restored = await restoreSupersededStudentPostponements(tx, closure.id);
  await tx.academyClosure.delete({ where: { id: closure.id } });
  await auditInTx(tx, {
    actor: input.actor,
    action: "DELETE",
    targetType: "AcademyClosure",
    targetId: closure.id,
    text: `전체수업휴강 되돌리기 (${closure.leaveRequests.length}건)`,
    meta: { reverted: closure.leaveRequests.length, restoredStudentPostponements: restored },
  });
  return { reverted: closure.leaveRequests.length, restoredStudentPostponements: restored, studentIds: [...studentIds] };
}
