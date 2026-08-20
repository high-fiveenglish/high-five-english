import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { DEFAULT_LANG, SUPPORTED_LANGUAGES } from "../../i18n/config";

// TODO: update to the real production domain once the site is deployed.
const SITE_URL = "https://www.hifiveenglish.com";

const OG_LOCALES: Record<string, string> = {
  ko: "ko_KR",
  en: "en_US",
  zh: "zh_CN",
  vi: "vi_VN",
};

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string, hreflang?: string) {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]`;
  let el = document.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Sets document title, meta description, canonical, hreflang alternates, and Open
 * Graph tags for a public/marketing page. Only used inside /:lang routes — protected
 * pages (classroom/teacher/admin) are never indexed, so they skip SEO entirely.
 */
export function SeoHead({
  titleKey,
  descriptionKey,
  ns,
  path,
}: {
  titleKey: string;
  descriptionKey: string;
  ns: string;
  path: string;
}) {
  const { t } = useTranslation(ns);
  const { lang } = useLanguage();

  useEffect(() => {
    const title = t(titleKey);
    const description = t(descriptionKey);
    document.title = title;
    setMeta("name", "description", description);

    const cleanPath = path === "/" ? "" : path;
    const canonicalUrl = `${SITE_URL}/${lang}${cleanPath}`;
    setLink("canonical", canonicalUrl);

    for (const { code } of SUPPORTED_LANGUAGES) {
      setLink("alternate", `${SITE_URL}/${code}${cleanPath}`, code);
    }
    setLink("alternate", `${SITE_URL}/${DEFAULT_LANG}${cleanPath}`, "x-default");

    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:locale", OG_LOCALES[lang] ?? "en_US");
  }, [t, titleKey, descriptionKey, lang, path]);

  return null;
}
