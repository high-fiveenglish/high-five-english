// Mock login. Looks up a fixed account list instead of the old "any non-empty id/password
// succeeds" behavior — a deliberate change so the new role/permission system has
// something real to check against. Still async, matching every other service function,
// so this can be swapped for a real API call later without touching call sites.
import { ACCOUNTS } from "../data/accounts";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { store } from "./store";
import { ADMIN_API_URL, getTenantDomain } from "../lib/adminApi";
import { linkedIdForRealStudent, type RealStudentData, type StudentProfileSnapshot } from "../lib/realStudentBridge";

export interface LoginResult {
  actor: Actor;
  displayName: string;
  /** Undefined only for an account that has never had a language recorded at all. */
  preferredLanguage: string | undefined;
  /** True when this session is backed by a real admin-DB student row (either logged in
   * here directly, or bridged in via SSO) rather than one of the fixture ACCOUNTS below —
   * drives things like the "정보변경" link pointing at admin's real profile page. */
  isRealAccount: boolean;
  /** Bearer token for admin's public student-profile API (see studentApiToken.ts on the
   * admin side) — only ever set alongside isRealAccount: true. */
  apiToken: string | null;
  /** Full editable profile, already fetched — lets "정보변경" render with no loading
   * spinner. Only set alongside isRealAccount: true. */
  profile: StudentProfileSnapshot | null;
  /** Bearer token for admin's public write APIs (pricing/home-notices/consult-channels/
   * reviews), set only when a general_admin/general_manager login's id/password also
   * matched a real admin/AdminUser row (see bridgeAdminSession). Null otherwise. */
  adminApiToken: string | null;
  /** One-time signed token for /api/public/admin-bridge — the "홈페이지관리" link uses
   * this (instead of a bare ADMIN_API_URL) so the admin_session cookie gets planted via
   * an actual page navigation, not a cross-origin fetch that third-party-cookie blocking
   * would silently drop. Set alongside adminApiToken, null otherwise. */
  adminBridgeToken: string | null;
}

// "홈페이지관리" 클릭 시 실제 admin 앱(:3001)이 별도 로그인 화면을 또 띄우는 문제
// (버퍼링처럼 느껴짐)를 없애기 위해, general_admin/general_manager로 로그인할 때
// 같은 아이디·비밀번호로 admin의 공개 admin-login API도 한 번 시도해본다. 그
// 자격증명이 실제 AdminUser(예: 시드된 admin/0000)와 일치하면 (1) 이 사이트 자체
// 관리자 패널(/admin/pricing 등)이 실제 DB에 쓸 때 쓸 adminApiToken을 받고, (2)
// "홈페이지관리" 링크가 재로그인 없이 바로 admin 대시보드로 들어가는 데 쓸
// adminBridgeToken도 함께 받는다. admin-login 응답에서 admin_session 쿠키를
// 크로스 오리진으로 바로 심어보긴 하지만(SameSite=Lax), 서드파티 쿠키를 막는
// 브라우저에서는 조용히 저장되지 않으므로 adminBridgeToken을 통한 페이지 이동
// 경로(TopUtilityBar.tsx → /api/public/admin-bridge)가 실제 보장 수단이다. Vite에만
// 있는 나머지 데모 계정(admin1, manager 등)은 애초에 AdminUser에 대응 행이 없어 그냥
// 조용히 실패하고, 예전처럼 admin 앱 자체 로그인 화면이 뜨며 두 토큰 모두 null로
// 남는다 — 실패해도 Vite 로그인 자체에는 전혀 영향이 없다.
async function bridgeAdminSession(
  loginId: string,
  password: string,
): Promise<{ apiToken: string | null; bridgeToken: string | null }> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/admin-login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    });
    if (!res.ok) return { apiToken: null, bridgeToken: null };
    const data = (await res.json()) as { apiToken?: string; bridgeToken?: string };
    return { apiToken: data.apiToken ?? null, bridgeToken: data.bridgeToken ?? null };
  } catch {
    return { apiToken: null, bridgeToken: null };
  }
}

// 데모 계정 목록(ACCOUNTS)에 없는 아이디는 실제 admin DB의 학생 계정일 수 있으므로,
// admin의 공개 로그인 API로 한 번 더 시도해본다. 성공하면 admin 도메인에 진짜
// student_session 쿠키가 함께 발급되고("정보변경"이 그 쿠키로 admin 실제 페이지에
// 바로 들어갈 수 있게 됨), 이 세션에서 쓸 임시 Enrollment도 realStudentBridge가
// 채워준다.
function loginResultFromRealStudent(data: RealStudentData): LoginResult {
  const linkedId = linkedIdForRealStudent(data.studentId);
  const actor: Actor = { role: "student", accountId: linkedId, linkedId, permissions: [] };
  return {
    actor,
    displayName: data.englishName || data.name,
    preferredLanguage: undefined,
    isRealAccount: true,
    apiToken: data.apiToken,
    profile: data.profile,
    adminApiToken: null,
    adminBridgeToken: null,
  };
}

async function loginAsRealStudent(loginId: string, password: string): Promise<LoginResult | null> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/student-login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as RealStudentData;
  return loginResultFromRealStudent(data);
}

// 카카오 로그인은 ACCOUNTS 픽스처를 거치지 않는 별도 경로라, authService의 나머지
// 함수가 쓰는 ServiceResult<AuthErrorCode>가 아니라 이 자체 결과 타입을 쓴다
// (studentProfileService.ts의 ProfileResult와 같은 이유).
export type KakaoLoginResult =
  | { ok: true; value: LoginResult }
  | { ok: false; code: "NOT_LINKED" | "NETWORK_ERROR" | "FAILED"; message: string };

export type SignupInput = {
  name: string;
  loginId: string;
  password: string;
  englishName?: string;
  mobilePhone?: string;
  email?: string;
  consultRoute?: string;
  preferredClassMethod?: string;
  region?: string;
  wechatId?: string;
  kakaoId?: string;
  referrerId?: string;
};

export type SignupResult =
  | { ok: true; value: LoginResult }
  | {
      ok: false;
      code: "LOGIN_ID_TAKEN" | "PASSWORD_TOO_SHORT" | "MISSING_FIELDS" | "NETWORK_ERROR" | "FAILED";
      message: string;
    };

/** 마케팅 사이트 자체 회원가입 화면(SignupPage)이 쓴다. 가입=자동 로그인이라 성공
 * 응답은 student-login과 같은 모양(RealStudentData)으로 온다. */
export async function signup(input: SignupInput): Promise<SignupResult> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/student-signup`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      // 접속 도메인을 실어 보내 서버가 협력사를 자동 판별하게 한다(회원가입 화면이
      // 그 협력사 사이트에서 열렸는지는 서버가 직접 매칭해 확인 — 클라이언트가
      // agentId를 스스로 주장하게 하지 않는다).
      body: JSON.stringify({ ...input, domain: getTenantDomain() }),
    });
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "관리자 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." };
  }
  if (res.status === 409) {
    return { ok: false, code: "LOGIN_ID_TAKEN", message: "이미 사용 중인 아이디입니다." };
  }
  if (res.status === 400) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    if (errBody.error === "password_too_short") {
      return { ok: false, code: "PASSWORD_TOO_SHORT", message: "비밀번호는 4자 이상이어야 합니다." };
    }
    return { ok: false, code: "MISSING_FIELDS", message: "필수 항목을 모두 입력해주세요." };
  }
  if (!res.ok) {
    return { ok: false, code: "FAILED", message: "회원가입에 실패했습니다." };
  }
  const data = (await res.json()) as RealStudentData;
  return { ok: true, value: loginResultFromRealStudent(data) };
}

/** 카카오 로그인 콜백(KakaoCallbackPage)이 받은 인가코드로 admin의 카카오 로그인
 * 엔드포인트를 호출한다 — 연동된 계정이 없으면 NOT_LINKED를 돌려주고, 호출부
 * (KakaoCallbackPage)가 이걸 안내 문구로 보여준다. */
export async function loginWithKakao(code: string, redirectUri: string): Promise<KakaoLoginResult> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/kakao-login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirectUri }),
    });
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "관리자 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." };
  }
  if (res.status === 404) {
    return { ok: false, code: "NOT_LINKED", message: "연동된 카카오 계정이 없습니다." };
  }
  if (!res.ok) {
    return { ok: false, code: "FAILED", message: "카카오 로그인에 실패했습니다." };
  }
  const data = (await res.json()) as RealStudentData;
  return { ok: true, value: loginResultFromRealStudent(data) };
}

// 협력사 관리자(mnmenglish/synergyenglish 등) 로그인 — 데모 계정 목록(ACCOUNTS)에도
// 학생 테이블에도 없는 진짜 AdminUser(role=AGENT) 계정만 여기로 들어온다. HQ의
// general_admin/general_manager 브릿지(bridgeAdminSession)와 달리, 이 로그인 자체가
// admin-login 성공 여부로 판정된다(별도 데모 자격증명이 없으므로).
async function loginAsRealAdmin(loginId: string, password: string): Promise<LoginResult | null> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/admin-login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as { apiToken?: string; bridgeToken?: string; role?: string; name?: string };
  if (data.role !== "AGENT") return null; // ADMIN/MANAGER 계정은 이 경로로 로그인하지 않는다(별도 데모 계정 흐름).

  const actor: Actor = { role: "agent", accountId: `agent:${loginId}`, linkedId: null, permissions: [] };
  return {
    actor,
    displayName: data.name ?? loginId,
    preferredLanguage: undefined,
    isRealAccount: false,
    apiToken: null,
    profile: null,
    adminApiToken: data.apiToken ?? null,
    adminBridgeToken: data.bridgeToken ?? null,
  };
}

export async function login(id: string, password: string): Promise<ServiceResult<LoginResult>> {
  const account = ACCOUNTS.find((a) => a.id === id);
  if (!account) {
    const real = await loginAsRealStudent(id, password);
    if (real) return okResult(real);
    const realAdmin = await loginAsRealAdmin(id, password);
    if (realAdmin) return okResult(realAdmin);
    return errResult("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  if (account.password !== password) {
    return errResult("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  let adminApiToken: string | null = null;
  let adminBridgeToken: string | null = null;
  if (account.role === "general_admin" || account.role === "general_manager") {
    const bridged = await bridgeAdminSession(id, password);
    adminApiToken = bridged.apiToken;
    adminBridgeToken = bridged.bridgeToken;
  }
  const grantedPermissions = store.adminPermissionOverrides[account.id] ?? account.permissions ?? [];
  const actor: Actor = {
    role: account.role,
    accountId: account.id,
    linkedId: account.linkedId,
    permissions: grantedPermissions,
  };
  const preferredLanguage = store.preferredLanguageOverrides[account.id] ?? account.preferredLanguage;
  return okResult({
    actor,
    displayName: account.name,
    preferredLanguage,
    isRealAccount: false,
    apiToken: null,
    profile: null,
    adminApiToken,
    adminBridgeToken,
  });
}

/** Persists a language choice against the logged-in account — independent per account,
 * so one user's change never affects any other user's stored preference. */
export async function updatePreferredLanguage(actor: Actor, lang: string): Promise<ServiceResult<void>> {
  store.preferredLanguageOverrides = { ...store.preferredLanguageOverrides, [actor.accountId]: lang };
  return okResult(undefined);
}
