// Teacher-facing mock service layer — every function is scoped to `actor.linkedId`
// (the teacher's own id) via requireOwnTeacher/requireRole, so a teacher account can
// never read or write another teacher's students, lessons, or meeting links.
import { enrollmentsLessonsForTeacher, findStudentEnglishName, findStudentName } from "./classroomService";
import { getDemoCourse } from "../data/classroomMock";
import type { MeetingPlatformId } from "../data/meetingPlatforms";
import { extendSchedule, markAttendance } from "../lib/scheduling/engine";
import type { ClosureDate, Enrollment, Lesson, RescheduleRequest } from "../lib/scheduling/types";
import type { CEFRLevel } from "../data/textbookCatalog";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requireOwnTeacher, requireRole } from "../lib/auth/permissions";
import { store, type TeacherMeetingLinks } from "./store";

let idCounter = 2000;
const idGen = () => `tsvc-${++idCounter}`;

export interface MyStudentRow {
  enrollment: Enrollment;
  studentName: string;
  courseName: string;
}

export async function listMyStudents(actor: Actor): Promise<ServiceResult<MyStudentRow[]>> {
  const guard = requireRole(actor, ["teacher"]);
  if (!guard.ok) return guard;

  const rows = store.enrollments
    .filter((e) => e.teacherId === actor.linkedId)
    .map((enrollment) => ({
      enrollment,
      studentName: findStudentName(enrollment.studentId),
      courseName: getDemoCourse().courseName,
    }));
  return okResult(rows);
}

export interface MyLessonRow extends Lesson {
  studentName: string;
  studentEnglishName: string;
  courseName: string;
  meetingPlatform: MeetingPlatformId;
  route: string;
  lessonDurationMin: number;
  currentLevel: CEFRLevel;
}

export async function listMyLessons(actor: Actor): Promise<ServiceResult<MyLessonRow[]>> {
  const guard = requireRole(actor, ["teacher"]);
  if (!guard.ok) return guard;

  const myEnrollments = store.enrollments.filter((e) => e.teacherId === actor.linkedId);
  const enrollmentById = new Map(myEnrollments.map((e) => [e.id, e]));

  const rows = store.lessons
    .filter((l) => enrollmentById.has(l.enrollmentId))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .map((lesson) => {
      const enrollment = enrollmentById.get(lesson.enrollmentId)!;
      return {
        ...lesson,
        studentName: findStudentName(enrollment.studentId),
        studentEnglishName: findStudentEnglishName(enrollment.studentId),
        courseName: getDemoCourse().courseName,
        meetingPlatform: enrollment.meetingPlatform,
        route: enrollment.route,
        lessonDurationMin: enrollment.lessonDurationMin,
        currentLevel: enrollment.currentLevel,
      };
    });
  return okResult(rows);
}

/** Teacher-initiated hold on one upcoming class ("Hold" in the class list) — reuses the
 * same extendSchedule engine path as a student reschedule, just with cause
 * "teacher_absent" and initiatedBy "teacher" (no cutoff-hours restriction applies to
 * teacher-initiated holds — see validateReschedule). Vacates this lesson and appends a
 * new scheduled one at the enrollment's next available slot. */
export async function holdLesson(
  actor: Actor,
  lessonId: string,
  reason: string,
): Promise<ServiceResult<RescheduleRequest>> {
  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
  const enrollment = store.enrollments.find((e) => e.id === lesson.enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const guard = requireOwnTeacher(actor, enrollment.teacherId);
  if (!guard.ok) return guard;

  const allTeacherLessons = enrollmentsLessonsForTeacher(enrollment.teacherId);
  const result = extendSchedule({
    enrollment,
    allEnrollmentLessons: store.lessons,
    allTeacherLessons,
    targetLesson: lesson,
    cause: "teacher_absent",
    initiatedBy: "teacher",
    reason,
    closures: store.closures,
    unavailability: store.teacherUnavailability,
    nowMs: Date.now(),
    idGen,
  });
  if (!result.ok) return result;

  store.lessons = [
    ...store.lessons.map((l) =>
      l.id === result.value.updatedOriginalLesson.id ? result.value.updatedOriginalLesson : l,
    ),
    result.value.newLesson,
  ];
  store.enrollments = store.enrollments.map((e) =>
    e.id === result.value.updatedEnrollment.id ? result.value.updatedEnrollment : e,
  );
  store.rescheduleRequests = [...store.rescheduleRequests, result.value.rescheduleRequest];

  return okResult(result.value.rescheduleRequest);
}

/** Records what actually happened in a lesson — attendance, textbook progress, and the
 * teacher's free-form comments — filled in from the class list "Evaluation" entry. Can
 * be submitted or re-edited at any time regardless of the lesson's date/status —
 * reopening an already-recorded lesson pre-fills its current values (see
 * TeacherEvaluationEntryModal). */
export async function submitLessonOutcome(
  actor: Actor,
  lessonId: string,
  outcome: { status: "completed" | "absent"; progress?: string; teacherComment?: string },
): Promise<ServiceResult<Lesson>> {
  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
  const enrollment = store.enrollments.find((e) => e.id === lesson.enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const guard = requireOwnTeacher(actor, enrollment.teacherId);
  if (!guard.ok) return guard;

  // Only the FIRST time a lesson is marked (i.e. it's still "scheduled") does it consume
  // a lesson from the enrollment — re-editing an already-recorded outcome (switching
  // attended/absent, fixing the progress text) must never double-decrement.
  const isFirstSubmission = lesson.status === "scheduled";

  const { updatedLesson } = markAttendance(lesson, outcome.status);
  const progress = outcome.status === "completed" ? outcome.progress?.trim() || undefined : undefined;
  const teacherComment = outcome.teacherComment?.trim() || undefined;
  const finalLesson: Lesson = { ...updatedLesson, progress, teacherComment, evaluationStatus: "completed" };

  store.lessons = store.lessons.map((l) => (l.id === lessonId ? finalLesson : l));
  if (isFirstSubmission) {
    store.enrollments = store.enrollments.map((e) =>
      e.id === enrollment.id ? { ...e, remainingLessons: e.remainingLessons - 1 } : e,
    );
  }
  return okResult(finalLesson);
}

/** Lets the teacher adjust the student's current CEFR level from the same evaluation
 * entry, as monthly evaluations reassess progress (see Enrollment.currentLevel). */
export async function updateEnrollmentLevel(
  actor: Actor,
  enrollmentId: string,
  level: CEFRLevel,
): Promise<ServiceResult<Enrollment>> {
  const enrollment = store.enrollments.find((e) => e.id === enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const guard = requireOwnTeacher(actor, enrollment.teacherId);
  if (!guard.ok) return guard;

  const updated: Enrollment = { ...enrollment, currentLevel: level };
  store.enrollments = store.enrollments.map((e) => (e.id === enrollmentId ? updated : e));
  return okResult(updated);
}

/** Academy-wide closure days (holidays, founding-anniversary closures, etc.) — the same
 * list shown on the student calendar — used to mark the one "전체 휴강일" indicator on the
 * teacher calendar. Not to be confused with a single teacher's own unavailability, which
 * is not a site-wide closure. */
export async function getAcademyClosures(actor: Actor): Promise<ServiceResult<ClosureDate[]>> {
  const guard = requireRole(actor, ["teacher"]);
  if (!guard.ok) return guard;
  return okResult(store.closures);
}

export async function getMyMeetingLinks(actor: Actor): Promise<ServiceResult<TeacherMeetingLinks>> {
  const guard = requireRole(actor, ["teacher"]);
  if (!guard.ok) return guard;
  return okResult(store.teacherMeetingLinks[actor.linkedId!] ?? {});
}

export async function updateMyMeetingLink(
  actor: Actor,
  platformId: MeetingPlatformId,
  url: string,
): Promise<ServiceResult<TeacherMeetingLinks>> {
  const guard = requireRole(actor, ["teacher"]);
  if (!guard.ok) return guard;

  const teacherId = actor.linkedId!;
  const current = store.teacherMeetingLinks[teacherId] ?? {};
  const next = { ...current, [platformId]: url.trim() || undefined };
  store.teacherMeetingLinks = { ...store.teacherMeetingLinks, [teacherId]: next };
  return okResult(next);
}
