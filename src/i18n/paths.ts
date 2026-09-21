import type { Lang } from "./config";

// Routes behind login (student/teacher/admin) are never indexed by search engines, so
// they intentionally do NOT carry a /:lang prefix — their language comes from the
// logged-in account's own preference instead (see LanguageContext). Only public/
// marketing routes get locale-prefixed URLs for SEO.
const PROTECTED_PREFIXES = ["/classroom", "/reviews", "/teacher", "/admin", "/mypage", "/signup"];

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Builds the correct internal href for a given target path under the current language —
 * protected routes pass through unchanged, public routes get a /:lang prefix. */
export function localizePath(path: string, lang: Lang): string {
  if (isProtectedPath(path)) return path;
  if (path === "/") return `/${lang}`;
  return `/${lang}${path}`;
}
