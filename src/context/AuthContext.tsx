import { createContext, useContext, useState, type ReactNode } from "react";
import type { Actor, PermissionKey, Role } from "../lib/auth/types";
import {
  login as loginRequest,
  loginWithKakao as loginWithKakaoRequest,
  signup as signupRequest,
  type LoginResult,
  type SignupInput,
} from "../services/authService";
import type { StudentProfileSnapshot } from "../lib/realStudentBridge";

type AuthContextValue = {
  isLoggedIn: boolean;
  userName: string | null;
  role: Role | null;
  /** studentId for a student, teacherId for a teacher, null for admin/manager/logged-out. */
  userId: string | null;
  permissions: PermissionKey[];
  /** The single object every permission check (service-layer AND RouteGuard) is built
   * from — null while logged out. */
  actor: Actor | null;
  /** This account's stored UI language, read at login time. LanguageContext is the
   * source of truth for the ACTIVE language app-wide; this is only the seed value each
   * account brings with it on login (see LanguageContext for how it's applied/updated). */
  preferredLanguage: string | null;
  /** Resolves with the logged-in role on success, or an error code on failure — callers
   * translate the code themselves (see auth.json's login.* keys) rather than displaying
   * the raw mock-service message, which is only ever in Korean. */
  login: (id: string, password: string) => Promise<{ ok: true; role: Role } | { ok: false; code: string }>;
  /** Same shape as login(), but exchanges a Kakao authorization code instead of id/password —
   * used by KakaoCallbackPage after the user completes the Kakao consent screen. */
  loginWithKakao: (code: string, redirectUri: string) => Promise<{ ok: true; role: Role } | { ok: false; code: string }>;
  /** Same shape as login(), but creates a brand-new student account (see SignupPage) —
   * signup implies immediate login, so on success this hydrates the session exactly like
   * login()/loginWithKakao() do. */
  signup: (input: SignupInput) => Promise<{ ok: true; role: Role } | { ok: false; code: string }>;
  logout: () => void;
  /** True only when the current session was hydrated via the admin SSO bridge
   * (see SsoLoginPage) rather than a normal login — drives the "대리 로그인 중" banner. */
  isImpersonating: boolean;
  /** True whenever this session is backed by a real admin-DB student row — via the SSO
   * bridge (isImpersonating) OR a direct login with real credentials (see
   * authService.loginAsRealStudent). Unlike isImpersonating, this does NOT drive the
   * banner (a student logging in as themselves isn't "impersonation"), but it DOES drive
   * anything that needs to reach admin's real backend, e.g. the "정보변경" link pointing
   * at admin's actual profile page instead of the local placeholder. */
  isRealAccount: boolean;
  /** Set alongside isRealAccount — the signed bearer token the "정보변경" page uses to
   * read/write the real admin profile directly from this site (see
   * services/studentProfileService.ts). Null whenever isRealAccount is false. */
  studentApiToken: string | null;
  /** Set only for a general_admin/general_manager login whose id/password also matched a
   * real admin/AdminUser row — the Bearer token this site's own mock 관리자 패널
   * (/admin/pricing 등)이 실제 admin DB에 쓸 때 쓴다(admin_session 쿠키는 SameSite=Lax라
   * cross-origin fetch에는 실리지 않는다). Null for every other login. */
  adminApiToken: string | null;
  /** Set alongside adminApiToken — the one-time signed token the "홈페이지관리" link uses
   * to reach /api/public/admin-bridge via a real page navigation instead of the
   * cross-origin fetch that plants admin_session (which third-party-cookie blocking can
   * silently drop). Null whenever adminApiToken is null. */
  adminBridgeToken: string | null;
  /** The full editable profile, already fetched at login/SSO time — the "정보변경" page
   * reads this directly instead of making its own request, so it renders instantly with
   * no loading spinner. Kept in sync after a save via setStudentProfile. */
  studentProfile: StudentProfileSnapshot | null;
  setStudentProfile: (profile: StudentProfileSnapshot) => void;
  /** Sets the session directly from an already-verified Actor, bypassing authService.login —
   * used only by SsoLoginPage after admin's /api/public/sso/verify confirms the token. */
  hydrateActor: (
    actor: Actor,
    displayName: string,
    preferredLanguage?: string | null,
    studentApiToken?: string | null,
    studentProfile?: StudentProfileSnapshot | null,
  ) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [isRealAccount, setIsRealAccount] = useState(false);
  const [studentApiToken, setStudentApiToken] = useState<string | null>(null);
  const [adminApiToken, setAdminApiToken] = useState<string | null>(null);
  const [adminBridgeToken, setAdminBridgeToken] = useState<string | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfileSnapshot | null>(null);

  const applyLoginResult = (value: LoginResult) => {
    setActor(value.actor);
    setUserName(value.displayName);
    setPreferredLanguage(value.preferredLanguage ?? null);
    setIsImpersonating(false);
    setIsRealAccount(value.isRealAccount);
    setStudentApiToken(value.apiToken ?? null);
    setAdminApiToken(value.adminApiToken ?? null);
    setAdminBridgeToken(value.adminBridgeToken ?? null);
    setStudentProfile(value.profile ?? null);
    return { ok: true as const, role: value.actor.role };
  };

  const login = async (id: string, password: string) => {
    const result = await loginRequest(id, password);
    if (!result.ok) return { ok: false as const, code: result.error.code };
    return applyLoginResult(result.value);
  };

  const loginWithKakao = async (code: string, redirectUri: string) => {
    const result = await loginWithKakaoRequest(code, redirectUri);
    if (!result.ok) return { ok: false as const, code: result.code };
    return applyLoginResult(result.value);
  };

  const signup = async (input: SignupInput) => {
    const result = await signupRequest(input);
    if (!result.ok) return { ok: false as const, code: result.code };
    return applyLoginResult(result.value);
  };

  const logout = () => {
    setActor(null);
    setUserName(null);
    setPreferredLanguage(null);
    setIsImpersonating(false);
    setIsRealAccount(false);
    setStudentApiToken(null);
    setAdminApiToken(null);
    setAdminBridgeToken(null);
    setStudentProfile(null);
  };

  const hydrateActor = (
    nextActor: Actor,
    displayName: string,
    nextPreferredLanguage?: string | null,
    nextStudentApiToken?: string | null,
    nextStudentProfile?: StudentProfileSnapshot | null,
  ) => {
    setActor(nextActor);
    setUserName(displayName);
    setPreferredLanguage(nextPreferredLanguage ?? null);
    setIsImpersonating(true);
    setIsRealAccount(true);
    setStudentApiToken(nextStudentApiToken ?? null);
    setStudentProfile(nextStudentProfile ?? null);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: !!actor,
        userName,
        role: actor?.role ?? null,
        userId: actor?.linkedId ?? null,
        permissions: actor?.permissions ?? [],
        actor,
        preferredLanguage,
        login,
        loginWithKakao,
        signup,
        logout,
        isImpersonating,
        isRealAccount,
        studentApiToken,
        adminApiToken,
        adminBridgeToken,
        studentProfile,
        setStudentProfile,
        hydrateActor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
