import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES, type Lang } from "../../i18n/config";
import { useLanguage } from "../../context/LanguageContext";

/** Reused for the public/student selector (all 4 languages), the admin selector
 * (en/ko only), and the teacher selector (en only, extensible) — the option set is
 * entirely driven by `allowedLanguages`, never hardcoded per area. */
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
  const rootRef = useRef<HTMLDivElement>(null);

  const options = SUPPORTED_LANGUAGES.filter((l) => allowedLanguages.includes(l.code));
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (options.length <= 1) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
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

      {open && (
        <div
          className={`absolute z-50 mt-2 w-40 overflow-hidden rounded-xl border border-slate-100 bg-white py-1.5 shadow-[0_12px_32px_rgba(20,44,88,0.14)] ${
            variant === "icon" ? "right-0" : "right-0"
          }`}
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
        </div>
      )}
    </div>
  );
}
