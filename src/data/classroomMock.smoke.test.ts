import { describe, expect, it } from "vitest";
import { CLASSROOM_SEED, STUDENTS } from "./classroomMock";

describe("classroomMock seed", () => {
  it("builds one enrollment per seeded student without throwing", () => {
    expect(CLASSROOM_SEED.enrollments.length).toBe(STUDENTS.length);
    const studentIds = new Set(CLASSROOM_SEED.enrollments.map((e) => e.studentId));
    expect(studentIds.size).toBe(STUDENTS.length);
  });

  it("has a sane shape overall", () => {
    expect(CLASSROOM_SEED.lessons.length).toBeGreaterThan(60);
    for (const enrollment of CLASSROOM_SEED.enrollments) {
      expect(enrollment.remainingLessons).toBeLessThanOrEqual(enrollment.totalLessons);
    }
    const statuses = new Set(CLASSROOM_SEED.lessons.map((l) => l.status));
    expect(statuses.has("completed")).toBe(true);
    expect(statuses.has("scheduled")).toBe(true);
  });

  it("keeps the flagship demo-student enrollment's rich mutation history", () => {
    const flagship = CLASSROOM_SEED.enrollments.find((e) => e.studentId === "demo-student")!;
    const flagshipLessons = CLASSROOM_SEED.lessons.filter((l) => l.enrollmentId === flagship.id);
    const statuses = new Set(flagshipLessons.map((l) => l.status));
    expect(statuses.has("absent")).toBe(true);
    expect(statuses.has("rescheduled")).toBe(true);
    expect(statuses.has("teacher_absent")).toBe(true);

    // end date must always match the actual tail lesson
    const maxDate = flagshipLessons.reduce(
      (max, l) => (l.scheduledDate > max ? l.scheduledDate : max),
      "0000-00-00",
    );
    expect(flagship.endDate).toBe(maxDate);
  });

  it("every enrollment's end date matches its own tail lesson (no cross-student leakage)", () => {
    for (const enrollment of CLASSROOM_SEED.enrollments) {
      const lessons = CLASSROOM_SEED.lessons.filter((l) => l.enrollmentId === enrollment.id);
      const maxDate = lessons.reduce((max, l) => (l.scheduledDate > max ? l.scheduledDate : max), "0000-00-00");
      expect(enrollment.endDate).toBe(maxDate);
    }
  });

  it("has at least one evaluation per teacher", () => {
    const teacherIds = new Set(CLASSROOM_SEED.enrollments.map((e) => e.teacherId));
    const evaluatedTeacherIds = new Set(CLASSROOM_SEED.evaluations.map((e) => e.teacherId));
    for (const teacherId of teacherIds) {
      expect(evaluatedTeacherIds.has(teacherId)).toBe(true);
    }
  });
});
