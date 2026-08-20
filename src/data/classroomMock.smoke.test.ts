import { describe, expect, it } from "vitest";
import { CLASSROOM_SEED } from "./classroomMock";

describe("classroomMock seed", () => {
  it("builds without throwing and has a sane shape", () => {
    expect(CLASSROOM_SEED.lessons.length).toBeGreaterThan(20);
    expect(CLASSROOM_SEED.enrollment.remainingLessons).toBeLessThan(
      CLASSROOM_SEED.enrollment.totalLessons,
    );
    expect(CLASSROOM_SEED.rescheduleRequests.length).toBe(2);
    expect(CLASSROOM_SEED.evaluations.length).toBe(1);
    const statuses = new Set(CLASSROOM_SEED.lessons.map((l) => l.status));
    expect(statuses.has("completed")).toBe(true);
    expect(statuses.has("absent")).toBe(true);
    expect(statuses.has("rescheduled")).toBe(true);
    expect(statuses.has("teacher_absent")).toBe(true);
    // end date must always match the actual tail lesson
    const maxDate = CLASSROOM_SEED.lessons.reduce(
      (max, l) => (l.scheduledDate > max ? l.scheduledDate : max),
      "0000-00-00",
    );
    expect(CLASSROOM_SEED.enrollment.endDate).toBe(maxDate);
  });
});
