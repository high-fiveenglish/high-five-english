// Mock login. Looks up a fixed account list instead of the old "any non-empty id/password
// succeeds" behavior — a deliberate change so the new role/permission system has
// something real to check against. Still async, matching every other service function,
// so this can be swapped for a real API call later without touching call sites.
import { ACCOUNTS } from "../data/accounts";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { store } from "./store";
import { ADMIN_API_URL } from "../lib/adminApi";
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
}

// "홈페이지관리" 클릭 시 실제 admin 앱(:3001)이 별도 로그인 화면을 또 띄우는 문제
// (버퍼링처럼 느껴짐)를 없애기 위해, general_admin/general_manager로 로그인할 때
// 같은 아이디·비밀번호로 admin의 공개 admin-login API도 한 번 시도해본다. 그
// 자격증명이 실제 AdminUser(예: 시드된 admin/0000)와 일치하면 (1) admin 도메인에
// 진짜 admin_session 쿠키가 심어져서 나중에 "홈페이지관리"를 열 때 admin 앱이 곧바로
// 대시보드를 보여주고, (2) 이 사이트 자체 관리자 패널(/admin/pricing 등)이 실제 DB에
// 쓸 때 쓸 adminApiToken도 함께 받는다(admin_session은 SameSite=Lax라 cross-origin
// fetch엔 안 실리므로 studentApiToken과 동일한 이유로 별도 토큰이 필요하다). Vite에만
// 있는 나머지 데모 계정(admin1, manager 등)은 애초에 AdminUser에 대응 행이 없어 그냥
// 조용히 실패하고, 예전처럼 admin 앱 자체 로그인 화면이 뜨며 adminApiToken은 null로
// 남는다 — 실패해도 Vite 로그인 자체에는 전혀 영향이 없다.
async function bridgeAdminSession(loginId: string, password: string): Promise<string | null> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/admin-login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { apiToken?: string };
    return data.apiToken ?? null;
  } catch {
    return null;
  }
}

// 데모 계정 목록(ACCOUNTS)에 없는 아이디는 실제 admin DB의 학생 계정일 수 있으므로,
// admin의 공개 로그인 API로 한 번 더 시도해본다. 성공하면 admin 도메인에 진짜
// student_session 쿠키가 함께 발급되고("정보변경"이 그 쿠키로 admin 실제 페이지에
// 바로 들어갈 수 있게 됨), 이 세션에서 쓸 임시 Enrollment도 realStudentBridge가
// 채워준다.
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
  };
}

export async function login(id: string, password: string): Promise<ServiceResult<LoginResult>> {
  const account = ACCOUNTS.find((a) => a.id === id);
  if (!account) {
    const real = await loginAsRealStudent(id, password);
    if (real) return okResult(real);
    return errResult("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  if (account.password !== password) {
    return errResult("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  let adminApiToken: string | null = null;
  if (account.role === "general_admin" || account.role === "general_manager") {
    adminApiToken = await bridgeAdminSession(id, password);
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
  });
}

/** Persists a language choice against the logged-in account — independent per account,
 * so one user's change never affects any other user's stored preference. */
export async function updatePreferredLanguage(actor: Actor, lang: string): Promise<ServiceResult<void>> {
  store.preferredLanguageOverrides = { ...store.preferredLanguageOverrides, [actor.accountId]: lang };
  return okResult(undefined);
}
