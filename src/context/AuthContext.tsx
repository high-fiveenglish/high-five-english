import { createContext, useContext, useState, type ReactNode } from "react";
import type { Actor, PermissionKey, Role } from "../lib/auth/types";
import { login as loginRequest } from "../services/authService";
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
  const [studentProfile, setStudentProfile] = useState<StudentProfileSnapshot | null>(null);

  const login = async (id: string, password: string) => {
    const result = await loginRequest(id, password);
    if (!result.ok) return { ok: false as const, code: result.error.code };
    setActor(result.value.actor);
    setUserName(result.value.displayName);
    setPreferredLanguage(result.value.preferredLanguage ?? null);
    setIsImpersonating(false);
    setIsRealAccount(result.value.isRealAccount);
    setStudentApiToken(result.value.apiToken ?? null);
    setAdminApiToken(result.value.adminApiToken ?? null);
    setStudentProfile(result.value.profile ?? null);
    return { ok: true as const, role: result.value.actor.role };
  };

  const logout = () => {
    setActor(null);
    setUserName(null);
    setPreferredLanguage(null);
    setIsImpersonating(false);
    setIsRealAccount(false);
    setStudentApiToken(null);
    setAdminApiToken(null);
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
        logout,
        isImpersonating,
        isRealAccount,
        studentApiToken,
        adminApiToken,
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
