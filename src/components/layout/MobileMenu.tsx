import { useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NAV_ITEMS } from "../../data/nav";
import { NavItemLink } from "./NavItemLink";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "./Logo";

export function MobileMenu({
  open,
  onClose,
  onOpenLogin,
  onOpenFind,
}: {
  open: boolean;
  onClose: () => void;
  onOpenLogin: () => void;
  onOpenFind: () => void;
}) {
  const { isLoggedIn, userName, role, logout } = useAuth();
  const { t } = useTranslation("common");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const isAdminLike = role === "general_manager" || role === "general_admin";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      <div className="absolute inset-0 bg-brand-950/50" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <Logo compact />
          <button
            onClick={onClose}
            aria-label={t("aria.close_menu")}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X size={22} />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-4">
          {isLoggedIn ? (
            <div className="space-y-2.5 text-sm">
              <p className="font-semibold text-brand-950">
                {t("topbar.welcome", { name: userName })}
              </p>
              <div className="flex flex-wrap gap-2">
                {role === "student" && (
                  <NavItemLink
                    href="/classroom"
                    onClick={onClose}
                    className="rounded-full bg-brand-50 px-3.5 py-1.5 font-medium text-brand-700"
                  >
                    {t("topbar.my_classroom")}
                  </NavItemLink>
                )}
                {role === "teacher" && (
                  <NavItemLink
                    href="/teacher"
                    onClick={onClose}
                    className="rounded-full bg-brand-50 px-3.5 py-1.5 font-medium text-brand-700"
                  >
                    {t("topbar.teacher_page")}
                  </NavItemLink>
                )}
                {isAdminLike && (
                  <NavItemLink
                    href="/admin"
                    onClick={onClose}
                    className="rounded-full bg-brand-50 px-3.5 py-1.5 font-medium text-brand-700"
                  >
                    {t("topbar.admin_manage")}
                  </NavItemLink>
                )}
                <NavItemLink
                  href="/mypage"
                  onClick={onClose}
                  className="rounded-full bg-brand-50 px-3.5 py-1.5 font-medium text-brand-700"
                >
                  {t("topbar.my_info")}
                </NavItemLink>
                <button
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="rounded-full bg-slate-100 px-3.5 py-1.5 font-medium text-slate-600"
                >
                  {t("topbar.logout")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onOpenLogin();
                  onClose();
                }}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white"
              >
                {t("topbar.login")}
              </button>
              <button
                onClick={() => {
                  onOpenFind();
                  onClose();
                }}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600"
              >
                {t("topbar.find_account")}
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <div key={item.labelKey} className="border-b border-slate-50 last:border-0">
              {item.children ? (
                <>
                  <button
                    onClick={() =>
                      setOpenGroup((g) => (g === item.labelKey ? null : item.labelKey))
                    }
                    className="flex w-full items-center justify-between px-3.5 py-3.5 text-[15px] font-semibold text-brand-950"
                  >
                    {t(item.labelKey)}
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition ${
                        openGroup === item.labelKey ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {openGroup === item.labelKey && (
                    <div className="pb-2 pl-6">
                      {item.children.map((child) => (
                        <NavItemLink
                          key={child.labelKey}
                          href={child.href}
                          scrollTo={child.scrollTo}
                          onClick={onClose}
                          className="block py-2 text-sm text-slate-500"
                        >
                          {t(child.labelKey)}
                        </NavItemLink>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <NavItemLink
                  href={item.href ?? "/"}
                  scrollTo={item.scrollTo}
                  onClick={onClose}
                  className="block px-3.5 py-3.5 text-[15px] font-semibold text-brand-950"
                >
                  {t(item.labelKey)}
                </NavItemLink>
              )}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
