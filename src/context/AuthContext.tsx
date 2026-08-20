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
  /** Resolves with the logged-in role on success, or an error message on failure. */
  login: (id: string, password: string) => Promise<{ ok: true; role: Role } | { ok: false; message: string }>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const login = async (id: string, password: string) => {
    const result = await loginRequest(id, password);
    if (!result.ok) return { ok: false as const, message: result.error.message };
    setActor(result.value.actor);
    setUserName(result.value.displayName);
    return { ok: true as const, role: result.value.actor.role };
  };

  const logout = () => {
    setActor(null);
    setUserName(null);
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
