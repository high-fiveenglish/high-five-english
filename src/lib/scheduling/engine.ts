import type {
  CauseStatus,
  ClosureDate,
  Enrollment,
  ISODate,
  ISOTime,
  InitiatedBy,
  Lesson,
  RescheduleRequest,
  Result,
  TeacherUnavailability,
  WeekDay,
} from "./types";
import { LESSON_STATUS_RULES, err, ok } from "./types";
import { addDays, combineDateTimeMs, dayOfWeek, hoursBetween } from "./dateUtils";

const RESCHEDULE_CUTOFF_HOURS = 4;
const MAX_SEARCH_DAYS = 365;

/** The current end of an enrollment's schedule. No status filter needed: a superseded
 * lesson's replacement is always created at a later date, so it's always the true max. */
export function computeTailDate(lessons: Lesson[], enrollmentId: string): ISODate | null {
  const dates = lessons
    .filter((l) => l.enrollmentId === enrollmentId)
    .map((l) => l.scheduledDate);
  if (dates.length === 0) return null;
  return dates.reduce((max, d) => (d > max ? d : max));
}

/** Always call this after any mutation instead of trusting a stored end_date. */
export function recomputeEnrollmentEndDate(lessons: Lesson[], enrollmentId: string): ISODate {
  const tail = computeTailDate(lessons, enrollmentId);
  if (!tail) throw new Error(`No lessons found for enrollment ${enrollmentId}`);
  return tail;
}

export function computeBlockedDates(
  closures: ClosureDate[],
  unavailability: TeacherUnavailability[],
  teacherId: string,
): Set<ISODate> {
  const set = new Set<ISODate>();
  for (const c of closures) set.add(c.date);
  for (const u of unavailability) if (u.teacherId === teacherId) set.add(u.date);
  return set;
}

function slotKey(date: ISODate, time: string): string {
  return `${date}_${time}`;
}

/** The time a lesson on `day` actually uses — `weeklyTimes[day]` if the enrollment has
 * a per-weekday override for that day, else the enrollment's shared `classTime`. Always
 * resolve through this rather than reading either field directly, since either can be
 * the one that applies depending on how the enrollment was registered. */
export function resolveClassTime(
  enrollment: Pick<Enrollment, "classTime" | "weeklyTimes">,
  day: WeekDay,
): ISOTime {
  return enrollment.weeklyTimes?.[day] ?? enrollment.classTime;
}

function timeToMinutes(time: ISOTime): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function timeRangesOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  return startA < startB + durationB && startB < startA + durationA;
}

export interface WeeklyScheduleConflict {
  day: WeekDay;
  time: ISOTime;
  conflictingEnrollmentId: string;
}

/**
 * Pre-flight check for an admin registering a new (optionally mixed-time) weekly
 * pattern: for each day in `weeklyDays`, does the resolved time overlap another of the
 * same teacher's active enrollments on that same weekday? Works purely off the weekly
 * pattern — no concrete dates needed — so a registration form can validate instantly,
 * before any lesson exists. This is a different check from findNextAvailableDate's
 * teacherBookedSlots: that one prevents a single date/time from double-booking once
 * lessons are already generated; this one catches a same-teacher recurring-slot clash
 * up front, on every future occurrence of that weekday, not just the next one.
 * Returns every conflicting (day, time) pair — an empty array means the pattern is
 * safe to register. Excludes the enrollment being edited via `excludeEnrollmentId`.
 */
export function findWeeklyScheduleConflicts(args: {
  teacherId: string;
  weeklyDays: WeekDay[];
  lessonDurationMin: number;
  resolveTime: (day: WeekDay) => ISOTime;
  teacherEnrollments: Enrollment[];
  excludeEnrollmentId?: string;
}): WeeklyScheduleConflict[] {
  const { teacherId, weeklyDays, lessonDurationMin, resolveTime, teacherEnrollments, excludeEnrollmentId } = args;
  const others = teacherEnrollments.filter(
    (e) => e.teacherId === teacherId && e.status === "active" && e.id !== excludeEnrollmentId,
  );

  const conflicts: WeeklyScheduleConflict[] = [];
  for (const day of weeklyDays) {
    const time = resolveTime(day);
    const startMin = timeToMinutes(time);
    for (const other of others) {
      if (!other.weeklyDays.includes(day)) continue;
      const otherStart = timeToMinutes(resolveClassTime(other, day));
      if (timeRangesOverlap(startMin, lessonDurationMin, otherStart, other.lessonDurationMin)) {
        conflicts.push({ day, time, conflictingEnrollmentId: other.id });
      }
    }
  }
  return conflicts;
}

/** (date,time) slots already booked by this teacher across ANY enrollment, to prevent
 * a rescheduled lesson from double-booking a different student's normal slot. */
export function computeTeacherBookedSlots(
  allTeacherLessons: Lesson[],
  excludeEnrollmentId?: string,
): Set<string> {
  const set = new Set<string>();
  for (const l of allTeacherLessons) {
    if (excludeEnrollmentId && l.enrollmentId === excludeEnrollmentId) continue;
    if (LESSON_STATUS_RULES[l.status].extendsSchedule) continue; // vacated slot, not actually booked
    set.add(slotKey(l.scheduledDate, l.scheduledTime));
  }
  return set;
}

export function findNextAvailableDate(args: {
  afterDate: ISODate;
  /** Resolves the class time for a given weekday — pass `() => enrollment.classTime`
   * for the standard equal-time patterns, or `(day) => resolveClassTime(enrollment, day)`
   * for one with per-weekday overrides. */
  resolveTime: (day: WeekDay) => ISOTime;
  weeklyDays: WeekDay[];
  blockedDates: Set<ISODate>;
  existingDates: Set<ISODate>;
  teacherBookedSlots: Set<string>;
  maxIterations?: number;
}): Result<ISODate> {
  const { afterDate, resolveTime, weeklyDays, blockedDates, existingDates, teacherBookedSlots } = args;
  if (weeklyDays.length === 0) {
    return err("INVALID_WEEKLY_DAYS", "enrollment.weeklyDays must not be empty");
  }
  const maxIterations = args.maxIterations ?? MAX_SEARCH_DAYS;

  let candidate = addDays(afterDate, 1);
  for (let i = 0; i < maxIterations; i++) {
    const day = dayOfWeek(candidate);
    const isClassDay = weeklyDays.includes(day);
    const isBlocked = blockedDates.has(candidate);
    const isTaken = existingDates.has(candidate);
    const isTeacherBusy = isClassDay && teacherBookedSlots.has(slotKey(candidate, resolveTime(day)));
    if (isClassDay && !isBlocked && !isTaken && !isTeacherBusy) {
      return ok(candidate);
    }
    candidate = addDays(candidate, 1);
  }
  return err("NO_AVAILABLE_DATE_FOUND", `No available date found within ${maxIterations} days`);
}

/** Builds the initial lesson schedule for a new enrollment. */
export function generateInitialSchedule(args: {
  enrollment: Pick<
    Enrollment,
    "id" | "startDate" | "weeklyDays" | "classTime" | "weeklyTimes" | "teacherId" | "totalLessons"
  >;
  closures: ClosureDate[];
  unavailability: TeacherUnavailability[];
  allTeacherLessons: Lesson[];
  idGen: () => string;
}): Result<Lesson[]> {
  const { enrollment, closures, unavailability, allTeacherLessons, idGen } = args;
  if (enrollment.weeklyDays.length === 0) {
    return err("INVALID_WEEKLY_DAYS", "enrollment.weeklyDays must not be empty");
  }
  const blockedDates = computeBlockedDates(closures, unavailability, enrollment.teacherId);
  const teacherBookedSlots = computeTeacherBookedSlots(allTeacherLessons);
  const existingDates = new Set<ISODate>();
  const lessons: Lesson[] = [];
  const resolveTime = (day: WeekDay) => resolveClassTime(enrollment, day);

  // Search starts the day *before* start_date so start_date itself can be selected.
  let cursor = addDays(enrollment.startDate, -1);
  let guard = 0;
  while (lessons.length < enrollment.totalLessons) {
    guard += 1;
    if (guard > MAX_SEARCH_DAYS * 4) {
      return err("NO_AVAILABLE_DATE_FOUND", "Could not fit totalLessons within a reasonable range");
    }
    const found = findNextAvailableDate({
      afterDate: cursor,
      resolveTime,
      weeklyDays: enrollment.weeklyDays,
      blockedDates,
      existingDates,
      teacherBookedSlots,
    });
    if (!found.ok) return found;
    existingDates.add(found.value);
    lessons.push({
      id: idGen(),
      enrollmentId: enrollment.id,
      scheduledDate: found.value,
      scheduledTime: resolveTime(dayOfWeek(found.value)),
      status: "scheduled",
      evaluationStatus: "not_started",
    });
    cursor = found.value;
  }
  return ok(lessons);
}

export function validateReschedule(args: {
  enrollment: Enrollment;
  lesson: Lesson;
  initiatedBy: InitiatedBy;
  nowMs: number;
}): Result<void> {
  const { enrollment, lesson, initiatedBy, nowMs } = args;
  if (enrollment.status !== "active") {
    return err("ENROLLMENT_NOT_ACTIVE", "Enrollment is not active");
  }
  if (enrollment.remainingLessons <= 0) {
    return err("REMAINING_LESSONS_EXHAUSTED", "No remaining lessons on this enrollment");
  }
  // Blocks: already-rescheduled lessons (#7), completed/absent lessons (#11), and any
  // other terminal status — only a still-upcoming lesson can be rescheduled.
  if (lesson.status !== "scheduled") {
    return err("LESSON_NOT_RESCHEDULABLE", `Lesson status "${lesson.status}" cannot be rescheduled`);
  }
  if (initiatedBy === "student") {
    const classMs = combineDateTimeMs(lesson.scheduledDate, lesson.scheduledTime);
    if (hoursBetween(nowMs, classMs) < RESCHEDULE_CUTOFF_HOURS) {
      return err(
        "WITHIN_CUTOFF_HOURS",
        `Less than ${RESCHEDULE_CUTOFF_HOURS} hours remain before this lesson starts`,
      );
    }
  }
  return ok(undefined);
}

/**
 * Handles student reschedule AND teacher_absent / academy_closed / admin_cancelled —
 * all four vacate `targetLesson`'s slot and append one new "scheduled" lesson at the
 * next available date after the enrollment's current tail. Cascades correctly for
 * repeated reschedules because the tail is recomputed fresh each call.
 */
export function extendSchedule(args: {
  enrollment: Enrollment;
  allEnrollmentLessons: Lesson[];
  allTeacherLessons: Lesson[];
  targetLesson: Lesson;
  cause: CauseStatus;
  initiatedBy: InitiatedBy;
  reason: string;
  closures: ClosureDate[];
  unavailability: TeacherUnavailability[];
  nowMs: number;
  idGen: () => string;
}): Result<{
  updatedOriginalLesson: Lesson;
  newLesson: Lesson;
  updatedEnrollment: Enrollment;
  rescheduleRequest: RescheduleRequest;
}> {
  const {
    enrollment,
    allEnrollmentLessons,
    allTeacherLessons,
    targetLesson,
    cause,
    initiatedBy,
    reason,
    closures,
    unavailability,
    nowMs,
    idGen,
  } = args;

  const validation = validateReschedule({ enrollment, lesson: targetLesson, initiatedBy, nowMs });
  if (!validation.ok) return validation;

  const tailDate = computeTailDate(allEnrollmentLessons, enrollment.id);
  if (!tailDate) return err("NO_AVAILABLE_DATE_FOUND", "Enrollment has no existing lessons");

  const blockedDates = computeBlockedDates(closures, unavailability, enrollment.teacherId);
  const existingDates = new Set(
    allEnrollmentLessons.filter((l) => l.enrollmentId === enrollment.id).map((l) => l.scheduledDate),
  );
  const teacherBookedSlots = computeTeacherBookedSlots(allTeacherLessons, enrollment.id);
  const resolveTime = (day: WeekDay) => resolveClassTime(enrollment, day);

  const found = findNextAvailableDate({
    afterDate: tailDate,
    resolveTime,
    weeklyDays: enrollment.weeklyDays,
    blockedDates,
    existingDates,
    teacherBookedSlots,
  });
  if (!found.ok) return found;
  const newDate = found.value;

  const newLesson: Lesson = {
    id: idGen(),
    enrollmentId: enrollment.id,
    scheduledDate: newDate,
    scheduledTime: resolveTime(dayOfWeek(newDate)),
    status: "scheduled",
    evaluationStatus: "not_started",
    rescheduledFromLessonId: targetLesson.id,
  };

  const updatedOriginalLesson: Lesson = {
    ...targetLesson,
    status: cause,
    rescheduledToLessonId: newLesson.id,
  };

  const endDateBefore = enrollment.endDate;
  const updatedEnrollment: Enrollment = { ...enrollment, endDate: newDate };

  const rescheduleRequest: RescheduleRequest = {
    id: idGen(),
    lessonId: targetLesson.id,
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId,
    requestedAt: new Date(nowMs).toISOString(),
    reason,
    originalDate: targetLesson.scheduledDate,
    newLessonId: newLesson.id,
    newDate,
    initiatedBy,
    cause,
    endDateBefore,
    endDateAfter: newDate,
    status: "applied",
  };

  return ok({ updatedOriginalLesson, newLesson, updatedEnrollment, rescheduleRequest });
}

/**
 * Admin data-correction tool: moves ONE lesson's date/time in place. Does not create a
 * replacement lesson and, unlike extendSchedule, is not restricted to weekly_days /
 * blocked dates unless `force` is false. Always recomputes end_date afterward since the
 * touched lesson may not be the tail (or the correction may move the tail earlier).
 */
export function overrideLessonDateInPlace(args: {
  lesson: Lesson;
  newDate: ISODate;
  newTime?: string;
  force?: boolean;
  allEnrollmentLessons: Lesson[];
  weeklyDays: WeekDay[];
  blockedDates: Set<ISODate>;
  existingDates: Set<ISODate>;
}): Result<{ updatedLesson: Lesson; recomputedEndDate: ISODate }> {
  const { lesson, newDate, newTime, force, allEnrollmentLessons, weeklyDays, blockedDates, existingDates } =
    args;

  if (!force) {
    if (!weeklyDays.includes(dayOfWeek(newDate))) {
      return err("INVALID_WEEKLY_DAYS", "newDate is not one of the enrollment's weekly class days");
    }
    if (blockedDates.has(newDate)) {
      return err("NO_AVAILABLE_DATE_FOUND", "newDate falls on a closure or teacher-unavailable day");
    }
    if (existingDates.has(newDate) && newDate !== lesson.scheduledDate) {
      return err("NO_AVAILABLE_DATE_FOUND", "newDate collides with an existing lesson");
    }
  }

  const updatedLesson: Lesson = {
    ...lesson,
    scheduledDate: newDate,
    scheduledTime: newTime ?? lesson.scheduledTime,
  };
  const otherLessons = allEnrollmentLessons.filter((l) => l.id !== lesson.id);
  const recomputedEndDate = recomputeEnrollmentEndDate(
    [...otherLessons, updatedLesson],
    lesson.enrollmentId,
  );

  return ok({ updatedLesson, recomputedEndDate });
}

/** Marks a lesson as attended or absent. Both consume a lesson (decrement remaining)
 * and do NOT extend the schedule — absence without a prior reschedule is forfeited. */
export function markAttendance(
  lesson: Lesson,
  status: "completed" | "absent",
): { updatedLesson: Lesson; remainingLessonsDelta: -1 } {
  return {
    updatedLesson: { ...lesson, status },
    remainingLessonsDelta: -1,
  };
}

/** Call after markAttendance (or any mutation) to see if the enrollment should auto-complete. */
export function isEnrollmentExhausted(enrollment: Enrollment, lessons: Lesson[]): boolean {
  const hasUpcoming = lessons.some(
    (l) => l.enrollmentId === enrollment.id && l.status === "scheduled",
  );
  return enrollment.remainingLessons <= 0 && !hasUpcoming;
}
