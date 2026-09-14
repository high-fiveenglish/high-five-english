"use server";

// 레벨테스트 등록/확정 폼(학생 페이지의 신규 등록 students/[id]/level-test, 레벨테스트관리
// 목록의 신규등록/확정 화면 level-tests) 3곳에서 공용으로 쓰는 강사 가용성 조회 로직.
import { prisma } from "./prisma";
import { requireBackofficeActor } from "./backofficeAuth";
import { requirePermission } from "./rbac";
import { DEFAULT_SITE_ID } from "./constants";
import { TEACHER_SUMMARY_SELECT } from "./teacherSelect";
import { findTeacherScheduleConflict, LEVEL_TEST_DURATION_MIN } from "./scheduleConflict";
import { parseAppDateTime } from "./appTime";
import { isWithinAvailableHours, timeStringToMinuteOfDay } from "./timeSlots";

export type AvailableTeacher = { id: number; label: string };

// 날짜+시간이 모두 채워지는 즉시(별도 "찾아보기" 클릭 없이) 그 한 시각에 근무가능시간이
// 겹치고 다른 일정과 충돌하지 않는 강사만 골라 돌려준다 — 강사 select를 자동으로 채우는 데 쓴다.
export async function getAvailableTeachersForLevelTestSlot(
  dateStr: string,
  timeStr: string,
  excludeLevelTestId?: number,
): Promise<AvailableTeacher[]> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.view");
  if (!dateStr || !timeStr) return [];

  const teachers = await prisma.teacher.findMany({
    where: { siteId: DEFAULT_SITE_ID, approvalStatus: "APPROVED", accountStatus: "ACTIVE" },
    orderBy: { realName: "asc" },
    select: TEACHER_SUMMARY_SELECT,
  });

  const minuteOfDay = timeStringToMinuteOfDay(timeStr);
  const start = parseAppDateTime(`${dateStr}T${timeStr}`);

  const available: AvailableTeacher[] = [];
  for (const t of teachers) {
    if (!isWithinAvailableHours(t.availableHours, minuteOfDay, LEVEL_TEST_DURATION_MIN)) continue;
    const conflict = await findTeacherScheduleConflict({
      teacherId: t.id,
      start,
      durationMin: LEVEL_TEST_DURATION_MIN,
      excludeLevelTestId,
    });
    if (!conflict) available.push({ id: t.id, label: t.realName });
  }
  return available;
}
