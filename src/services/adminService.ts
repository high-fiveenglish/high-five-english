// Admin/manager-facing mock service layer. Every function checks either a hard role
// (General Manager only) or a granted permission (requirePermission) before touching
// data — see src/lib/auth/permissions.ts. This is what a real API's admin routes would
// enforce once a backend exists.
import { ACCOUNTS, type Account } from "../data/accounts";
import { findStudentName } from "./classroomService";
import { DEMO_COURSE } from "../data/classroomMock";
import { INSTRUCTORS } from "../data/instructors";
import type { MeetingPlatformId } from "../data/meetingPlatforms";
import { computeBlockedDates, overrideLessonDateInPlace } from "../lib/scheduling/engine";
import type { ISODate, Lesson, RescheduleRequest } from "../lib/scheduling/types";
import type { EntryWindowSettings } from "../data/siteSettings";
import type { Actor, PermissionKey, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission, requireRole } from "../lib/auth/permissions";
import { store, type TeacherMeetingLinks } from "./store";

// --- accounts / permission grants (General Manager only) --------------------------

export interface AccountRow {
  id: string;
  name: string;
  role: Account["role"];
  linkedId: string | null;
  permissions: PermissionKey[];
}

export async function listAccounts(actor: Actor): Promise<ServiceResult<AccountRow[]>> {
  const guard = requireRole(actor, ["general_manager"]);
  if (!guard.ok) return guard;

  return okResult(
    ACCOUNTS.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      linkedId: a.linkedId,
      permissions: store.adminPermissionOverrides[a.id] ?? a.permissions ?? [],
    })),
  );
}

export async function updateAdminPermissions(
  actor: Actor,
  targetAccountId: string,
  permissions: PermissionKey[],
): Promise<ServiceResult<PermissionKey[]>> {
  const guard = requireRole(actor, ["general_manager"]);
  if (!guard.ok) return guard;

  const target = ACCOUNTS.find((a) => a.id === targetAccountId);
  if (!target) return errResult("NOT_FOUND", "계정을 찾을 수 없습니다.");
  if (target.role !== "general_admin") {
    return errResult("FORBIDDEN_ROLE", "일반 관리자 계정의 권한만 변경할 수 있습니다.");
  }

  store.adminPermissionOverrides = { ...store.adminPermissionOverrides, [targetAccountId]: permissions };
  return okResult(permissions);
}

// --- reschedule requests / manual date correction ("schedule" permission) ---------

export interface AdminRescheduleRow extends RescheduleRequest {
  studentName: string;
  courseName: string;
}

export async function listRescheduleRequests(actor: Actor): Promise<ServiceResult<AdminRescheduleRow[]>> {
  const guard = requirePermission(actor, "schedule");
  if (!guard.ok) return guard;

  const rows = [...store.rescheduleRequests]
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .map((r) => ({ ...r, studentName: findStudentName(r.studentId), courseName: DEMO_COURSE.courseName }));
  return okResult(rows);
}

export interface AdminLessonRow extends Lesson {
  studentName: string;
  teacherName: string;
  courseName: string;
}

export async function listSchedulableLessons(
  actor: Actor,
  filter?: { teacherId?: string; studentId?: string },
): Promise<ServiceResult<AdminLessonRow[]>> {
  const guard = requirePermission(actor, "schedule");
  if (!guard.ok) return guard;

  const enrollmentById = new Map(store.enrollments.map((e) => [e.id, e]));
  const rows = store.lessons
    .filter((l) => l.status === "scheduled")
    .map((l) => ({ lesson: l, enrollment: enrollmentById.get(l.enrollmentId) }))
    .filter((row): row is { lesson: Lesson; enrollment: NonNullable<typeof row.enrollment> } => !!row.enrollment)
    .filter(({ enrollment }) => !filter?.teacherId || enrollment.teacherId === filter.teacherId)
    .filter(({ enrollment }) => !filter?.studentId || enrollment.studentId === filter.studentId)
    .sort((a, b) => a.lesson.scheduledDate.localeCompare(b.lesson.scheduledDate))
    .map(({ lesson, enrollment }) => ({
      ...lesson,
      studentName: findStudentName(enrollment.studentId),
      teacherName: INSTRUCTORS.find((i) => i.id === enrollment.teacherId)?.name ?? enrollment.teacherId,
      courseName: DEMO_COURSE.courseName,
    }));
  return okResult(rows);
}

export async function overrideLessonDate(
  actor: Actor,
  lessonId: string,
  newDate: ISODate,
  newTime: string | undefined,
  force: boolean,
): Promise<ServiceResult<Lesson>> {
  const guard = requirePermission(actor, "schedule");
  if (!guard.ok) return guard;

  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
  const enrollment = store.enrollments.find((e) => e.id === lesson.enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const blockedDates = computeBlockedDates(store.closures, store.teacherUnavailability, enrollment.teacherId);
  const existingDates = new Set(
    store.lessons.filter((l) => l.enrollmentId === enrollment.id).map((l) => l.scheduledDate),
  );

  const result = overrideLessonDateInPlace({
    lesson,
    newDate,
    newTime,
    force,
    allEnrollmentLessons: store.lessons,
    weeklyDays: enrollment.weeklyDays,
    blockedDates,
    existingDates,
  });
  if (!result.ok) return result;

  store.lessons = store.lessons.map((l) => (l.id === lessonId ? result.value.updatedLesson : l));
  store.enrollments = store.enrollments.map((e) =>
    e.id === enrollment.id ? { ...e, endDate: result.value.recomputedEndDate } : e,
  );
  return okResult(result.value.updatedLesson);
}

// --- enrollments overview ("meetingLinks" permission — used by the meeting-settings
// page's student/platform picker) ---------------------------------------------------

export interface EnrollmentRow {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  meetingPlatform: MeetingPlatformId;
}

export async function listEnrollments(actor: Actor): Promise<ServiceResult<EnrollmentRow[]>> {
  const guard = requirePermission(actor, "meetingLinks");
  if (!guard.ok) return guard;

  const rows = store.enrollments.map((e) => ({
    enrollmentId: e.id,
    studentId: e.studentId,
    studentName: findStudentName(e.studentId),
    teacherId: e.teacherId,
    teacherName: INSTRUCTORS.find((i) => i.id === e.teacherId)?.name ?? e.teacherId,
    meetingPlatform: e.meetingPlatform,
  }));
  return okResult(rows);
}

// --- meeting platforms / links ("meetingLinks" permission) ------------------------

export async function setPlatformEnabled(
  actor: Actor,
  id: MeetingPlatformId,
  enabled: boolean,
): Promise<ServiceResult<void>> {
  const guard = requirePermission(actor, "meetingLinks");
  if (!guard.ok) return guard;
  store.platformEnabled = { ...store.platformEnabled, [id]: enabled };
  return okResult(undefined);
}

export async function updateEnrollmentMeetingPlatform(
  actor: Actor,
  enrollmentId: string,
  platformId: MeetingPlatformId,
): Promise<ServiceResult<void>> {
  const guard = requirePermission(actor, "meetingLinks");
  if (!guard.ok) return guard;
  const exists = store.enrollments.some((e) => e.id === enrollmentId);
  if (!exists) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");
  store.enrollments = store.enrollments.map((e) =>
    e.id === enrollmentId ? { ...e, meetingPlatform: platformId } : e,
  );
  return okResult(undefined);
}

export async function updateLessonMeetingUrl(
  actor: Actor,
  lessonId: string,
  meetingUrl: string,
): Promise<ServiceResult<Lesson>> {
  const guard = requirePermission(actor, "meetingLinks");
  if (!guard.ok) return guard;
  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
  const updatedLesson = { ...lesson, meetingUrl };
  store.lessons = store.lessons.map((l) => (l.id === lessonId ? updatedLesson : l));
  return okResult(updatedLesson);
}

export interface TeacherLinksRow {
  teacherId: string;
  teacherName: string;
  links: TeacherMeetingLinks;
}

export async function listTeacherMeetingLinks(actor: Actor): Promise<ServiceResult<TeacherLinksRow[]>> {
  const guard = requirePermission(actor, "meetingLinks");
  if (!guard.ok) return guard;

  const teacherIds = new Set(store.enrollments.map((e) => e.teacherId));
  const rows = [...teacherIds].map((teacherId) => ({
    teacherId,
    teacherName: INSTRUCTORS.find((i) => i.id === teacherId)?.name ?? teacherId,
    links: store.teacherMeetingLinks[teacherId] ?? {},
  }));
  return okResult(rows);
}

export async function updateTeacherMeetingLinkAsAdmin(
  actor: Actor,
  teacherId: string,
  platformId: MeetingPlatformId,
  url: string,
): Promise<ServiceResult<TeacherMeetingLinks>> {
  const guard = requirePermission(actor, "meetingLinks");
  if (!guard.ok) return guard;

  const current = store.teacherMeetingLinks[teacherId] ?? {};
  const next = { ...current, [platformId]: url.trim() || undefined };
  store.teacherMeetingLinks = { ...store.teacherMeetingLinks, [teacherId]: next };
  return okResult(next);
}

// --- entry-window timing ("siteSettings" permission) -------------------------------

export async function updateEntryWindowSettings(
  actor: Actor,
  settings: EntryWindowSettings,
): Promise<ServiceResult<EntryWindowSettings>> {
  const guard = requirePermission(actor, "siteSettings");
  if (!guard.ok) return guard;
  store.entryWindow = settings;
  return okResult(settings);
}
