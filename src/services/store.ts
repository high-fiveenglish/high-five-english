// The single in-memory "database" shared by every service module (classroomService,
// teacherService, adminService, authService). There is no real backend yet — this
// module stands in for one, seeded once from src/data/classroomMock.ts using the actual
// scheduling engine. All mutations happen through service functions, never here.
import {
  CLASSROOM_SEED,
  INITIAL_TEACHER_MEETING_LINKS,
  CLOSURES,
  TEACHER_UNAVAILABILITY,
} from "../data/classroomMock";
import { MEETING_PLATFORMS, type MeetingPlatformId } from "../data/meetingPlatforms";
import { DEFAULT_ENTRY_WINDOW, type EntryWindowSettings } from "../data/siteSettings";
import type {
  ClosureDate,
  DailyEvaluation,
  Enrollment,
  Lesson,
  RescheduleRequest,
  TeacherUnavailability,
} from "../lib/scheduling/types";
import type { PermissionKey } from "../lib/auth/types";

export type TeacherMeetingLinks = Partial<Record<MeetingPlatformId, string>>;

export const store = {
  enrollments: [...CLASSROOM_SEED.enrollments] as Enrollment[],
  lessons: [...CLASSROOM_SEED.lessons] as Lesson[],
  evaluations: [...CLASSROOM_SEED.evaluations] as DailyEvaluation[],
  rescheduleRequests: [...CLASSROOM_SEED.rescheduleRequests] as RescheduleRequest[],
  platformEnabled: Object.fromEntries(
    MEETING_PLATFORMS.map((p) => [p.id, p.enabled]),
  ) as Record<MeetingPlatformId, boolean>,
  // Each teacher's own fixed zoom/voov/teams links — the primary source for a student's
  // "수업 입장" button once a teacher has registered them (see lib/meeting/resolveJoinUrl).
  teacherMeetingLinks: cloneLinks(INITIAL_TEACHER_MEETING_LINKS),
  closures: [...CLOSURES] as ClosureDate[],
  teacherUnavailability: [...TEACHER_UNAVAILABILITY] as TeacherUnavailability[],
  entryWindow: { ...DEFAULT_ENTRY_WINDOW } as EntryWindowSettings,
  // Permission grants a General Manager has changed for a given admin account, keyed by
  // accountId — overlays (never mutates) the base `permissions` on that Account record in
  // src/data/accounts.ts, same "overlay, don't mutate the static catalog" pattern already
  // used for platformEnabled above.
  adminPermissionOverrides: {} as Record<string, PermissionKey[]>,
};

function cloneLinks(
  links: Record<string, TeacherMeetingLinks>,
): Record<string, TeacherMeetingLinks> {
  const out: Record<string, TeacherMeetingLinks> = {};
  for (const [teacherId, byPlatform] of Object.entries(links)) out[teacherId] = { ...byPlatform };
  return out;
}
