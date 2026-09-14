// Types for the three brand-new mock-DB "tables" added alongside the existing
// scheduling/auth ones: notices, real student reviews, and level-test lead requests.
// Kept in their own lib/*/types.ts file (no dependency on store.ts or any service) so
// both src/data/*Seed.ts and src/services/*.ts can import from here without a cycle —
// same layering as src/lib/auth/types.ts and src/lib/scheduling/types.ts.
import type { MeetingPlatformId } from "../../data/meetingPlatforms";

/** A teacher-only bulletin — read via noticeService.listNoticesForTeacher, which
 * requires an authenticated teacher actor. Never shown to students or guests. */
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

/** A public, student/visitor-facing announcement shown both as a card in the homepage's
 * Notices section (see HomeNoticesSection) and as a row on the public notice board (see
 * NoticeBoardPage). Real backend (admin/src/app/api/public/home-notices) — the public
 * GET (no auth) only returns published notices and omits author/published (nothing to
 * show a guest); the admin-authenticated GET (Vite's own /admin/home-notices panel, via
 * adminApiToken) returns every notice with those two extra fields included. Distinct
 * from Notice above, which is teacher-only. */
export interface HomeNotice {
  id: string;
  title: string;
  content: string;
  /** Present only in the admin-authenticated listing. */
  authorName?: string;
  /** Present only in the admin-authenticated listing. */
  published?: boolean;
  createdAt: string; // ISO datetime
  views: number;
}

/** One post on the public review board (see ReviewBoardPage) — either a top-level
 * review (parentId undefined) or a reply to one (parentId = the top-level post's id,
 * shown nested under it like a classic bulletin board's "RE" row). Real backend
 * (admin/src/app/api/public/reviews) — only a logged-in real student account can write;
 * reading the board also requires login. No homepage curation/featuring exists anymore
 * (removed — the board is only visible after login, never on the public homepage). */
export interface ReviewPost {
  id: string;
  parentId?: string;
  title: string;
  content: string;
  authorName: string;
  createdAt: string; // ISO datetime
  views: number;
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

/** "{ageGroup}:{field}", e.g. "adult:business" — see data/curriculumTracks.ts for the
 * valid age groups/fields and which combinations exist. Kept as a plain string (rather
 * than a template-literal union) since it round-trips through the admin DB's single
 * String column as-is. */
export type CurriculumTrack = string;
// Matches PricingDuration's ids in data/pricing.ts (1/3/6-month packages) — kept as its
// own literal union here (rather than importing PricingDuration) since this is a fixed
// set of purchasable plan lengths, not the admin-editable pricing data itself.
export type EnrollmentDurationId = "1m" | "3m" | "6m";
export type EnrollmentRequestStatus = "new" | "contacted" | "converted" | "cancelled";

/** A prospective/returning student's "수강등록" (course registration) request — posted to
 * the real admin/LMS backend (admin/src/app/api/public/enrollment-requests), same
 * real-DB bridge pattern as LevelTestRequest. Only a logged-in real student account can
 * submit (EnrollmentRegisterPage gates the form behind login); admin reviews it and
 * creates the actual Enrollment/takes payment separately in admin/의 수강신청 관리 화면.
 * `weeklyDays` is auto-derived from `lessonFrequency` (see
 * enrollmentRequestService.weeklyDaysForFrequency) rather than picked by the student —
 * anyone wanting a different pattern is directed to contact the academy directly. */
export interface EnrollmentRequest {
  id: string;
  createdAt: string; // ISO datetime
  meetingPlatform: MeetingPlatformId;
  /** Required only when meetingPlatform === "teams". */
  teamsId?: string;
  curriculumTrack: CurriculumTrack;
  durationId: EnrollmentDurationId;
  lessonFrequency: LessonFrequencyId;
  lessonDurationMin: 25 | 50;
  weeklyDays: number[]; // 0=Sun..6=Sat, derived from lessonFrequency
  preferredStartDate: string; // ISODate
  /** Wall-clock Korea Standard Time, e.g. "14:30" — always KST regardless of who's
   * submitting, per the academy's own scheduling (unlike LevelTestRequest, which
   * converts to UTC from the visitor's own zone). */
  preferredStartTimeKST: string;
  /** Loyalty points the student asked to apply as a discount — an admin manually
   * verifies and deducts the balance when finalizing the real enrollment; submitting
   * this request does not by itself change studentPoints. */
  pointsToUse: number;
  status: EnrollmentRequestStatus;
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
