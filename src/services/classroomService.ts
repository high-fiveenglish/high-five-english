// Thin mock service layer. All functions are async so call sites don't change when
// this is later swapped for real API calls — only this file's bodies would change.
import {
  CLASSROOM_SEED,
  CLOSURES,
  DEMO_COURSE,
  DEMO_STUDENT,
  DEMO_TEACHER,
  DEMO_TEXTBOOK,
  DEMO_LEVEL_TEST_RESULT,
  TEACHER_UNAVAILABILITY,
  type ClassroomCourse,
  type ClassroomStudent,
  type ClassroomTextbook,
  type LevelTestResult,
} from "../data/classroomMock";
import {
  computeBlockedDates,
  extendSchedule,
  overrideLessonDateInPlace,
} from "../lib/scheduling/engine";
import type {
  DailyEvaluation,
  Enrollment,
  ISODate,
  Lesson,
  RescheduleRequest,
  Result,
} from "../lib/scheduling/types";
import type { Instructor } from "../data/instructors";

let idCounter = 1000;
const idGen = () => `svc-${++idCounter}`;

// module-level mutable store, seeded once — shared by every caller (student + admin
// views alike), standing in for a shared database until a real backend exists.
const store = {
  enrollment: { ...CLASSROOM_SEED.enrollment } as Enrollment,
  lessons: [...CLASSROOM_SEED.lessons] as Lesson[],
  evaluations: [...CLASSROOM_SEED.evaluations] as DailyEvaluation[],
  rescheduleRequests: [...CLASSROOM_SEED.rescheduleRequests] as RescheduleRequest[],
};

export interface MyClassroomSnapshot {
  enrollment: Enrollment;
  course: ClassroomCourse;
  teacher: Instructor;
  textbook: ClassroomTextbook;
  levelTestResult: LevelTestResult;
  lessons: Lesson[];
}

export async function getMyClassroom(studentId: string): Promise<MyClassroomSnapshot | null> {
  if (studentId !== store.enrollment.studentId) return null;
  return {
    enrollment: store.enrollment,
    course: DEMO_COURSE,
    teacher: DEMO_TEACHER,
    textbook: DEMO_TEXTBOOK,
    levelTestResult: DEMO_LEVEL_TEST_RESULT,
    lessons: [...store.lessons].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
  };
}

export async function getEvaluation(lessonId: string): Promise<DailyEvaluation | null> {
  return store.evaluations.find((e) => e.lessonId === lessonId) ?? null;
}

export async function requestReschedule(
  lessonId: string,
  reason: string,
): Promise<Result<RescheduleRequest>> {
  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) {
    return { ok: false, error: { code: "LESSON_NOT_RESCHEDULABLE", message: "수업을 찾을 수 없습니다." } };
  }
  const result = extendSchedule({
    enrollment: store.enrollment,
    allEnrollmentLessons: store.lessons,
    allTeacherLessons: store.lessons,
    targetLesson: lesson,
    cause: "rescheduled",
    initiatedBy: "student",
    reason,
    closures: CLOSURES,
    unavailability: TEACHER_UNAVAILABILITY,
    nowMs: Date.now(),
    idGen,
  });
  if (!result.ok) return result;

  store.lessons = [
    ...store.lessons.map((l) => (l.id === result.value.updatedOriginalLesson.id
      ? result.value.updatedOriginalLesson
      : l)),
    result.value.newLesson,
  ];
  store.enrollment = result.value.updatedEnrollment;
  store.rescheduleRequests = [...store.rescheduleRequests, result.value.rescheduleRequest];

  return { ok: true, value: result.value.rescheduleRequest };
}

export interface AdminRescheduleRow extends RescheduleRequest {
  studentName: string;
  courseName: string;
}

export async function listRescheduleRequests(): Promise<AdminRescheduleRow[]> {
  const student: ClassroomStudent = DEMO_STUDENT;
  return [...store.rescheduleRequests]
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .map((r) => ({ ...r, studentName: student.name, courseName: DEMO_COURSE.courseName }));
}

export interface AdminLessonRow extends Lesson {
  studentName: string;
  courseName: string;
}

/** Lessons an admin can pick from for a manual date correction — anything still
 * upcoming (not yet attended/absent/vacated). */
export async function listSchedulableLessons(): Promise<AdminLessonRow[]> {
  return store.lessons
    .filter((l) => l.status === "scheduled")
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .map((l) => ({ ...l, studentName: DEMO_STUDENT.name, courseName: DEMO_COURSE.courseName }));
}

export async function overrideLessonDate(
  lessonId: string,
  newDate: ISODate,
  newTime: string | undefined,
  force: boolean,
): Promise<Result<Lesson>> {
  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) {
    return { ok: false, error: { code: "LESSON_NOT_RESCHEDULABLE", message: "수업을 찾을 수 없습니다." } };
  }
  const blockedDates = computeBlockedDates(CLOSURES, TEACHER_UNAVAILABILITY, store.enrollment.teacherId);
  const existingDates = new Set(store.lessons.map((l) => l.scheduledDate));

  const result = overrideLessonDateInPlace({
    lesson,
    newDate,
    newTime,
    force,
    allEnrollmentLessons: store.lessons,
    weeklyDays: store.enrollment.weeklyDays,
    blockedDates,
    existingDates,
  });
  if (!result.ok) return result;

  store.lessons = store.lessons.map((l) =>
    l.id === lessonId ? result.value.updatedLesson : l,
  );
  store.enrollment = { ...store.enrollment, endDate: result.value.recomputedEndDate };

  return { ok: true, value: result.value.updatedLesson };
}
