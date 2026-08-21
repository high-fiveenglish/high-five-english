// Level-test lead-capture service layer. submitLevelTestRequest posts to the real
// admin/LMS backend's public API (admin/src/app/api/public/level-test) — real leads now
// land in Postgres where the admin's "레벨테스트 신청/진행 관리" page manages them, not
// in this in-memory mock store. It's still public (no actor — a prospective student
// isn't logged in yet), and still re-validates every required field client-side before
// sending (the backend independently re-validates too, since it's a public endpoint).
// listLevelTestRequests/setLevelTestRequestStatus stay mock-backed for now — the old
// admin/notice-style panel at /admin/level-test-requests in this app will simply stop
// receiving new submissions; the admin/ Next.js app is the source of truth going forward.
import type { LessonFrequencyId, LevelTestRequest } from "../lib/community/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission } from "../lib/auth/permissions";
import type { MeetingPlatformId } from "../data/meetingPlatforms";
import { MEETING_PLATFORMS } from "../data/meetingPlatforms";
import { store } from "./store";
import { ADMIN_API_URL } from "../lib/adminApi";

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

  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/level-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactName: request.contactName,
        contactPhone: request.contactPhone,
        preferredTimeUTC: request.preferredTimeUTC,
        preferredTimeZone: request.preferredTimeZone,
        lessonFrequency: request.lessonFrequency,
        lessonDurationMin: request.lessonDurationMin,
        meetingPlatform: request.meetingPlatform,
        referredTeacherName: request.referredTeacherName,
        studentEnglishName: request.studentEnglishName,
        studentAge: request.studentAge,
      }),
    });
    if (!res.ok) {
      return errResult("NOT_FOUND", "신청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }

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
