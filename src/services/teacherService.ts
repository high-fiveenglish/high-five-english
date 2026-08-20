// Teacher-facing mock service layer — every function is scoped to `actor.linkedId`
// (the teacher's own id) via requireOwnTeacher/requireRole, so a teacher account can
// never read or write another teacher's students, lessons, or meeting links.
import { findStudentName } from "./classroomService";
import { DEMO_COURSE } from "../data/classroomMock";
import type { MeetingPlatformId } from "../data/meetingPlatforms";
import { markAttendance } from "../lib/scheduling/engine";
import type { Enrollment, Lesson } from "../lib/scheduling/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requireOwnTeacher, requireRole } from "../lib/auth/permissions";
import { store, type TeacherMeetingLinks } from "./store";

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
      courseName: DEMO_COURSE.courseName,
    }));
  return okResult(rows);
}

export interface MyLessonRow extends Lesson {
  studentName: string;
  courseName: string;
  meetingPlatform: MeetingPlatformId;
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
        courseName: DEMO_COURSE.courseName,
        meetingPlatform: enrollment.meetingPlatform,
      };
    });
  return okResult(rows);
}

export async function markLessonAttendance(
  actor: Actor,
  lessonId: string,
  status: "completed" | "absent",
): Promise<ServiceResult<Lesson>> {
  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
  const enrollment = store.enrollments.find((e) => e.id === lesson.enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const guard = requireOwnTeacher(actor, enrollment.teacherId);
  if (!guard.ok) return guard;

  const { updatedLesson } = markAttendance(lesson, status);
  store.lessons = store.lessons.map((l) => (l.id === lessonId ? updatedLesson : l));
  store.enrollments = store.enrollments.map((e) =>
    e.id === enrollment.id ? { ...e, remainingLessons: e.remainingLessons - 1 } : e,
  );
  return okResult(updatedLesson);
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
