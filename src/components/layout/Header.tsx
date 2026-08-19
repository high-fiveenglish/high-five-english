import { useState } from "react";
import { Menu } from "lucide-react";
import { TopUtilityBar } from "./TopUtilityBar";
import { MainNav } from "./MainNav";
import { MobileMenu } from "./MobileMenu";
import { Logo } from "./Logo";
import { LoginModal } from "../modals/LoginModal";
import { FindAccountModal } from "../modals/FindAccountModal";

export function Header() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const openLogin = () => {
    setFindOpen(false);
    setLoginOpen(true);
  };
  const openFind = () => {
    setLoginOpen(false);
    setFindOpen(true);
  };

  return (
    <>
      <TopUtilityBar onOpenLogin={openLogin} onOpenFind={openFind} />

      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-5 py-3.5 sm:px-8 sm:py-4">
          <Logo />
        </div>

        <div className="relative border-t border-slate-100">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-2 sm:px-4">
            <div className="flex-1" />
            <MainNav />
            <div className="flex flex-1 items-center justify-end py-2.5">
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="메뉴 열기"
                className="rounded-lg p-2 text-brand-950 md:hidden"
              >
                <Menu size={24} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <MobileMenu
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onOpenLogin={openLogin}
        onOpenFind={openFind}
      />
      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSwitchToFind={openFind}
      />
      <FindAccountModal open={findOpen} onClose={() => setFindOpen(false)} />
    </>
  );
}
