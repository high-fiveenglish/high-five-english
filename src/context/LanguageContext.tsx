import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import i18n, { DEFAULT_LANG, isSupportedLang, type Lang } from "../i18n/config";
import { isProtectedPath } from "../i18n/paths";
import { useAuth } from "./AuthContext";
import { updatePreferredLanguage } from "../services/authService";

const STORAGE_KEY = "hifive_lang";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readUrlLang(pathname: string): Lang | null {
  const first = pathname.split("/")[1];
  return isSupportedLang(first) ? first : null;
}

function readInitialLang(preferredLanguage: string | null): Lang {
  if (isSupportedLang(preferredLanguage ?? undefined)) return preferredLanguage as Lang;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isSupportedLang(stored ?? undefined)) return stored as Lang;
  if (isSupportedLang(i18n.language)) return i18n.language;
  return DEFAULT_LANG;
}

/**
 * Independent from AuthContext by design (see plan doc §15): the ACTIVE language is
 * either (a) taken from the URL on public, locale-prefixed pages — so a shared /en/about
 * link always renders in English regardless of who's viewing it — or (b) the logged-in
 * account's own stored preference on protected pages (/classroom, /teacher, /admin/*),
 * which never leaks between accounts because it's read from that account's own record.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { actor, isLoggedIn, preferredLanguage } = useAuth();

  const urlLang = readUrlLang(location.pathname);
  const onProtectedPath = isProtectedPath(location.pathname);

  const [accountLang, setAccountLang] = useState<Lang>(() => readInitialLang(preferredLanguage));

  // Adopt the account's stored language whenever a login resolves one.
  useEffect(() => {
    if (isLoggedIn && isSupportedLang(preferredLanguage ?? undefined)) {
      setAccountLang(preferredLanguage as Lang);
    }
  }, [isLoggedIn, preferredLanguage]);

  const lang: Lang = urlLang ?? accountLang;

  useEffect(() => {
    if (i18n.language !== lang) void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setAccountLang(next);
    if (isLoggedIn && actor) void updatePreferredLanguage(actor, next);

    if (urlLang && !onProtectedPath) {
      // Public, locale-prefixed page: move to the same page under the new prefix so the
      // URL keeps accurately describing the language shown (important for SEO/sharing).
      const rest = location.pathname.slice(`/${urlLang}`.length) || "";
      navigate(`/${next}${rest}${location.search}`);
    }
  };

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
