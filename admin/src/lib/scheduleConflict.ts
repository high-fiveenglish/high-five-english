import { prisma } from "./prisma";
import { formatAppDateTime } from "./appTime";
import { TEACHER_SUMMARY_SELECT } from "./teacherSelect";

// 레벨테스트에는 별도 소요시간 필드가 없어 충돌 판정용으로 고정값을 쓴다.
export const LEVEL_TEST_DURATION_MIN = 30;

export type ScheduleConflict = {
  type: "class" | "levelTest";
  label: string;
};

const fmt = formatAppDateTime;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

// 한 강사가 같은 시간대에 수업과 레벨테스트를 동시에 배정받지 않도록, 예정된(SCHEDULED)
// 또는 이미 진행된(COMPLETED) 수업과 일정이 잡힌 레벨테스트를 모두 대상으로 겹치는
// 항목이 있는지 확인한다. 취소/휴강/보충필요 상태는 그 시간이 비어있는 것으로 본다.
export async function findTeacherScheduleConflict(params: {
  teacherId: number;
  start: Date;
  durationMin: number;
  excludeClassSessionId?: number;
  excludeLevelTestId?: number;
}): Promise<ScheduleConflict | null> {
  const { teacherId, start, durationMin, excludeClassSessionId, excludeLevelTestId } = params;
  const startMs = start.getTime();
  const endMs = startMs + durationMin * 60_000;

  const [sessions, levelTests] = await Promise.all([
    prisma.classSession.findMany({
      where: {
        teacherId,
        status: { in: ["SCHEDULED", "COMPLETED"] },
        deletedAt: null,
        ...(excludeClassSessionId ? { id: { not: excludeClassSessionId } } : {}),
      },
      include: { student: true },
    }),
    prisma.levelTest.findMany({
      where: {
        teacherId,
        scheduledTestDate: { not: null },
        ...(excludeLevelTestId ? { id: { not: excludeLevelTestId } } : {}),
      },
      include: { student: true },
    }),
  ]);

  for (const s of sessions) {
    const sStart = s.scheduledAt.getTime();
    const sEnd = sStart + s.durationMin * 60_000;
    if (overlaps(startMs, endMs, sStart, sEnd)) {
      return { type: "class", label: `${fmt(s.scheduledAt)} · ${s.student.name} 학생 (수업)` };
    }
  }

  for (const lt of levelTests) {
    if (!lt.scheduledTestDate) continue;
    const ltStart = lt.scheduledTestDate.getTime();
    const ltEnd = ltStart + LEVEL_TEST_DURATION_MIN * 60_000;
    if (overlaps(startMs, endMs, ltStart, ltEnd)) {
      const name = lt.student?.name ?? lt.leadStudentEnglishName ?? "리드";
      return { type: "levelTest", label: `${fmt(lt.scheduledTestDate)} · ${name} (레벨테스트)` };
    }
  }

  return null;
}

export type OverlappingSessionPair = {
  teacherId: number;
  teacherName: string;
  a: { id: number; scheduledAt: Date; durationMin: number; studentName: string };
  b: { id: number; scheduledAt: Date; durationMin: number; studentName: string };
};

// "겹치는 수업 내역" 진단 화면용 — 생성 시점에 이미 충돌 검사를 거치므로 정상적으로는
// 비어 있어야 하지만, 상태를 수동으로 되돌리거나 과거 데이터가 섞여 들어온 경우를
// 감지하기 위해 강사별로 전체 활성 수업을 훑어 겹치는 쌍을 모두 찾아낸다.
export async function findAllOverlappingSessions(siteId: number): Promise<OverlappingSessionPair[]> {
  const sessions = await prisma.classSession.findMany({
    where: { siteId, status: { in: ["SCHEDULED", "COMPLETED"] }, deletedAt: null },
    include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
    orderBy: { scheduledAt: "asc" },
  });

  const byTeacher = new Map<number, typeof sessions>();
  for (const s of sessions) {
    const list = byTeacher.get(s.teacherId) ?? [];
    list.push(s);
    byTeacher.set(s.teacherId, list);
  }

  const pairs: OverlappingSessionPair[] = [];
  for (const list of byTeacher.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const aStart = a.scheduledAt.getTime();
        const aEnd = aStart + a.durationMin * 60_000;
        const bStart = b.scheduledAt.getTime();
        const bEnd = bStart + b.durationMin * 60_000;
        if (overlaps(aStart, aEnd, bStart, bEnd)) {
          pairs.push({
            teacherId: a.teacherId,
            teacherName: a.teacher.realName,
            a: { id: a.id, scheduledAt: a.scheduledAt, durationMin: a.durationMin, studentName: a.student.name },
            b: { id: b.id, scheduledAt: b.scheduledAt, durationMin: b.durationMin, studentName: b.student.name },
          });
        }
      }
    }
  }
  return pairs;
}
