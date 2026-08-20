import { createContext, useContext, useState, type ReactNode } from "react";
import type { Actor, PermissionKey, Role } from "../lib/auth/types";
import { login as loginRequest } from "../services/authService";

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
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(null);

  const login = async (id: string, password: string) => {
    const result = await loginRequest(id, password);
    if (!result.ok) return { ok: false as const, code: result.error.code };
    setActor(result.value.actor);
    setUserName(result.value.displayName);
    setPreferredLanguage(result.value.preferredLanguage ?? null);
    return { ok: true as const, role: result.value.actor.role };
  };

  const logout = () => {
    setActor(null);
    setUserName(null);
    setPreferredLanguage(null);
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
