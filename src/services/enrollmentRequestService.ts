// "수강등록" (course registration) lead-capture service — posts to the real admin/LMS
// backend's public API (admin/src/app/api/public/enrollment-requests), same real-DB
// bridge pattern as levelTestService.ts. Submission requires login: EnrollmentRegisterPage
// gates the form itself behind a real student account, and this call always sends the
// studentApiToken as Authorization: Bearer — the backend rejects it with 401 otherwise,
// as a second line of defense.
import type {
  CurriculumTrack,
  EnrollmentDurationId,
  EnrollmentRequest,
} from "../lib/community/types";
import type { LessonFrequencyId } from "../lib/community/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import type { MeetingPlatformId } from "../data/meetingPlatforms";
import { MEETING_PLATFORMS } from "../data/meetingPlatforms";
import { store } from "./store";
import { ADMIN_API_URL } from "../lib/adminApi";
import { ALL_CURRICULUM_TRACKS } from "../data/curriculumTracks";

const VALID_FREQUENCIES: LessonFrequencyId[] = ["freq2", "freq3", "freq5"];
const VALID_DURATIONS: EnrollmentDurationId[] = ["1m", "3m", "6m"];
const VALID_TRACKS: CurriculumTrack[] = ALL_CURRICULUM_TRACKS;
const VALID_LESSON_LENGTHS = [25, 50];

// 0=Sun..6=Sat, matching Enrollment.weeklyDays' own convention. Days aren't picked by
// the student — a fixed pattern per frequency, with anything else (weekends, a mixed
// pattern) routed to the academy directly (see EnrollmentRegisterPage's manager-contact
// note) rather than modeled here.
const WEEKDAYS_BY_FREQUENCY: Record<LessonFrequencyId, number[]> = {
  freq5: [1, 2, 3, 4, 5],
  freq3: [1, 3, 5],
  freq2: [2, 4],
};

export function weeklyDaysForFrequency(frequency: LessonFrequencyId): number[] {
  return WEEKDAYS_BY_FREQUENCY[frequency];
}

/** Public — a guest browsing the price/point preview has no balance either, so this
 * returns 0 rather than an error for any non-student actor (the form itself is gated
 * behind login for actually submitting, but the point preview is shown either way). */
export async function getMyPointBalance(actor: Actor | null): Promise<number> {
  if (!actor || actor.role !== "student" || !actor.linkedId) return 0;
  return store.studentPoints[actor.linkedId] ?? 0;
}

export interface EnrollmentRequestInput {
  meetingPlatform: MeetingPlatformId;
  /** Required only when meetingPlatform === "teams". */
  teamsId?: string;
  curriculumTrack: CurriculumTrack;
  durationId: EnrollmentDurationId;
  lessonFrequency: LessonFrequencyId;
  lessonDurationMin: 25 | 50;
  preferredStartDate: string;
  preferredStartTimeKST: string;
  /** Whether the "적립금 할인 적용" checkbox was marked — the full current balance is
   * captured onto the request for admin to verify/apply; nothing is deducted here. */
  useAllPoints: boolean;
  pointBalance: number;
}

export async function submitEnrollmentRequest(
  input: EnrollmentRequestInput,
  studentApiToken: string,
): Promise<ServiceResult<EnrollmentRequest>> {
  if (
    !MEETING_PLATFORMS.some((p) => p.id === input.meetingPlatform) ||
    (input.meetingPlatform === "teams" && !input.teamsId?.trim()) ||
    !VALID_TRACKS.includes(input.curriculumTrack) ||
    !VALID_DURATIONS.includes(input.durationId) ||
    !VALID_FREQUENCIES.includes(input.lessonFrequency) ||
    !VALID_LESSON_LENGTHS.includes(input.lessonDurationMin) ||
    !input.preferredStartDate ||
    !input.preferredStartTimeKST
  ) {
    return errResult("NOT_FOUND", "필수 항목이 누락되었거나 값이 유효하지 않습니다.");
  }

  const pointsToUse = input.useAllPoints ? input.pointBalance : 0;

  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/enrollment-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentApiToken}` },
      body: JSON.stringify({
        meetingPlatform: input.meetingPlatform,
        teamsId: input.meetingPlatform === "teams" ? input.teamsId?.trim() : undefined,
        curriculumTrack: input.curriculumTrack,
        durationId: input.durationId,
        lessonFrequency: input.lessonFrequency,
        lessonDurationMin: input.lessonDurationMin,
        preferredStartDate: input.preferredStartDate,
        preferredStartTimeKST: input.preferredStartTimeKST,
        pointsToUse,
      }),
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }

  if (res.status === 401) {
    return errResult("UNAUTHENTICATED", "세션이 만료되었습니다. 다시 로그인해주세요.");
  }
  if (!res.ok) {
    return errResult("NOT_FOUND", "신청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

  const data = (await res.json()) as { id: number };
  return okResult({
    id: String(data.id),
    createdAt: new Date().toISOString(),
    meetingPlatform: input.meetingPlatform,
    teamsId: input.meetingPlatform === "teams" ? input.teamsId?.trim() : undefined,
    curriculumTrack: input.curriculumTrack,
    durationId: input.durationId,
    lessonFrequency: input.lessonFrequency,
    lessonDurationMin: input.lessonDurationMin,
    weeklyDays: weeklyDaysForFrequency(input.lessonFrequency),
    preferredStartDate: input.preferredStartDate,
    preferredStartTimeKST: input.preferredStartTimeKST,
    pointsToUse,
    status: "new",
  });
}
