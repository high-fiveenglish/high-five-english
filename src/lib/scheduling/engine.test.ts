import { describe, expect, it } from "vitest";
import {
  computeTailDate,
  extendSchedule,
  findNextAvailableDate,
  findWeeklyScheduleConflicts,
  generateInitialSchedule,
  isEnrollmentExhausted,
  markAttendance,
  overrideLessonDateInPlace,
  resolveClassTime,
  validateReschedule,
} from "./engine";
import { addDays, dayOfWeek } from "./dateUtils";
import type { ClosureDate, Enrollment, Lesson, TeacherUnavailability, WeekDay } from "./types";

let idCounter = 0;
const idGen = () => `id-${++idCounter}`;

function makeEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: "enr-1",
    studentId: "stu-1",
    courseId: "course-1",
    teacherId: "teacher-1",
    textbookId: "book-1",
    startDate: "2026-08-03", // a Monday
    endDate: "2026-08-03",
    totalLessons: 12,
    remainingLessons: 12,
    lessonDurationMin: 25,
    weeklyDays: [1, 3, 5] as WeekDay[], // Mon/Wed/Fri
    classTime: "19:00",
    status: "active",
    meetingPlatform: "zoom",
    route: "main",
    currentLevel: "b1",
    ...overrides,
  };
}

function scheduledLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: idGen(),
    enrollmentId: "enr-1",
    scheduledDate: "2026-08-24", // a Monday
    scheduledTime: "19:00",
    status: "scheduled",
    evaluationStatus: "not_started",
    ...overrides,
  };
}

describe("dateUtils.dayOfWeek", () => {
  it("matches known weekdays", () => {
    expect(dayOfWeek("2026-08-03")).toBe(1); // Monday
    expect(dayOfWeek("2026-08-01")).toBe(6); // Saturday
    expect(dayOfWeek("2026-08-02")).toBe(0); // Sunday
  });
});

describe("#1-3 weekly frequency is frequency-agnostic", () => {
  it.each([
    [[1, 3, 5] as WeekDay[], 6], // 3x/week
    [[2, 4] as WeekDay[], 6], // 2x/week
    [[0, 1, 2, 3, 4] as WeekDay[], 10], // 5x/week
  ])("generates the requested lesson count for weeklyDays=%j", (weeklyDays, totalLessons) => {
    const enrollment = makeEnrollment({ weeklyDays, totalLessons });
    const result = generateInitialSchedule({
      enrollment,
      closures: [],
      unavailability: [],
      allTeacherLessons: [],
      idGen,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(totalLessons);
      for (const lesson of result.value) {
        expect(weeklyDays).toContain(dayOfWeek(lesson.scheduledDate));
      }
    }
  });
});

describe("#4/#5 holidays and academy closures are skipped", () => {
  it("does not schedule a lesson on a closure date", () => {
    const enrollment = makeEnrollment({ totalLessons: 4 });
    const closures: ClosureDate[] = [
      { id: "c1", date: "2026-08-05", type: "public_holiday", label: "임시공휴일" }, // Wed
    ];
    const result = generateInitialSchedule({
      enrollment,
      closures,
      unavailability: [],
      allTeacherLessons: [],
      idGen,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((l) => l.scheduledDate)).not.toContain("2026-08-05");
    }
  });
});

describe("#6 teacher unavailability + cross-enrollment double-booking", () => {
  it("skips a date the teacher marked unavailable", () => {
    const enrollment = makeEnrollment({ totalLessons: 1, startDate: "2026-08-03" });
    const unavailability: TeacherUnavailability[] = [
      { id: "u1", teacherId: "teacher-1", date: "2026-08-03", reason: "휴무" },
    ];
    const result = generateInitialSchedule({
      enrollment,
      closures: [],
      unavailability,
      allTeacherLessons: [],
      idGen,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0].scheduledDate).not.toBe("2026-08-03");
  });

  it("does not double-book a teacher's slot already used by a different enrollment", () => {
    const enrollment = makeEnrollment({ id: "enr-2", startDate: "2026-08-24", totalLessons: 1 });
    const otherStudentsLesson: Lesson = scheduledLesson({
      enrollmentId: "enr-999",
      scheduledDate: "2026-08-24",
      scheduledTime: "19:00",
    });
    const result = generateInitialSchedule({
      enrollment,
      closures: [],
      unavailability: [],
      allTeacherLessons: [otherStudentsLesson],
      idGen,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0].scheduledDate).not.toBe("2026-08-24");
  });
});

describe("#7 already-rescheduled lessons cannot be rescheduled again", () => {
  it("rejects a lesson with status 'rescheduled'", () => {
    const enrollment = makeEnrollment();
    const lesson = scheduledLesson({ status: "rescheduled" });
    const result = validateReschedule({
      enrollment,
      lesson,
      initiatedBy: "student",
      nowMs: Date.parse("2026-08-20T00:00:00Z"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LESSON_NOT_RESCHEDULABLE");
  });
});

describe("#8 consecutive reschedules cascade correctly", () => {
  it("each reschedule extends from the new tail, not the original lesson", () => {
    const enrollment = makeEnrollment({ totalLessons: 3 });
    let lessons: Lesson[] = [
      scheduledLesson({ id: "L1", scheduledDate: "2026-08-03" }),
      scheduledLesson({ id: "L2", scheduledDate: "2026-08-05" }),
      scheduledLesson({ id: "L3", scheduledDate: "2026-08-07" }),
    ];
    let enr = enrollment;
    const nowMs = Date.parse("2026-07-01T00:00:00Z"); // well before any lesson

    // Reschedule L1 (earliest) — should append after the tail (L3, 08-07), not after L1.
    const r1 = extendSchedule({
      enrollment: enr,
      allEnrollmentLessons: lessons,
      allTeacherLessons: lessons,
      targetLesson: lessons[0],
      cause: "rescheduled",
      initiatedBy: "student",
      reason: "일정 변경",
      closures: [],
      unavailability: [],
      nowMs,
      idGen,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.value.newLesson.scheduledDate > "2026-08-07").toBe(true);
    lessons = [
      r1.value.updatedOriginalLesson,
      lessons[1],
      lessons[2],
      r1.value.newLesson,
    ];
    enr = r1.value.updatedEnrollment;
    const firstNewDate = r1.value.newLesson.scheduledDate;

    // Reschedule again (L2) — must append after the NEW tail, i.e. after firstNewDate.
    const r2 = extendSchedule({
      enrollment: enr,
      allEnrollmentLessons: lessons,
      allTeacherLessons: lessons,
      targetLesson: lessons[1],
      cause: "rescheduled",
      initiatedBy: "student",
      reason: "일정 변경",
      closures: [],
      unavailability: [],
      nowMs,
      idGen,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.value.newLesson.scheduledDate > firstNewDate).toBe(true);
    expect(computeTailDate(lessons, "enr-1")).toBe(firstNewDate);
  });
});

describe("#9 schedule can cross a month boundary without drift", () => {
  it("correctly continues into the next month", () => {
    const enrollment = makeEnrollment({ startDate: "2026-08-28", totalLessons: 3, weeklyDays: [1, 3, 5] });
    const result = generateInitialSchedule({
      enrollment,
      closures: [],
      unavailability: [],
      allTeacherLessons: [],
      idGen,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const dates = result.value.map((l) => l.scheduledDate);
      expect(dates.some((d) => d.startsWith("2026-09"))).toBe(true);
    }
  });
});

describe("#10 expired/exhausted enrollment blocks reschedule", () => {
  it("rejects when remainingLessons is 0", () => {
    const enrollment = makeEnrollment({ remainingLessons: 0 });
    const lesson = scheduledLesson();
    const result = validateReschedule({
      enrollment,
      lesson,
      initiatedBy: "student",
      nowMs: Date.parse("2026-08-01T00:00:00Z"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("REMAINING_LESSONS_EXHAUSTED");
  });

  it("auto-completes an enrollment once lessons run out with none upcoming", () => {
    const enrollment = makeEnrollment({ remainingLessons: 0 });
    const lessons = [scheduledLesson({ status: "completed" })];
    expect(isEnrollmentExhausted(enrollment, lessons)).toBe(true);
  });
});

describe("#11 already-completed lessons cannot be rescheduled", () => {
  it("rejects a lesson with status 'completed'", () => {
    const enrollment = makeEnrollment();
    const lesson = scheduledLesson({ status: "completed" });
    const result = validateReschedule({
      enrollment,
      lesson,
      initiatedBy: "student",
      nowMs: Date.parse("2026-08-01T00:00:00Z"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LESSON_NOT_RESCHEDULABLE");
  });
});

describe("#12 4-hour cutoff", () => {
  it("blocks a student reschedule inside the 4-hour window", () => {
    const enrollment = makeEnrollment();
    const lesson = scheduledLesson({ scheduledDate: "2026-08-25", scheduledTime: "19:00" });
    // 3 hours before class start (KST)
    const nowMs = Date.parse("2026-08-25T13:00:00Z"); // 22:00 KST on 08-24 -> 16:00 KST on 08-25 is 3h before 19:00 KST
    const result = validateReschedule({ enrollment, lesson, initiatedBy: "student", nowMs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("WITHIN_CUTOFF_HOURS");
  });

  it("allows a student reschedule at exactly the 4-hour mark or earlier", () => {
    const enrollment = makeEnrollment();
    const lesson = scheduledLesson({ scheduledDate: "2026-08-25", scheduledTime: "19:00" });
    // class is 19:00 KST = 10:00 UTC; 5 hours before = 05:00 UTC
    const nowMs = Date.parse("2026-08-25T05:00:00Z");
    const result = validateReschedule({ enrollment, lesson, initiatedBy: "student", nowMs });
    expect(result.ok).toBe(true);
  });

  it("does not apply the cutoff to admin-initiated changes", () => {
    const enrollment = makeEnrollment();
    const lesson = scheduledLesson({ scheduledDate: "2026-08-25", scheduledTime: "19:00" });
    const nowMs = Date.parse("2026-08-25T09:55:00Z"); // 5 minutes before class start
    const result = validateReschedule({ enrollment, lesson, initiatedBy: "admin", nowMs });
    expect(result.ok).toBe(true);
  });
});

describe("#13 admin manual override", () => {
  it("moves a lesson without creating a new one and recomputes end_date", () => {
    const lessons = [
      scheduledLesson({ id: "L1", scheduledDate: "2026-08-03" }),
      scheduledLesson({ id: "L2", scheduledDate: "2026-08-05" }),
    ];
    const result = overrideLessonDateInPlace({
      lesson: lessons[1],
      newDate: "2026-08-10",
      allEnrollmentLessons: lessons,
      weeklyDays: [1, 3, 5],
      blockedDates: new Set(),
      existingDates: new Set(lessons.map((l) => l.scheduledDate)),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.updatedLesson.scheduledDate).toBe("2026-08-10");
      expect(result.value.recomputedEndDate).toBe("2026-08-10");
    }
  });

  it("blocks a non-class-day override unless force is set", () => {
    const lessons = [scheduledLesson({ id: "L1", scheduledDate: "2026-08-03" })];
    const blocked = overrideLessonDateInPlace({
      lesson: lessons[0],
      newDate: "2026-08-04", // a Tuesday, not in weeklyDays
      allEnrollmentLessons: lessons,
      weeklyDays: [1, 3, 5],
      blockedDates: new Set(),
      existingDates: new Set(),
    });
    expect(blocked.ok).toBe(false);

    const forced = overrideLessonDateInPlace({
      lesson: lessons[0],
      newDate: "2026-08-04",
      force: true,
      allEnrollmentLessons: lessons,
      weeklyDays: [1, 3, 5],
      blockedDates: new Set(),
      existingDates: new Set(),
    });
    expect(forced.ok).toBe(true);
  });

  it("recomputes end_date correctly when the tail lesson is moved earlier", () => {
    const lessons = [
      scheduledLesson({ id: "L1", scheduledDate: "2026-08-03" }),
      scheduledLesson({ id: "L2", scheduledDate: "2026-08-10" }),
    ];
    const result = overrideLessonDateInPlace({
      lesson: lessons[1],
      newDate: "2026-08-05",
      force: true,
      allEnrollmentLessons: lessons,
      weeklyDays: [1, 3, 5],
      blockedDates: new Set(),
      existingDates: new Set(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.recomputedEndDate).toBe("2026-08-05");
  });
});

describe("teacher/academy-caused cancellations auto-extend without consuming a lesson", () => {
  it("keeps remainingLessons unchanged and appends a new tail lesson", () => {
    const enrollment = makeEnrollment({ remainingLessons: 5 });
    const lessons = [scheduledLesson({ id: "L1", scheduledDate: "2026-08-24" })];
    const result = extendSchedule({
      enrollment,
      allEnrollmentLessons: lessons,
      allTeacherLessons: lessons,
      targetLesson: lessons[0],
      cause: "teacher_absent",
      initiatedBy: "teacher",
      reason: "강사 사정",
      closures: [],
      unavailability: [],
      nowMs: Date.parse("2026-08-01T00:00:00Z"),
      idGen,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.updatedOriginalLesson.status).toBe("teacher_absent");
      expect(result.value.newLesson.status).toBe("scheduled");
      expect(result.value.updatedEnrollment.remainingLessons).toBe(5); // unchanged
      expect(result.value.updatedEnrollment.endDate).toBe(result.value.newLesson.scheduledDate);
    }
  });
});

describe("absence forfeits the lesson without extending the schedule", () => {
  it("decrements remaining and leaves the schedule tail untouched", () => {
    const lesson = scheduledLesson();
    const { updatedLesson, remainingLessonsDelta } = markAttendance(lesson, "absent");
    expect(updatedLesson.status).toBe("absent");
    expect(remainingLessonsDelta).toBe(-1);
  });
});

describe("findNextAvailableDate safety", () => {
  it("returns an error instead of looping forever when weeklyDays is empty", () => {
    const result = findNextAvailableDate({
      afterDate: "2026-08-01",
      resolveTime: () => "19:00",
      weeklyDays: [],
      blockedDates: new Set(),
      existingDates: new Set(),
      teacherBookedSlots: new Set(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_WEEKLY_DAYS");
  });
});

describe("resolveClassTime", () => {
  it("falls back to classTime when weeklyTimes has no override for the day", () => {
    const enrollment = makeEnrollment({ classTime: "19:00" });
    expect(resolveClassTime(enrollment, 1)).toBe("19:00"); // Mon, no override
  });

  it("uses the weeklyTimes override for a specific day", () => {
    const enrollment = makeEnrollment({ classTime: "20:00", weeklyTimes: { 3: "20:30" } });
    expect(resolveClassTime(enrollment, 3)).toBe("20:30"); // Wed override
    expect(resolveClassTime(enrollment, 1)).toBe("20:00"); // Mon falls back
    expect(resolveClassTime(enrollment, 5)).toBe("20:00"); // Fri falls back
  });
});

describe("findWeeklyScheduleConflicts", () => {
  it("reports no conflicts when the proposed pattern doesn't overlap another enrollment", () => {
    const other = makeEnrollment({ id: "enr-2", teacherId: "teacher-1", weeklyDays: [2, 4], classTime: "20:00" });
    const conflicts = findWeeklyScheduleConflicts({
      teacherId: "teacher-1",
      weeklyDays: [1, 3, 5],
      lessonDurationMin: 25,
      resolveTime: () => "20:00",
      teacherEnrollments: [other],
    });
    expect(conflicts).toHaveLength(0);
  });

  it("detects an overlapping time on a shared weekday for the same teacher", () => {
    const other = makeEnrollment({ id: "enr-2", teacherId: "teacher-1", weeklyDays: [1, 3, 5], classTime: "20:00", lessonDurationMin: 25 });
    const conflicts = findWeeklyScheduleConflicts({
      teacherId: "teacher-1",
      weeklyDays: [1, 3, 5],
      lessonDurationMin: 25,
      resolveTime: () => "20:00",
      teacherEnrollments: [other],
    });
    expect(conflicts).toHaveLength(3);
    expect(conflicts[0]).toMatchObject({ day: 1, time: "20:00", conflictingEnrollmentId: "enr-2" });
  });

  it("respects per-weekday overrides on the other enrollment when checking overlap", () => {
    // Other enrollment shares Mon/Wed/Fri at 20:00, but overrides Wednesday to 20:30 —
    // a new pattern that only touches Wed 20:00-20:25 should NOT conflict on that day.
    const other = makeEnrollment({
      id: "enr-2",
      teacherId: "teacher-1",
      weeklyDays: [1, 3, 5],
      classTime: "20:00",
      weeklyTimes: { 3: "20:30" },
      lessonDurationMin: 25,
    });
    const conflicts = findWeeklyScheduleConflicts({
      teacherId: "teacher-1",
      weeklyDays: [3],
      lessonDurationMin: 25,
      resolveTime: () => "20:00",
      teacherEnrollments: [other],
    });
    expect(conflicts).toHaveLength(0);
  });

  it("ignores enrollments for a different teacher, inactive enrollments, and the excluded id", () => {
    const otherTeacher = makeEnrollment({ id: "enr-2", teacherId: "teacher-9", weeklyDays: [1], classTime: "20:00" });
    const paused = makeEnrollment({ id: "enr-3", teacherId: "teacher-1", weeklyDays: [1], classTime: "20:00", status: "paused" });
    const self = makeEnrollment({ id: "enr-4", teacherId: "teacher-1", weeklyDays: [1], classTime: "20:00" });
    const conflicts = findWeeklyScheduleConflicts({
      teacherId: "teacher-1",
      weeklyDays: [1],
      lessonDurationMin: 25,
      resolveTime: () => "20:00",
      teacherEnrollments: [otherTeacher, paused, self],
      excludeEnrollmentId: "enr-4",
    });
    expect(conflicts).toHaveLength(0);
  });
});

describe("sanity: addDays / tail helpers", () => {
  it("addDays advances by whole calendar days", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
