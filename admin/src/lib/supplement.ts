// 관리자 보충수업 추가 — 정규 수업과 완전히 별개의 추가 수업이다(정규 회차 totalSessions를 소모하지도, 바꾸지도 않는다).
//   정규 20회 + 보충 1회 = 제공 가능한 수업 21회(lessonCounts.ts).
// 생성 전 검증: 강사 일정 충돌, 학생 본인 일정 충돌, 학원 휴강일, 수강 기간 밖, 같은 수업 중복. 강사/수강/학생 advisory lock 안에서
// 검사와 생성이 한 트랜잭션이라 동시에 같은 보충수업을 두 번 만들 수 없다.
import { formatAppDate } from "./appTime";
import { lockAll, type Tx } from "./advisoryLock";
import { MS_PER_DAY } from "./regularSlot";

const LEVEL_TEST_DURATION_MIN = 30;
const ALLOWED_DURATIONS = new Set([25, 50]);

export type SupplementResult = { ok: true; sessionId: number } | { ok: false; error: string };

export interface SupplementInput {
  studentId: number;
  enrollmentId: number;
  teacherId: number;
  scheduledAt: Date;
  durationMin: number;
  /** 선택: 이 보충이 관련된 정규 수업(같은 수강의 수업이어야 한다). */
  relatedSessionId?: number | null;
  siteId: number;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

export async function createSupplementSession(tx: Tx, input: SupplementInput): Promise<SupplementResult> {
  if (!ALLOWED_DURATIONS.has(input.durationMin)) return { ok: false, error: "수업 시간은 25분 또는 50분이어야 합니다." };
  if (Number.isNaN(input.scheduledAt.getTime())) return { ok: false, error: "수업 일시가 올바르지 않습니다." };

  await lockAll(tx, { teacherIds: [input.teacherId], enrollmentIds: [input.enrollmentId], studentIds: [input.studentId] });

  const enrollment = await tx.enrollment.findUnique({ where: { id: input.enrollmentId } });
  if (!enrollment || enrollment.studentId !== input.studentId) return { ok: false, error: "이 학생의 수강신청이 아닙니다." };
  const teacher = await tx.teacher.findUnique({ where: { id: input.teacherId }, select: { id: true, siteId: true } });
  if (!teacher || teacher.siteId !== input.siteId) return { ok: false, error: "선택한 강사를 찾을 수 없습니다." };

  // 수강 기간(KST 달력 날짜) — 시작일/종료일은 "그 날짜의 UTC 자정"으로 저장되어 있다.
  const dateIso = formatAppDate(input.scheduledAt);
  const startIso = enrollment.startDate.toISOString().slice(0, 10);
  const endIso = enrollment.endDate.toISOString().slice(0, 10);
  if (dateIso < startIso || dateIso > endIso) return { ok: false, error: `수강 기간(${startIso} ~ ${endIso}) 밖의 날짜에는 보충수업을 만들 수 없습니다.` };

  const student = await tx.student.findUnique({ where: { id: input.studentId }, select: { agentId: true } });
  const closure = await tx.academyClosure.findMany({
    where: { siteId: input.siteId, OR: [{ agentId: null }, ...(student?.agentId ? [{ agentId: student.agentId }] : [])] },
    select: { date: true, reason: true },
  });
  const hit = closure.find((c) => formatAppDate(c.date) === dateIso);
  if (hit) return { ok: false, error: `${dateIso}은(는) 학원 휴강일입니다(${hit.reason}).` };

  if (input.relatedSessionId != null) {
    const rel = await tx.classSession.findUnique({ where: { id: input.relatedSessionId }, select: { enrollmentId: true, deletedAt: true } });
    if (!rel || rel.deletedAt || rel.enrollmentId !== input.enrollmentId) return { ok: false, error: "관련 정규 수업이 이 수강의 수업이 아닙니다." };
  }

  const startMs = input.scheduledAt.getTime();
  const endMs = startMs + input.durationMin * 60_000;
  const rangeStart = new Date(startMs - MS_PER_DAY);
  const rangeEnd = new Date(endMs + MS_PER_DAY);
  const [dup, teacherSessions, studentSessions, levelTests] = await Promise.all([
    tx.classSession.findFirst({
      where: { enrollmentId: input.enrollmentId, isSupplement: true, scheduledAt: input.scheduledAt, deletedAt: null, status: { notIn: ["CANCELLED", "LEAVE"] } },
      select: { id: true },
    }),
    tx.classSession.findMany({
      where: { teacherId: input.teacherId, deletedAt: null, status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
      select: { scheduledAt: true, durationMin: true, student: { select: { name: true } } },
    }),
    tx.classSession.findMany({
      where: { studentId: input.studentId, deletedAt: null, status: { in: ["SCHEDULED", "COMPLETED"] }, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
      select: { scheduledAt: true, durationMin: true },
    }),
    tx.levelTest.findMany({ where: { teacherId: input.teacherId, scheduledTestDate: { gte: rangeStart, lt: rangeEnd } }, select: { scheduledTestDate: true } }),
  ]);
  if (dup) return { ok: false, error: "같은 시간에 이미 등록된 보충수업이 있습니다." };
  const tHit = teacherSessions.find((t) => overlaps(startMs, endMs, t.scheduledAt.getTime(), t.scheduledAt.getTime() + t.durationMin * 60_000));
  if (tHit) return { ok: false, error: `해당 강사는 같은 시간에 이미 다른 일정이 있습니다: ${formatAppDate(tHit.scheduledAt)} · ${tHit.student.name} 학생 (수업)` };
  const ltHit = levelTests.find((lt) => lt.scheduledTestDate && overlaps(startMs, endMs, lt.scheduledTestDate.getTime(), lt.scheduledTestDate.getTime() + LEVEL_TEST_DURATION_MIN * 60_000));
  if (ltHit) return { ok: false, error: "해당 강사는 같은 시간에 레벨테스트 일정이 있습니다." };
  const sHit = studentSessions.find((t) => overlaps(startMs, endMs, t.scheduledAt.getTime(), t.scheduledAt.getTime() + t.durationMin * 60_000));
  if (sHit) return { ok: false, error: "이 학생은 같은 시간에 이미 다른 수업이 있습니다." };

  const created = await tx.classSession.create({
    data: {
      siteId: input.siteId,
      enrollmentId: input.enrollmentId,
      studentId: input.studentId,
      teacherId: input.teacherId,
      scheduledAt: input.scheduledAt,
      durationMin: input.durationMin,
      status: "SCHEDULED",
      isSupplement: true,
      relatedSessionId: input.relatedSessionId ?? null,
    },
    select: { id: true },
  });
  return { ok: true, sessionId: created.id };
}
