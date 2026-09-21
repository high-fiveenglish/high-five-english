import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
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

/** The bare "/" root has no language segment — send visitors to their resolved language.
 * Query string(예: ?previewDomain=, UTM 파라미터 등)은 그대로 들고 넘어가야 한다 —
 * 안 그러면 이 리다이렉트 한 번으로 조용히 사라진다. */
export function RootRedirect() {
  const { lang } = useLanguage();
  const location = useLocation();
  return <Navigate to={`/${lang}${location.search}`} replace />;
}
