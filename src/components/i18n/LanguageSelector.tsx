import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES, type Lang } from "../../i18n/config";
import { useLanguage } from "../../context/LanguageContext";

const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 8;

/** Reused for the public/student selector (all 4 languages), the admin selector
 * (en/ko only), and the teacher selector (en only, extensible) — the option set is
 * entirely driven by `allowedLanguages`, never hardcoded per area.
 *
 * The dropdown is rendered into a portal on `document.body` with `position: fixed`,
 * not as an absolutely-positioned child of the trigger. The trigger lives inside
 * TopUtilityBar, a plain (non-positioned) `<div>` sibling of `<header>` — since
 * `<header>` is `sticky` with its own `z-index`, a same-context, equal-z-index sibling
 * dropdown loses the paint order to whichever of the two comes later in the DOM
 * (`<header>` does), so it gets visually covered no matter how high its own z-index is
 * set, short of also out-stacking every other header/nav/modal on the site. Portaling
 * to `<body>` sidesteps every ancestor's stacking context, `overflow`, and `transform`
 * entirely, and lets us position from real viewport coordinates so the menu can flip
 * above the trigger or clamp horizontally when it would run off-screen. */
export function LanguageSelector({
  allowedLanguages,
  variant = "full",
}: {
  allowedLanguages: Lang[];
  /** "full": flag + native name + chevron (desktop topbar). "icon": globe icon only (mobile). */
  variant?: "full" | "icon";
}) {
  const { t } = useTranslation("common");
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const options = SUPPORTED_LANGUAGES.filter((l) => allowedLanguages.includes(l.code));
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? options[0];

  // Measures the trigger + (already-mounted-but-possibly-still-null-positioned) menu,
  // then clamps/flips so the menu always stays fully inside the viewport.
  const measure = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    let left = triggerRect.right - menuRect.width;
    left = Math.min(left, window.innerWidth - menuRect.width - VIEWPORT_MARGIN);
    left = Math.max(left, VIEWPORT_MARGIN);

    let top = triggerRect.bottom + TRIGGER_GAP;
    const overflowsBottom = top + menuRect.height > window.innerHeight - VIEWPORT_MARGIN;
    const fitsAbove = triggerRect.top - menuRect.height - TRIGGER_GAP > VIEWPORT_MARGIN;
    if (overflowsBottom && fitsAbove) {
      top = triggerRect.top - menuRect.height - TRIGGER_GAP;
    }

    setPos({ top, left });
  };

  // Runs before paint: on open, the menu first mounts invisibly (pos is still null) so
  // it can be measured, then this immediately re-renders it at the real position —
  // no visible flicker since both happen within the same layout-effect pass.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) setOpen(false);
    };
    // Scrolling can move the trigger (or a scrollable ancestor) out from under a
    // fixed-position menu; closing on scroll is simpler and more predictable than
    // trying to track every possible scroll container.
    const onScroll = () => setOpen(false);
    const onResize = () => measure();
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onEscape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (options.length <= 1) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("language_selector.aria_label")}
        aria-expanded={open}
        className={
          variant === "icon"
            ? "flex items-center justify-center rounded-lg p-2 text-brand-950"
            : "flex items-center gap-1 transition hover:text-white"
        }
      >
        {variant === "icon" ? (
          <Globe size={20} />
        ) : (
          <>
            <Globe size={13} />
            <span>
              {current?.flag} {current?.nativeName}
            </span>
            <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              // Stays invisible for the one measurement frame before `pos` is known,
              // then becomes visible in place — avoids a flash at the wrong spot.
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-[999] w-40 overflow-hidden rounded-xl border border-slate-100 bg-white py-1.5 shadow-[0_12px_32px_rgba(20,44,88,0.14)]"
          >
            {options.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => {
                  setLang(option.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm transition hover:bg-brand-50 ${
                  option.code === lang ? "font-bold text-brand-700" : "text-slate-600"
                }`}
              >
                <span>{option.flag}</span>
                <span>{option.nativeName}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
