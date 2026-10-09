// 수강 홀드(Enrollment Hold) — 수강 건 하나를 통째로 일시정지/재개한다.
//
// TEACHER_HOLD와는 다른 개념이다:
//  - TEACHER_HOLD: 강사가 "수업 1건"에 대해 신청하는 홀드(teacher/(dashboard)/hold → PENDING LeaveRequest) → 관리자가 승인하면
//    leave-requests/actions.approveLeaveRequest가 reschedule.ts의 정규 수업 cascade(rescheduleSession)로 처리한다.
//  - 수강 홀드(이 파일): 관리자가 수강 상태를 HOLDING으로 바꾸거나(enrollments/actions.updateEnrollmentStatus) 학생이 "홀드 해제 요청"을
//    하는 것 — 그 수강 건의 남은 예정 수업 전체가 멈췄다가 한꺼번에 재개된다.
//
// 해제할 때 멈춰 있던 정규 수업은 "쉰 일수를 채운 정수 주(週)"만큼 통째로 뒤로 밀린다(요일·시각 보존, 정규 회차 수 불변). 이 한 방향 이동은 시퀀스를
// 통째로 미루는 cascade와 같은 모양이지만, 예전 구현은 밀린 자리가 어떤 날짜인지 확인하지 않았다. 지금은 확정된 cascade 규칙을 그대로 지킨다:
//  - 밀린 날짜가 학원 휴강일 / 같은 수강의 다른 정규 수업·휴강 기록(generationKey 포함)이 찬 날짜 / 강사·학생 일정과 겹치면 그 수업은
//    reschedule.ts와 같은 "다음 유효 정규 슬롯"으로 한 번 더 밀린다(뒤따르는 수업은 그 슬롯을 피해 자기 자리를 찾으므로 시퀀스가 자연스럽게 연쇄 이동한다).
//  - 평가서/녹음이 이미 붙은 수업(드문 경우)은 옮기지 않고 제자리에서 SCHEDULED로 되돌린다 — 평가/녹음이 다른 날짜의 수업으로 따라가지 않는다.
//  - 보충수업은 정규 시퀀스가 아니므로 예전처럼 같은 일수만큼 이동하고 슬롯 탐색은 하지 않는다.
//  - generationKey는 박제된 값이라 행이 옮겨가도 바뀌지 않는다(unique 충돌 없음). 새 행은 만들지 않는다.
//  - 수강 단위 advisory lock(강사 → 수강 → 학생)과 한 트랜잭션 아래에서 처리하므로 같은 수강에 대한 연기/휴강/유급휴가/다른 해제와 직렬화된다.
import type { RoleName } from "../generated/prisma/client";
import { formatAppDate, formatAppTime } from "./appTime";
import { lockAll, type Tx } from "./advisoryLock";
import { runTx } from "./appTransaction";
import {
  addDaysIso,
  buildTimeByWeekday,
  DEFAULT_SLOT_HORIZON_DAYS,
  endDateToIso,
  findNextFreeRegularSlot,
  isoToEndDate,
  MS_PER_DAY,
  type BusyInterval,
} from "./regularSlot";
import { auditInTx, evaluationStateOf, LEVEL_TEST_DURATION_MIN, loadOccupiedDates } from "./reschedule";
import { parseScheduleDaysLabel } from "./weekdays";

// 관리자가 상태를 "홀드"로 바꾸면 그 수강 건의 예정 수업(SCHEDULED, 아직 지나지 않은
// 것만)을 전부 멈춘다 — 이미 지난 수업은 이미 진행됐거나 결석 처리된 것이라 건드리지
// 않는다. 홀드 시작 시점을 기록해둬야 나중에 며칠 쉬었는지 계산할 수 있다.
export async function applyHold(enrollmentId: number): Promise<void> {
  const now = new Date();
  await runTx(async (tx) => {
    const head = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { teacherId: true, studentId: true } });
    if (!head) return;
    await lockAll(tx, { teacherIds: head.teacherId ? [head.teacherId] : [], enrollmentIds: [enrollmentId], studentIds: [head.studentId] });
    await tx.classSession.updateMany({
      where: { enrollmentId, status: "SCHEDULED", scheduledAt: { gte: now }, deletedAt: null },
      data: { status: "HOLD" },
    });
    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { status: "HOLDING", holdStartedAt: now },
    });
  });
}

export interface ReleaseHoldResult {
  error?: string;
  /** 같은 일수만큼 그대로 밀린 정규 수업 수 */
  shifted?: number;
  /** 밀린 날짜가 휴강/충돌/점유라서 다음 유효 슬롯으로 한 번 더 밀린 정규 수업 수 */
  relocated?: number;
  /** 평가서/녹음이 붙어 있어 제자리에서 되살린 수업 수 */
  pinned?: number;
  /** 같은 일수만큼 이동한 보충수업 수 */
  supplements?: number;
}

const overlaps = (start: number, end: number, busy: readonly BusyInterval[]) => busy.some((b) => start < b.end && b.start < end);

// 홀드 해제 — 학생의 "홀드 해제 요청"(자기 자신이 바로 재개, 승인 대기 없음 —
// reschedule.ts의 학생 셀프 연기와 동일한 정책)과 관리자가 상태를 직접 되돌리는
// 경우 양쪽에서 공유한다. 멈춰뒀던 HOLD 수업들을 "쉬었던 일수를 채운 정수 주(週)"만큼
// 뒤로 밀어 원래 요일·시각 그대로 SCHEDULED로 되돌리고, 수강 종료일도 같은 만큼
// 늘린다 — 매주 반복되는 수업 패턴이 깨지지 않도록 일 단위가 아니라 항상 7의 배수로
// 민다(예: 3일만 쉬었어도 다음 수업 요일에 맞춰 최소 1주를 민다). 밀린 자리가 쓸 수 없으면 위 설명대로 다음 유효 슬롯으로 한 번 더 민다.
export async function releaseHold(enrollmentId: number, actor?: { role: RoleName; id: number; name?: string | null }): Promise<ReleaseHoldResult> {
  try {
    return await runTx((tx) => releaseHoldInTx(tx, enrollmentId, new Date(), actor), { timeout: 120_000, maxWait: 30_000 });
  } catch (e) {
    if (e instanceof HoldReleaseError) return { error: e.message };
    throw e;
  }
}

export async function releaseHoldInTx(
  tx: Tx,
  enrollmentId: number,
  now: Date,
  actor?: { role: RoleName; id: number; name?: string | null },
): Promise<ReleaseHoldResult> {
  const head = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { teacherId: true, studentId: true } });
  if (!head) return { error: "존재하지 않는 수강 건입니다." };
  const pre = await tx.classSession.findMany({ where: { enrollmentId, status: "HOLD", deletedAt: null }, select: { teacherId: true } });
  await lockAll(tx, {
    teacherIds: [...(head.teacherId ? [head.teacherId] : []), ...pre.map((s) => s.teacherId)],
    enrollmentIds: [enrollmentId],
    studentIds: [head.studentId],
  });

  // 잠근 뒤 다시 읽는다 — 그 사이 다른 처리(중복 해제 등)가 끝났을 수 있다.
  const enrollment = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) return { error: "존재하지 않는 수강 건입니다." };
  if (enrollment.status !== "HOLDING" || !enrollment.holdStartedAt) {
    return { error: "현재 홀드 상태가 아닙니다." };
  }

  const heldDays = Math.max(1, Math.ceil((now.getTime() - enrollment.holdStartedAt.getTime()) / MS_PER_DAY));
  const shiftDays = Math.ceil(heldDays / 7) * 7;

  const held = await tx.classSession.findMany({
    where: { enrollmentId, status: "HOLD", deletedAt: null },
    include: { evaluation: { select: { id: true } }, audioRecording: { select: { processingStatus: true } } },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
  });
  const heldIds = held.map((s) => s.id);
  const pinned = held.filter((s) => evaluationStateOf(s) !== "NONE");
  const pinnedIds = new Set(pinned.map((s) => s.id));
  const regular = held.filter((s) => !s.isSupplement && !pinnedIds.has(s.id));
  const supplements = held.filter((s) => s.isSupplement && !pinnedIds.has(s.id));

  // ── 슬롯 판단에 필요한 맥락: 휴강일 / 이 수강에서 이미 찬 날짜 / 강사·학생·레벨테스트 일정 ──
  const student = await tx.student.findUnique({ where: { id: enrollment.studentId }, select: { agentId: true } });
  const furthest = held.length > 0 ? Math.max(...held.map((s) => s.scheduledAt.getTime())) + (shiftDays + DEFAULT_SLOT_HORIZON_DAYS + 2) * MS_PER_DAY : now.getTime();
  const rangeStart = new Date(now.getTime() - MS_PER_DAY);
  const rangeEnd = new Date(furthest);
  const teacherIds = [...new Set(regular.map((s) => s.teacherId))];
  const [occupied, studentSessions, closures, perTeacher] = await Promise.all([
    loadOccupiedDates(tx, enrollmentId, heldIds),
    tx.classSession.findMany({
      where: { studentId: enrollment.studentId, id: { notIn: heldIds }, deletedAt: null, status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
      select: { scheduledAt: true, durationMin: true },
    }),
    tx.academyClosure.findMany({
      where: { siteId: enrollment.siteId, date: { gte: new Date(rangeStart.getTime() - MS_PER_DAY) }, OR: [{ agentId: null }, ...(student?.agentId ? [{ agentId: student.agentId }] : [])] },
      select: { date: true },
    }),
    Promise.all(
      teacherIds.map(async (teacherId) => {
        const [sessions, levelTests] = await Promise.all([
          tx.classSession.findMany({
            where: { teacherId, id: { notIn: heldIds }, deletedAt: null, status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
            select: { scheduledAt: true, durationMin: true },
          }),
          tx.levelTest.findMany({ where: { teacherId, scheduledTestDate: { gte: rangeStart, lt: rangeEnd } }, select: { scheduledTestDate: true } }),
        ]);
        const busy: BusyInterval[] = sessions.map((t) => ({ start: t.scheduledAt.getTime(), end: t.scheduledAt.getTime() + t.durationMin * 60_000 }));
        for (const lt of levelTests) if (lt.scheduledTestDate) busy.push({ start: lt.scheduledTestDate.getTime(), end: lt.scheduledTestDate.getTime() + LEVEL_TEST_DURATION_MIN * 60_000 });
        return [teacherId, busy] as const;
      }),
    ),
  ]);
  const teacherBusy = new Map<number, BusyInterval[]>(perTeacher);
  const studentBusy: BusyInterval[] = studentSessions.map((t) => ({ start: t.scheduledAt.getTime(), end: t.scheduledAt.getTime() + t.durationMin * 60_000 }));
  const closureDates = new Set(closures.map((c) => formatAppDate(c.date)));
  // 제자리에서 되살리는 수업의 날짜도 이미 찬 슬롯이다.
  for (const s of pinned) occupied.add(formatAppDate(s.scheduledAt));
  const weekdays = [...new Set(parseScheduleDaysLabel(enrollment.scheduleDays))];

  // ── 정규 수업: 시퀀스 순서대로 같은 일수만큼 밀고, 쓸 수 없는 자리는 다음 유효 슬롯으로 ──
  let shifted = 0;
  let relocated = 0;
  const finalRegularDates: string[] = [];
  for (const s of regular) {
    const desired = new Date(s.scheduledAt.getTime() + shiftDays * MS_PER_DAY);
    const desiredIso = formatAppDate(desired);
    const busy = [...(teacherBusy.get(s.teacherId) ?? []), ...studentBusy];
    const usable =
      desired.getTime() > now.getTime() && !occupied.has(desiredIso) && !closureDates.has(desiredIso) && !overlaps(desired.getTime(), desired.getTime() + s.durationMin * 60_000, busy);
    let destination = desired;
    if (usable) {
      shifted++;
    } else {
      const slot = findNextFreeRegularSlot({
        weekdays,
        timeByWeekday: buildTimeByWeekday(enrollment, formatAppTime(s.scheduledAt)),
        durationMin: s.durationMin,
        lowerBound: new Date(Math.max(desired.getTime(), now.getTime())),
        occupiedDates: occupied,
        closureDates,
        busy,
      });
      if (!slot) throw new HoldReleaseError("홀드 해제 후 수업을 배치할 수 있는 다음 정규 수업 슬롯을 찾지 못했습니다(수업 요일·시간 정보를 확인해 주세요).");
      destination = slot.scheduledAt;
      relocated++;
    }
    const destIso = formatAppDate(destination);
    occupied.add(destIso);
    finalRegularDates.push(destIso);
    const interval = { start: destination.getTime(), end: destination.getTime() + s.durationMin * 60_000 };
    teacherBusy.set(s.teacherId, [...(teacherBusy.get(s.teacherId) ?? []), interval]);
    studentBusy.push(interval);
    await tx.classSession.update({ where: { id: s.id }, data: { scheduledAt: destination, status: "SCHEDULED" } });
  }

  // 보충수업(정규 시퀀스 밖): 같은 일수만큼 이동
  for (const s of supplements) {
    await tx.classSession.update({ where: { id: s.id }, data: { scheduledAt: new Date(s.scheduledAt.getTime() + shiftDays * MS_PER_DAY), status: "SCHEDULED" } });
  }
  // 평가서/녹음이 붙은 수업: 그 수업 그대로(날짜 이동 없이) 되살린다.
  for (const s of pinned) {
    await tx.classSession.update({ where: { id: s.id }, data: { status: "SCHEDULED" } });
  }

  // 수강 종료일: 쉰 만큼(정수 주) 늘리되, 슬롯 재배치로 마지막 정규 수업이 더 뒤로 갔다면 그 날짜까지.
  const shiftedEndIso = addDaysIso(endDateToIso(enrollment.endDate), shiftDays);
  const lastRegularIso = finalRegularDates.reduce((a, b) => (b > a ? b : a), "");
  const newEndDate = isoToEndDate(lastRegularIso > shiftedEndIso ? lastRegularIso : shiftedEndIso);

  await tx.enrollment.update({
    where: { id: enrollmentId },
    data: { status: "ACTIVE", holdStartedAt: null, endDate: newEndDate },
  });

  if (actor) {
    await auditInTx(tx, {
      actor,
      action: "UPDATE",
      targetType: "Enrollment",
      targetId: enrollmentId,
      text: "수강 홀드 해제(정규 수업 재배치)",
      meta: { shiftDays, shifted, relocated, pinned: pinned.length, supplements: supplements.length, newEndDate: endDateToIso(newEndDate) },
    });
  }
  return { shifted, relocated, pinned: pinned.length, supplements: supplements.length };
}

/** 홀드 해제 중 정규 수업을 배치하지 못할 때 — 트랜잭션을 롤백시키고 사용자에게 보여줄 메시지를 전달한다. */
export class HoldReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HoldReleaseError";
  }
}
