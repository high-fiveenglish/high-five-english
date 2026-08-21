// Types for the three brand-new mock-DB "tables" added alongside the existing
// scheduling/auth ones: notices, real student reviews, and level-test lead requests.
// Kept in their own lib/*/types.ts file (no dependency on store.ts or any service) so
// both src/data/*Seed.ts and src/services/*.ts can import from here without a cycle —
// same layering as src/lib/auth/types.ts and src/lib/scheduling/types.ts.
import type { MeetingPlatformId } from "../../data/meetingPlatforms";

export interface Notice {
  id: string;
  title: string;
  content: string;
  authorAccountId: string;
  authorName: string;
  published: boolean;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** A real, student-authored review — distinct from the static marketing testimonials in
 * src/data/reviews.ts (ReviewMeta/REVIEWS), which are fixed, pre-translated copy with no
 * submission mechanism. studentEnglishName/teacherName are always resolved server-side
 * from the actor's own enrollment — never accepted as client input (see reviewService). */
export interface StudentReview {
  id: string;
  studentId: string;
  studentEnglishName: string;
  teacherId: string;
  teacherName: string;
  content: string;
  createdAt: string; // ISO datetime
  published: boolean;
}

export type LessonFrequencyId = "freq2" | "freq3" | "freq5";
export type LevelTestStatus = "new" | "contacted";

export interface LevelTestRequest {
  id: string;
  createdAt: string; // ISO datetime, submission time
  contactName: string;
  contactPhone: string;
  /** The requested class time as an absolute UTC instant — see src/lib/timezone.ts. */
  preferredTimeUTC: string;
  /** IANA zone the student was viewing/selecting in, e.g. "Asia/Shanghai". */
  preferredTimeZone: string;
  lessonFrequency: LessonFrequencyId;
  lessonDurationMin: 25 | 50;
  meetingPlatform: MeetingPlatformId;
  referredTeacherName?: string;
  studentEnglishName: string;
  studentAge: number;
  status: LevelTestStatus;
}

// A fixed-but-extensible set today (kakao/wechat/customerService) — adding a future
// channel (e.g. Line) is one literal added to this union plus one seed row, same
// extensibility pattern as MeetingPlatformId/SupportedLanguages elsewhere.
export type ConsultChannelId = "kakao" | "wechat" | "customerService";

export interface ConsultChannel {
  id: ConsultChannelId;
  /** Admin-entered label, e.g. "카카오톡 상담" — NOT translated; UI copy (the button
   * text/aria-label) is translated separately via i18n, keyed off `id`, not this field. */
  displayName: string;
  /** The channel's id/handle/phone number, shown as plain text. */
  value: string;
  /** Deep link or web URL to open the channel directly. Absent = no direct link yet;
   * callers must fall back to showing `value` with a copy button (see
   * consultChannelService.updateConsultChannel's URL validation). */
  url?: string;
  enabled: boolean;
}
