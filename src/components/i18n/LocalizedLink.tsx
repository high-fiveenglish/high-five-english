import { Link, type LinkProps } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { localizePath } from "../../i18n/paths";

/** Drop-in replacement for react-router's `Link` that automatically prefixes public-page
 * targets with the current language (and leaves protected-page targets like /classroom
 * untouched) — see src/i18n/paths.ts. Use this for every internal `to="/..."` link. */
export function LocalizedLink({ to, ...props }: LinkProps) {
  const { lang } = useLanguage();
  const target = typeof to === "string" ? localizePath(to, lang) : to;
  return <Link to={target} {...props} />;
}
