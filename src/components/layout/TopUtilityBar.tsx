import { useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { LocalizedLink } from "../i18n/LocalizedLink";
import { LanguageSelector } from "../i18n/LanguageSelector";
import { ADMIN_LANGUAGES, SUPPORTED_LANG_CODES, TEACHER_LANGUAGES } from "../../i18n/config";
import { isProtectedPath } from "../../i18n/paths";

export function TopUtilityBar({
  onOpenLogin,
  onOpenFind,
}: {
  onOpenLogin: () => void;
  onOpenFind: () => void;
}) {
  const { isLoggedIn, userName, role, logout } = useAuth();
  const { t } = useTranslation("common");
  const location = useLocation();
  const isAdminLike = role === "general_manager" || role === "general_admin";

  // Public pages support all 4 languages; admin/teacher areas ship a smaller, role-
  // appropriate set (see plan §1/§9) — the student /classroom area still gets all 4.
  const allowedLanguages = !isProtectedPath(location.pathname)
    ? SUPPORTED_LANG_CODES
    : isAdminLike
      ? ADMIN_LANGUAGES
      : role === "teacher"
        ? TEACHER_LANGUAGES
        : SUPPORTED_LANG_CODES;

  return (
    <div className="hidden border-b border-slate-100 bg-brand-950 sm:block">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-4 px-5 py-1.5 text-xs text-white/70 sm:px-8">
        {isLoggedIn ? (
          <>
            <span className="text-white/90">
              <Trans
                i18nKey="topbar.welcome"
                ns="common"
                values={{ name: userName }}
                components={{ b: <strong className="font-semibold text-accent-300" /> }}
              />
            </span>
            <span className="h-3 w-px bg-white/20" />
            <LocalizedLink to="/" className="transition hover:text-white">
              {t("topbar.home")}
            </LocalizedLink>
            {role === "student" && (
              <LocalizedLink to="/classroom" className="transition hover:text-white">
                {t("topbar.my_classroom")}
              </LocalizedLink>
            )}
            {role === "teacher" && (
              <LocalizedLink to="/teacher" className="transition hover:text-white">
                {t("topbar.teacher_page")}
              </LocalizedLink>
            )}
            {isAdminLike && (
              <LocalizedLink to="/admin" className="transition hover:text-white">
                {t("topbar.admin_manage")}
              </LocalizedLink>
            )}
            <LocalizedLink to="/mypage" className="transition hover:text-white">
              {t("topbar.my_info")}
            </LocalizedLink>
            <button onClick={logout} className="transition hover:text-white">
              {t("topbar.logout")}
            </button>
          </>
        ) : (
          <>
            <LocalizedLink to="/" className="transition hover:text-white">
              {t("topbar.home")}
            </LocalizedLink>
            <button onClick={onOpenLogin} className="transition hover:text-white">
              {t("topbar.login")}
            </button>
            <button onClick={onOpenFind} className="transition hover:text-white">
              {t("topbar.find_account")}
            </button>
          </>
        )}
        <span className="h-3 w-px bg-white/20" />
        <LanguageSelector allowedLanguages={allowedLanguages} />
      </div>
    </div>
  );
}
