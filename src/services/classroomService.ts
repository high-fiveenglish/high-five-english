// Student-facing mock service layer. Every function takes the requesting `actor` and
// checks it via src/lib/auth/permissions.ts BEFORE touching data — this is what stands
// in for "checked at the API level" until a real backend exists (see store.ts).
import {
  DEMO_COURSE,
  DEMO_LEVEL_TEST_RESULT,
  DEMO_TEXTBOOK,
  STUDENTS,
  type ClassroomCourse,
  type ClassroomTextbook,
  type LevelTestResult,
} from "../data/classroomMock";
import { INSTRUCTORS, type Instructor } from "../data/instructors";
import { MEETING_PLATFORMS, type MeetingPlatformId } from "../data/meetingPlatforms";
import { computeBlockedDates, extendSchedule } from "../lib/scheduling/engine";
import type {
  ClosureDate,
  DailyEvaluation,
  Enrollment,
  Lesson,
  RescheduleRequest,
  TeacherUnavailability,
} from "../lib/scheduling/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requireOwnStudent, requireRole, requireStudentOrOwningTeacherOrPermission } from "../lib/auth/permissions";
import { store, type TeacherMeetingLinks } from "./store";

let idCounter = 1000;
const idGen = () => `svc-${++idCounter}`;

export interface MeetingPlatformRow {
  id: MeetingPlatformId;
  name: string;
  shortName: string;
  brandColor: string;
  description: string;
  officialSiteUrl: string;
  downloadLinks: { pc: string; android: string; ios: string };
  installSteps: string[];
  joinSteps: string[];
  enabled: boolean;
}

/** Public catalog read — deliberately NOT actor-gated, since the /install page shows
 * these cards to visitors who aren't logged in at all. */
export async function listMeetingPlatforms(): Promise<MeetingPlatformRow[]> {
  return MEETING_PLATFORMS.map((p) => ({ ...p, enabled: store.platformEnabled[p.id] }));
}

/** Public read of the class-entry button's timing window — not sensitive, only writes
 * (adminService.updateEntryWindowSettings) are permission-gated. */
export async function getEntryWindowSettings() {
  return store.entryWindow;
}

export interface MyClassroomSnapshot {
  enrollment: Enrollment;
  course: ClassroomCourse;
  teacher: Instructor;
  textbook: ClassroomTextbook;
  levelTestResult: LevelTestResult;
  lessons: Lesson[];
  /** This enrollment's teacher's own registered zoom/voov/teams links (see
   * lib/meeting/resolveJoinUrl for how a lesson's actual join URL is derived from this). */
  teacherMeetingLinks: TeacherMeetingLinks;
  /** All academy-wide closures, for the student calendar. */
  closures: ClosureDate[];
  /** Only this enrollment's teacher's unavailable dates (not other teachers'). */
  teacherUnavailability: TeacherUnavailability[];
}

function findActiveEnrollmentForStudent(studentId: string): Enrollment | undefined {
  return store.enrollments.find((e) => e.studentId === studentId);
}

export async function getMyClassroom(actor: Actor): Promise<ServiceResult<MyClassroomSnapshot>> {
  const guard = requireRole(actor, ["student"]);
  if (!guard.ok) return guard;

  const studentId = actor.linkedId!;
  const enrollment = findActiveEnrollmentForStudent(studentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const teacher = INSTRUCTORS.find((i) => i.id === enrollment.teacherId);
  if (!teacher) return errResult("NOT_FOUND", "담당 강사 정보를 찾을 수 없습니다.");

  const lessons = store.lessons
    .filter((l) => l.enrollmentId === enrollment.id)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  return okResult({
    enrollment,
    course: DEMO_COURSE,
    teacher,
    textbook: DEMO_TEXTBOOK,
    levelTestResult: DEMO_LEVEL_TEST_RESULT,
    lessons,
    teacherMeetingLinks: store.teacherMeetingLinks[enrollment.teacherId] ?? {},
    closures: store.closures,
    teacherUnavailability: store.teacherUnavailability.filter((u) => u.teacherId === enrollment.teacherId),
  });
}

export async function getEvaluation(actor: Actor, lessonId: string): Promise<ServiceResult<DailyEvaluation | null>> {
  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
  const enrollment = store.enrollments.find((e) => e.id === lesson.enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const guard = requireStudentOrOwningTeacherOrPermission(
    actor,
    enrollment.studentId,
    enrollment.teacherId,
    "evaluations",
  );
  if (!guard.ok) return guard;

  return okResult(store.evaluations.find((e) => e.lessonId === lessonId) ?? null);
}

export async function requestReschedule(
  actor: Actor,
  lessonId: string,
  reason: string,
): Promise<ServiceResult<RescheduleRequest>> {
  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
  const enrollment = store.enrollments.find((e) => e.id === lesson.enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const guard = requireOwnStudent(actor, enrollment.studentId);
  if (!guard.ok) return guard;

  const allTeacherLessons = enrollmentsLessonsForTeacher(enrollment.teacherId);
  const result = extendSchedule({
    enrollment,
    allEnrollmentLessons: store.lessons,
    allTeacherLessons,
    targetLesson: lesson,
    cause: "rescheduled",
    initiatedBy: "student",
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

function enrollmentsLessonsForTeacher(teacherId: string): Lesson[] {
  const enrollmentIds = new Set(
    store.enrollments.filter((e) => e.teacherId === teacherId).map((e) => e.id),
  );
  return store.lessons.filter((l) => enrollmentIds.has(l.enrollmentId));
}

// Re-exported so other service modules (teacherService/adminService) can build blocked-date
// sets the same way the scheduling engine already does, without duplicating the merge logic.
export function blockedDatesFor(teacherId: string): Set<string> {
  return computeBlockedDates(store.closures, store.teacherUnavailability, teacherId);
}

export function findStudentName(studentId: string): string {
  return STUDENTS.find((s) => s.id === studentId)?.name ?? studentId;
}
