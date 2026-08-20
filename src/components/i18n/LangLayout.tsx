import { Navigate, Outlet, useParams } from "react-router-dom";
import { isSupportedLang } from "../../i18n/config";
import { useLanguage } from "../../context/LanguageContext";

/** Validates the `:lang` URL segment for every public route and renders its children.
 * An unsupported segment (typo, bookmarked old link, etc.) redirects to the same
 * "current" language LanguageContext already resolved (account/localStorage/browser). */
export function LangLayout() {
  const { lang } = useParams<{ lang: string }>();
  const { lang: activeLang } = useLanguage();

  if (!isSupportedLang(lang)) return <Navigate to={`/${activeLang}`} replace />;
  return <Outlet />;
}

/** The bare "/" root has no language segment — send visitors to their resolved language. */
export function RootRedirect() {
  const { lang } = useLanguage();
  return <Navigate to={`/${lang}`} replace />;
}
