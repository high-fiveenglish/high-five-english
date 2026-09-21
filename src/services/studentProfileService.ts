// admin의 공개 student-profile API(Authorization: Bearer 토큰)를 호출해, 마케팅
// 사이트의 "정보변경" 화면이 그 자리에서 바로 조회/저장할 수 있게 한다. 토큰은
// AuthContext.studentApiToken에서 받아온다(로그인/SSO 브릿지 시 발급됨).
import { ADMIN_API_URL } from "../lib/adminApi";
import type { StudentProfileSnapshot } from "../lib/realStudentBridge";

export type { StudentProfileSnapshot };

// 이 파일은 실제 admin 백엔드를 부르는 새 다리라 lib/auth/types의 ServiceResult(가짜
// 계정 시스템 전용, AuthErrorCode로 코드가 고정됨)를 그대로 쓰지 않고 자체 Result 타입을
// 둔다.
export type ProfileResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: "NETWORK_ERROR" | "SESSION_EXPIRED" | "REQUEST_FAILED"; message: string } };

function okResult<T>(value: T): ProfileResult<T> {
  return { ok: true, value };
}
function errResult<T>(code: "NETWORK_ERROR" | "SESSION_EXPIRED" | "REQUEST_FAILED", message: string): ProfileResult<T> {
  return { ok: false, error: { code, message } };
}

export type StudentProfileUpdateInput = Omit<StudentProfileSnapshot, "studentId" | "loginId" | "name" | "kakaoLinked"> & {
  newPassword: string;
  newPasswordConfirm: string;
};

async function callProfileApi(
  token: string,
  init: RequestInit,
): Promise<ProfileResult<StudentProfileSnapshot>> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/student-profile`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch {
    return errResult("NETWORK_ERROR", "관리자 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (res.status === 401) {
    return errResult("SESSION_EXPIRED", "세션이 만료되었습니다. 다시 로그인해주세요.");
  }
  if (!res.ok) {
    let message = "정보를 처리하지 못했습니다.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    return errResult("REQUEST_FAILED", message);
  }
  const data = (await res.json()) as StudentProfileSnapshot;
  return okResult(data);
}

export async function updateMyProfile(
  token: string,
  input: StudentProfileUpdateInput,
): Promise<ProfileResult<StudentProfileSnapshot>> {
  return callProfileApi(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** 카카오 연동(KakaoCallbackPage) 뒤 세션을 복구할 때 쓴다 — 토큰만 갖고 있고 나머지
 * 세션 상태(actor/studentProfile)는 카카오 리다이렉트로 날아간 상태라, 이 토큰으로
 * 최신 프로필을 다시 조회해 AuthContext.hydrateActor에 그대로 넘긴다. */
export async function getMyProfile(token: string): Promise<ProfileResult<StudentProfileSnapshot>> {
  return callProfileApi(token, { method: "GET" });
}

export type KakaoLinkResult =
  | { ok: true }
  | { ok: false; error: { code: "NETWORK_ERROR" | "ALREADY_LINKED" | "REQUEST_FAILED"; message: string } };

async function callKakaoLinkApi(token: string, init: RequestInit): Promise<KakaoLinkResult> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/kakao-link`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, error: { code: "NETWORK_ERROR", message: "관리자 서버에 연결할 수 없습니다." } };
  }
  if (res.status === 409) {
    return { ok: false, error: { code: "ALREADY_LINKED", message: "이미 다른 계정에 연동된 카카오 계정입니다." } };
  }
  if (!res.ok) {
    return { ok: false, error: { code: "REQUEST_FAILED", message: "요청을 처리하지 못했습니다." } };
  }
  return { ok: true };
}

export async function linkKakao(token: string, code: string, redirectUri: string): Promise<KakaoLinkResult> {
  return callKakaoLinkApi(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri }),
  });
}

export async function unlinkKakao(token: string): Promise<KakaoLinkResult> {
  return callKakaoLinkApi(token, { method: "DELETE" });
}
