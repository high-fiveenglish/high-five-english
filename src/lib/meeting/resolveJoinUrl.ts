import type { MeetingPlatformId } from "../../data/meetingPlatforms";
import type { Lesson } from "../scheduling/types";
import type { TeacherMeetingLinks } from "../../services/store";

/**
 * Resolution order for "what URL does this student's 수업 입장 button use":
 *   1. lesson.meetingUrl — a per-session override an admin/teacher registered for this
 *      one specific class (e.g. a substitute teacher, a one-off different room).
 *   2. teacherLinks[platform] — the enrollment's teacher's own fixed link for the
 *      enrollment's platform, registered once on the Teacher Dashboard.
 *   3. undefined — no link available yet ("입장 링크 준비 중").
 */
export function resolveJoinUrl(
  lesson: Lesson,
  teacherLinks: TeacherMeetingLinks | undefined,
  platform: MeetingPlatformId,
): string | undefined {
  if (lesson.meetingUrl) return lesson.meetingUrl;
  return teacherLinks?.[platform];
}
