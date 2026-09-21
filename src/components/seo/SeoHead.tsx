import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { useTenant } from "../../context/TenantContext";
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
  // t()가 반환하는 문자열은 {{brandName}} 등을 포함할 수 있는데, 브랜드명이 나중에
  // (협력사 도메인 브랜딩 fetch 완료 후) 바뀌어도 이 이펙트의 의존성 배열엔 그 변화가
  // 안 잡혀서(같은 lang/titleKey) 재실행이 안 될 수 있다 — tenant를 의존성에 넣어
  // 브랜딩이 갱신될 때 document.title/메타도 함께 다시 계산되게 한다.
  const tenant = useTenant();

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
  }, [t, titleKey, descriptionKey, lang, path, tenant]);

  return null;
}
