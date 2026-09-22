import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LogIn, ShieldAlert } from "lucide-react";
import { Container } from "../ui/Container";
import { useAuth } from "../../context/AuthContext";
import type { PermissionKey, Role } from "../../lib/auth/types";

function LoginPrompt({ onOpenLogin }: { onOpenLogin: () => void }) {
  const { t } = useTranslation("common");
  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <LogIn size={28} />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-brand-950">{t("errors.login_required_title")}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        {t("errors.login_required_desc")}
      </p>
      <button
        onClick={onOpenLogin}
        className="mt-8 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        {t("errors.login_cta")}
      </button>
    </Container>
  );
}

function ForbiddenNotice() {
  const { t } = useTranslation("common");
  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <ShieldAlert size={28} />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-brand-950">{t("errors.forbidden_title")}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        {t("errors.forbidden_desc")}
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
  // 관리자(general_manager/general_admin/agent)는 강사·학생 권한을 모두 포괄하는
  // 최상위 계정이므로, 특정 role(student/teacher)에게만 열린 페이지라도 확인 차 항상
  // 볼 수 있어야 한다 — allow 목록에 없어도 role 자체가 admin류면 통과시킨다. 협력사
  // 관리자(agent)도 자기 협력사 게시판(예: 수강후기)을 볼 수 있어야 하므로 포함한다.
  // 세부 PermissionKey 검사(requirePermission)는 general_admin에 한해 그대로 유지된다.
  const isAdminLike =
    actor.role === "general_manager" || actor.role === "general_admin" || actor.role === "agent";
  if (!isAdminLike && !allow.includes(actor.role)) return <ForbiddenNotice />;
  if (requirePermission) {
    const hasPermission =
      actor.role === "general_manager" ||
      (actor.role === "general_admin" && actor.permissions.includes(requirePermission));
    if (!hasPermission) return <ForbiddenNotice />;
  }

  return <>{children}</>;
}
