// Level-test lead-capture mock service layer. submitLevelTestRequest is public (no
// actor — a prospective student isn't logged in yet), but still re-validates every
// required field server-side so a direct API call can't bypass the form's client-side
// checks. listLevelTestRequests is the only admin-facing function and requires the
// "levelTest" permission, same pattern as every other admin*Service function.
import type { LessonFrequencyId, LevelTestRequest } from "../lib/community/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission } from "../lib/auth/permissions";
import type { MeetingPlatformId } from "../data/meetingPlatforms";
import { MEETING_PLATFORMS } from "../data/meetingPlatforms";
import { store } from "./store";

const VALID_FREQUENCIES: LessonFrequencyId[] = ["freq2", "freq3", "freq5"];
const VALID_DURATIONS = [25, 50];

export interface LevelTestRequestInput {
  contactName: string;
  contactPhone: string;
  preferredTimeUTC: string;
  preferredTimeZone: string;
  lessonFrequency: LessonFrequencyId;
  lessonDurationMin: 25 | 50;
  meetingPlatform: MeetingPlatformId;
  referredTeacherName?: string;
  studentEnglishName: string;
  studentAge: number;
}

function nextRequestId(): string {
  return `ltr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export async function submitLevelTestRequest(
  input: LevelTestRequestInput,
): Promise<ServiceResult<LevelTestRequest>> {
  if (
    !input.contactName.trim() ||
    !input.contactPhone.trim() ||
    !input.preferredTimeUTC ||
    !input.preferredTimeZone ||
    !VALID_FREQUENCIES.includes(input.lessonFrequency) ||
    !VALID_DURATIONS.includes(input.lessonDurationMin) ||
    !MEETING_PLATFORMS.some((p) => p.id === input.meetingPlatform) ||
    !input.studentEnglishName.trim() ||
    !Number.isInteger(input.studentAge) ||
    input.studentAge < 3 ||
    input.studentAge > 99
  ) {
    return errResult("NOT_FOUND", "필수 항목이 누락되었거나 값이 유효하지 않습니다.");
  }

  const request: LevelTestRequest = {
    id: nextRequestId(),
    createdAt: new Date().toISOString(),
    contactName: input.contactName.trim(),
    contactPhone: input.contactPhone.trim(),
    preferredTimeUTC: input.preferredTimeUTC,
    preferredTimeZone: input.preferredTimeZone,
    lessonFrequency: input.lessonFrequency,
    lessonDurationMin: input.lessonDurationMin,
    meetingPlatform: input.meetingPlatform,
    referredTeacherName: input.referredTeacherName?.trim() || undefined,
    studentEnglishName: input.studentEnglishName.trim(),
    studentAge: input.studentAge,
    status: "new",
  };
  store.levelTestRequests = [request, ...store.levelTestRequests];
  return okResult(request);
}

export async function listLevelTestRequests(
  actor: Actor | null,
): Promise<ServiceResult<LevelTestRequest[]>> {
  const guard = requirePermission(actor, "levelTest");
  if (!guard.ok) return guard;
  return okResult([...store.levelTestRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function setLevelTestRequestStatus(
  actor: Actor | null,
  id: string,
  status: LevelTestRequest["status"],
): Promise<ServiceResult<LevelTestRequest>> {
  const guard = requirePermission(actor, "levelTest");
  if (!guard.ok) return guard;

  const existing = store.levelTestRequests.find((r) => r.id === id);
  if (!existing) return errResult("NOT_FOUND", "신청 내역을 찾을 수 없습니다.");

  const updated = { ...existing, status };
  store.levelTestRequests = store.levelTestRequests.map((r) => (r.id === id ? updated : r));
  return okResult(updated);
}
