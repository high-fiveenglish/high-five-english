// Level-test request service layer. submitLevelTestRequest posts to the real admin/LMS
// backend's public API (admin/src/app/api/public/level-test) — requests land in Postgres
// where the admin's "레벨테스트 신청/진행 관리" page manages them, not in this in-memory
// mock store. 레벨테스트 신청은 로그인이 필수라는 정책으로 바뀌면서, 이 호출은 항상 실제
// 학생 계정의 studentApiToken을 Authorization 헤더로 실어 보낸다 — 그래야 admin 쪽이
// 그 신청을 실제 studentId에 바로 연결해, 관리자 화면에 "회원으로 로그인"·연락처 등과
// 함께 정상적으로 보인다(토큰 없이 보내면 서버가 401로 거부한다). 그래도 보내기 전에
// 모든 필수 항목을 다시 한 번 클라이언트에서 검증한다(백엔드도 공개 엔드포인트라 독립적으로
// 재검증하지만, 이중 방어).
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

export type LevelTestEligibility =
  | { eligible: true }
  | { eligible: false; reason: "pending"; sinceLevelTestId: number }
  | { eligible: false; reason: "cooldown"; eligibleAt: string; lastConductedAt: string };

export type MyLevelTestRow = {
  id: number;
  appliedAt: string;
  scheduledTestDate: string | null;
  progressStatus: string;
  teacherName: string | null;
  recommendedLevel: string | null;
  recommendedTextbook: string | null;
  resultContent: string | null;
  resultContentTranslated: string | null;
  resultContentTranslatedLang: string | null;
  // 다섯 영역 모두 채점된 경우에만 값이 들어간다(admin 쪽과 동일한 규칙) — 레이더
  // 차트가 부분 점수로 그려지는 것을 막기 위함.
  scores: {
    listening: number;
    speakingFluency: number;
    speakingGrammar: number;
    vocabulary: number;
    completion: number;
  } | null;
};

// "내 강의실 > 레벨테스트신청/레벨테스트결과" 탭이 함께 쓴다 — 신청 탭은 eligibility로
// 지금 신청 가능한지 판단하고, 결과 탭은 tests 목록을 그대로 보여준다.
export async function fetchMyLevelTests(
  studentApiToken: string,
): Promise<ServiceResult<{ eligibility: LevelTestEligibility; tests: MyLevelTestRow[] }>> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/level-test/mine`, {
      headers: { Authorization: `Bearer ${studentApiToken}` },
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (res.status === 401) {
    return errResult("UNAUTHENTICATED", "세션이 만료되었습니다. 다시 로그인해주세요.");
  }
  if (!res.ok) {
    return errResult("NOT_FOUND", "레벨테스트 정보를 불러오지 못했습니다.");
  }
  const data = (await res.json()) as { eligibility: LevelTestEligibility; tests: MyLevelTestRow[] };
  return okResult(data);
}

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
  studentApiToken: string,
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

  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/level-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentApiToken}` },
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
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }

  if (res.status === 401) {
    return errResult("UNAUTHENTICATED", "세션이 만료되었습니다. 다시 로그인해주세요.");
  }
  if (res.status === 409) {
    // 정상적인 경로에서는 신청 탭이 미리 eligibility를 확인해 신청 불가능하면 버튼
    // 자체를 막아두므로 이 분기는 방어용(레이스 컨디션 등)이다 — 그래도 어떤 이유로
    // 막혔는지는 구분해둔다.
    let reason: string | undefined;
    try {
      reason = ((await res.json()) as { error?: string }).error;
    } catch {
      /* ignore */
    }
    return errResult(
      "NOT_FOUND",
      reason === "cooldown_active"
        ? "레벨테스트 재신청 대기 기간입니다. 최근 레벨테스트 완료 후 6개월이 지나야 다시 신청할 수 있습니다."
        : "이미 진행 중인 레벨테스트 신청이 있습니다. 중복 신청할 수 없습니다.",
    );
  }
  if (!res.ok) {
    return errResult("NOT_FOUND", "신청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
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
