import { useState } from "react";
import { X, ChevronDown } from "lucide-react";
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
  const { isLoggedIn, userName, logout } = useAuth();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      <div className="absolute inset-0 bg-brand-950/50" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <Logo compact />
          <button
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X size={22} />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-4">
          {isLoggedIn ? (
            <div className="space-y-2.5 text-sm">
              <p className="font-semibold text-brand-950">
                <span className="text-accent-500">{userName}</span>님, 환영합니다
              </p>
              <div className="flex flex-wrap gap-2">
                <NavItemLink
                  href="/admin"
                  onClick={onClose}
                  className="rounded-full bg-brand-50 px-3.5 py-1.5 font-medium text-brand-700"
                >
                  홈페이지관리
                </NavItemLink>
                <NavItemLink
                  href="/mypage"
                  onClick={onClose}
                  className="rounded-full bg-brand-50 px-3.5 py-1.5 font-medium text-brand-700"
                >
                  정보변경
                </NavItemLink>
                <button
                  onClick={() => {
                    logout();
                    onClose();
                  }}
                  className="rounded-full bg-slate-100 px-3.5 py-1.5 font-medium text-slate-600"
                >
                  로그아웃
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
                로그인
              </button>
              <button
                onClick={() => {
                  onOpenFind();
                  onClose();
                }}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600"
              >
                ID/PW 찾기
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <div key={item.label} className="border-b border-slate-50 last:border-0">
              {item.children ? (
                <>
                  <button
                    onClick={() =>
                      setOpenGroup((g) => (g === item.label ? null : item.label))
                    }
                    className="flex w-full items-center justify-between px-3.5 py-3.5 text-[15px] font-semibold text-brand-950"
                  >
                    {item.label}
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition ${
                        openGroup === item.label ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {openGroup === item.label && (
                    <div className="pb-2 pl-6">
                      {item.children.map((child) => (
                        <NavItemLink
                          key={child.label}
                          href={child.href}
                          onClick={onClose}
                          className="block py-2 text-sm text-slate-500"
                        >
                          {child.label}
                        </NavItemLink>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <NavItemLink
                  href={item.href ?? "#"}
                  onClick={onClose}
                  className="block px-3.5 py-3.5 text-[15px] font-semibold text-brand-950"
                >
                  {item.label}
                </NavItemLink>
              )}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
