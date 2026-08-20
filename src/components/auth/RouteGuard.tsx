import type { ReactNode } from "react";
import { LogIn, ShieldAlert } from "lucide-react";
import { Container } from "../ui/Container";
import { useAuth } from "../../context/AuthContext";
import type { PermissionKey, Role } from "../../lib/auth/types";

function LoginPrompt({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <LogIn size={28} />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-brand-950">로그인이 필요한 페이지입니다</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        이 페이지를 보려면 먼저 로그인해주세요.
      </p>
      <button
        onClick={onOpenLogin}
        className="mt-8 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        로그인하기
      </button>
    </Container>
  );
}

function ForbiddenNotice() {
  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <ShieldAlert size={28} />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-brand-950">접근 권한이 없습니다</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        현재 계정에는 이 페이지를 볼 수 있는 권한이 없습니다. 필요한 경우 관리자에게
        권한 부여를 요청해주세요.
      </p>
    </Container>
  );
}

/** Page-level access control, driven by the exact same Actor/Role/PermissionKey data the
 * mock service layer checks — so a page's visibility and its underlying data access agree
 * with each other by construction. */
export function RouteGuard({
  allow,
  requirePermission,
  onOpenLogin,
  children,
}: {
  allow: Role[];
  requirePermission?: PermissionKey;
  onOpenLogin: () => void;
  children: ReactNode;
}) {
  const { isLoggedIn, actor } = useAuth();

  if (!isLoggedIn || !actor) return <LoginPrompt onOpenLogin={onOpenLogin} />;
  if (!allow.includes(actor.role)) return <ForbiddenNotice />;
  if (requirePermission) {
    const hasPermission =
      actor.role === "general_manager" ||
      (actor.role === "general_admin" && actor.permissions.includes(requirePermission));
    if (!hasPermission) return <ForbiddenNotice />;
  }

  return <>{children}</>;
}
