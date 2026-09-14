import type { MeetingPlatformId } from "../../data/meetingPlatforms";
import type { CEFRLevel } from "../../data/textbookCatalog";

/** Calendar date, e.g. "2026-08-25" */
export type ISODate = string;
/** 24h wall-clock time, e.g. "19:00". Always interpreted as Asia/Seoul (KST). */
export type ISOTime = string;
/** 0 = Sunday .. 6 = Saturday — matches JS `Date#getDay()`, NOT ISO-8601 (1=Mon..7=Sun). */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type LessonStatus =
  | "scheduled" // 예정
  | "completed" // 출석
  | "absent" // 결석
  | "rescheduled" // 연기 (student-initiated, superseded)
  | "teacher_absent" // 강사결석
  | "academy_closed" // 휴강
  | "admin_cancelled"; // 관리자취소

/** Lesson statuses that represent a slot being vacated and replaced by a new tail lesson. */
export type CauseStatus = Extract<
  LessonStatus,
  "rescheduled" | "teacher_absent" | "academy_closed" | "admin_cancelled"
>;

/**
 * Single source of truth for how each lesson status affects the enrollment.
 * Never branch on `status === '...'` for these two effects elsewhere — read this table.
 */
export const LESSON_STATUS_RULES: Record<
  LessonStatus,
  { decrementsRemaining: boolean; extendsSchedule: boolean }
> = {
  scheduled: { decrementsRemaining: false, extendsSchedule: false },
  completed: { decrementsRemaining: true, extendsSchedule: false },
  absent: { decrementsRemaining: true, extendsSchedule: false },
  rescheduled: { decrementsRemaining: false, extendsSchedule: true },
  teacher_absent: { decrementsRemaining: false, extendsSchedule: true },
  academy_closed: { decrementsRemaining: false, extendsSchedule: true },
  admin_cancelled: { decrementsRemaining: false, extendsSchedule: true },
};

export type EvaluationStatus = "not_started" | "in_progress" | "completed";
export type EnrollmentStatus = "active" | "completed" | "expired" | "paused";
export type InitiatedBy = "student" | "teacher" | "admin";

export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  teacherId: string;
  textbookId: string;
  /** Which agent/branch this enrollment was booked through, e.g. "main" for direct
   * sign-ups or an agent code for a partner-referred student. Display-only in this
   * mock system — there's no agent management feature here to edit it. */
  route: string;
  startDate: ISODate;
  /** Always derived from `lessons` via recomputeEnrollmentEndDate — never set directly. */
  endDate: ISODate;
  totalLessons: number;
  remainingLessons: number;
  lessonDurationMin: number;
  weeklyDays: WeekDay[];
  /** The shared time used for every day in `weeklyDays` — this is what the standard
   * patterns (주2회 화목/주3회 월수금/주5회 월~금) always use. */
  classTime: ISOTime;
  /** Per-weekday time overrides, for an admin registering a genuinely mixed schedule
   * (e.g. Mon 19:00, Wed 20:00, Fri 18:30) — keyed by WeekDay, only for days that
   * differ from `classTime`. Absent (or missing a given day) falls back to
   * `classTime` for that day. Always resolve via
   * lib/scheduling/engine.resolveClassTime rather than reading either field directly,
   * and validate a proposed set with engine.findWeeklyScheduleConflicts before
   * registering — the scheduling engine itself only prevents date-level double-
   * booking once lessons exist, not a same-teacher recurring-slot clash up front. */
  weeklyTimes?: Partial<Record<WeekDay, ISOTime>>;
  status: EnrollmentStatus;
  /** Which video-meeting program this enrollment's classes use. Set at enrollment
   * creation (optionally pre-filled from the teacher's default) and shown as-is to
   * the student — never recomputed at read time. */
  meetingPlatform: MeetingPlatformId;
  /** Fixed by the student's level test result at signup, but editable afterward
   * (currently by the teacher, from the class list evaluation entry — see
   * teacherService.updateEnrollmentLevel) as monthly evaluations reassess progress. */
  currentLevel: CEFRLevel;
}

export interface Lesson {
  id: string;
  enrollmentId: string;
  scheduledDate: ISODate;
  scheduledTime: ISOTime;
  status: LessonStatus;
  /** Set when this lesson was created to replace a vacated slot. */
  rescheduledFromLessonId?: string;
  /** Set on the original lesson once it has been superseded by a new tail lesson. */
  rescheduledToLessonId?: string;
  evaluationStatus: EvaluationStatus;
  /** The join link for this specific class session, set by an admin/teacher ahead of
   * time. Undefined until registered — the "수업 입장" button stays disabled until then. */
  meetingUrl?: string;
  /** Textbook/page progress reached as of this specific lesson — recorded when the
   * teacher marks this lesson's outcome (see teacherService.submitLessonOutcome).
   * Undefined until that lesson has actually happened and been recorded. The next
   * lesson's "직전 진도" is derived by walking back through the same enrollment's
   * lessons to the most recent one that has this set. */
  progress?: string;
  /** The teacher's free-form written feedback for this specific lesson, recorded
   * alongside `progress` in the same quick "Evaluation" entry. Shown to the student on
   * this lesson once set. */
  teacherComment?: string;
  /** Why this lesson was rescheduled/closed (student's own reason, or the school's
   * closure reason) — only ever set on a non-"scheduled"/"completed" lesson. Currently
   * only populated for real accounts (see realStudentBridge.ts); the mock engine has no
   * concept of this and always leaves it undefined. */
  reason?: string;
}

export interface DailyEvaluation {
  id: string;
  lessonId: string;
  studentId: string;
  teacherId: string;
  lessonSummary: string;
  strengths: string;
  improvements: string;
  teacherComment: string;
  pronunciation: SkillRating;
  grammar: SkillRating;
  vocabulary: SkillRating;
  speaking: SkillRating;
  /** Forward-looking: lets AI-assisted evaluation generation slot in without a schema change. */
  source: "teacher" | "ai_generated" | "ai_assisted";
  aiRawTranscriptRef?: string;
}

export interface SkillRating {
  score: 1 | 2 | 3 | 4 | 5;
  comment: string;
}

export interface ClosureDate {
  id: string;
  date: ISODate;
  type: "public_holiday" | "academy_closed";
  label: string;
}

export interface TeacherUnavailability {
  id: string;
  teacherId: string;
  date: ISODate;
  reason: string;
}

export interface RescheduleRequest {
  id: string;
  lessonId: string;
  enrollmentId: string;
  studentId: string;
  requestedAt: string; // ISO datetime
  reason: string;
  originalDate: ISODate;
  newLessonId: string;
  newDate: ISODate;
  initiatedBy: InitiatedBy;
  cause: CauseStatus;
  endDateBefore: ISODate;
  endDateAfter: ISODate;
  status: "applied" | "reverted";
}

export type SchedulingErrorCode =
  | "ENROLLMENT_NOT_ACTIVE"
  | "LESSON_NOT_RESCHEDULABLE"
  | "WITHIN_CUTOFF_HOURS"
  | "REMAINING_LESSONS_EXHAUSTED"
  | "NO_AVAILABLE_DATE_FOUND"
  | "INVALID_WEEKLY_DAYS";

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: SchedulingErrorCode; message: string } };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(code: SchedulingErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}
