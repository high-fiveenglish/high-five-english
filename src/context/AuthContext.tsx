import { createContext, useContext, useState, type ReactNode } from "react";
import { DEMO_STUDENT } from "../data/classroomMock";

type AuthContextValue = {
  isLoggedIn: boolean;
  userName: string | null;
  /** Demo limitation: there is no real per-user backend yet, so every login resolves
   * to the same seeded demo student id — this is what classroomService keys off. */
  userId: string | null;
  login: (name: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const login = (name: string) => {
    setUserName(name || "회원");
    setUserId(DEMO_STUDENT.id);
    setIsLoggedIn(true);
  };

  const logout = () => {
    setIsLoggedIn(false);
    setUserName(null);
    setUserId(null);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, userName, userId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
