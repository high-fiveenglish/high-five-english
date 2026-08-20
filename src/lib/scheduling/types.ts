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
  startDate: ISODate;
  /** Always derived from `lessons` via recomputeEnrollmentEndDate — never set directly. */
  endDate: ISODate;
  totalLessons: number;
  remainingLessons: number;
  lessonDurationMin: number;
  weeklyDays: WeekDay[];
  classTime: ISOTime;
  status: EnrollmentStatus;
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
