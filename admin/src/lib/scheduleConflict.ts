import { prisma } from "./prisma";

// 레벨테스트에는 별도 소요시간 필드가 없어 충돌 판정용으로 고정값을 쓴다.
export const LEVEL_TEST_DURATION_MIN = 30;

export type ScheduleConflict = {
  type: "class" | "levelTest";
  label: string;
};

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

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
