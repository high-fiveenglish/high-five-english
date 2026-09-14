import { describe, expect, it } from "vitest";
import { CLASSROOM_SEED, STUDENTS } from "./classroomMock";
import { classifyEnrollmentTimeline } from "../services/classroomService";

describe("classroomMock seed", () => {
  it("builds at least one enrollment per seeded student without throwing", () => {
    const studentIds = new Set(CLASSROOM_SEED.enrollments.map((e) => e.studentId));
    expect(studentIds.size).toBe(STUDENTS.length);
  });

  it("gives demo-student a full past/current/upcoming enrollment history", () => {
    const demoEnrollments = CLASSROOM_SEED.enrollments.filter((e) => e.studentId === "demo-student");
    expect(demoEnrollments.length).toBe(3);
    const timelines = demoEnrollments.map((e) => classifyEnrollmentTimeline(e));
    expect(timelines).toContain("ended");
    expect(timelines).toContain("in_progress");
    expect(timelines).toContain("upcoming");
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
    expect(statuses.has("rescheduled")).toBe(true);
    expect(statuses.has("teacher_absent")).toBe(true);

    // 9 total reschedules, per the requested demo scenario
    const flagshipReschedules = CLASSROOM_SEED.rescheduleRequests.filter(
      (r) => r.enrollmentId === flagship.id,
    );
    expect(flagshipReschedules.length).toBe(9);

    // every lesson from 9/1 through 9/7 must be completed with a written evaluation
    const evaluatedDates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07"];
    for (const date of evaluatedDates) {
      const lesson = flagshipLessons.find((l) => l.scheduledDate === date)!;
      expect(lesson.status).toBe("completed");
      expect(lesson.evaluationStatus).toBe("completed");
    }

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
