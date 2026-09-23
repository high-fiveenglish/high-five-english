// i18next setup. Namespaces are code-split per language via Vite's import.meta.glob, so a
// Korean visitor never downloads the English/Chinese/Vietnamese JSON bundles. All namespaces
// for the ACTIVE language are loaded together (see ALL_NAMESPACES + i18nReady below) rather
// than lazily per-component — components that read arrays/objects via `returnObjects: true`
// (e.g. LevelTestModal's age group list) would otherwise crash on first paint if their
// namespace happened to still be loading. Adding a new language later is: add
// src/locales/{code}/*.json + one entry in SUPPORTED_LANGUAGES below — nothing else in the
// app needs to change.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import type { CurrencyCode } from "../data/currencies";

export interface SupportedLanguageInput {
  code: string;
  /** The language's own name for itself — never translated (한국어 stays 한국어 to a Chinese reader). */
  nativeName: string;
  flag: string;
  /** IANA zone the level-test modal shows class-time slots in for this language. Omit
   * for a language with no single associated country (e.g. "en") — the modal falls back
   * to the browser's own detected zone via lib/timezone.ts's detectLocalTimeZone(). */
  timeZone?: string;
  /** Currency the pricing section displays for this language. Omit for a language with
   * no single associated market (e.g. "en") — callers fall back to the business's own
   * currency (KRW), same convention as the timeZone fallback above. */
  currency?: CurrencyCode;
}

// `as const satisfies` derives a precise "ko"|"en"|"zh"|"vi" union for Lang below, the
// same extensibility pattern already used for MeetingPlatformId in data/meetingPlatforms.ts —
// adding a language here automatically widens Lang everywhere it's used.
export const SUPPORTED_LANGUAGES = [
  { code: "ko", nativeName: "한국어", flag: "🇰🇷", timeZone: "Asia/Seoul", currency: "KRW" },
  { code: "en", nativeName: "English", flag: "🇺🇸" },
  { code: "zh", nativeName: "中文", flag: "🇨🇳", timeZone: "Asia/Shanghai", currency: "CNY" },
  { code: "vi", nativeName: "Tiếng Việt", flag: "🇻🇳", timeZone: "Asia/Ho_Chi_Minh", currency: "VND" },
] as const satisfies SupportedLanguageInput[];

export type Lang = (typeof SUPPORTED_LANGUAGES)[number]["code"];
export type SupportedLanguage = SupportedLanguageInput;

function findLanguageEntry(lang: Lang): SupportedLanguageInput | undefined {
  return (SUPPORTED_LANGUAGES as readonly SupportedLanguageInput[]).find((l) => l.code === lang);
}

/** The IANA zone the level-test modal should show class-time slots in for `lang`, or
 * undefined if this language has no single associated market (caller decides the fallback —
 * see lib/timezone.ts's detectLocalTimeZone). */
export function getLanguageTimeZone(lang: Lang): string | undefined {
  return findLanguageEntry(lang)?.timeZone;
}

/** The currency the pricing section should display for `lang`, or undefined if this
 * language has no single associated market (callers fall back to "KRW", the business's
 * own currency). */
export function getLanguageCurrency(lang: Lang): CurrencyCode | undefined {
  return findLanguageEntry(lang)?.currency;
}

export const DEFAULT_LANG: Lang = "ko";
export const SUPPORTED_LANG_CODES: Lang[] = SUPPORTED_LANGUAGES.map((l) => l.code);

/** Admin pages currently only ship ko/en copy; teacher pages only ship en. Both are plain
 * arrays so adding a language there later is a one-line change, not a structural one. */
export const ADMIN_LANGUAGES: Lang[] = ["en", "ko"];
export const TEACHER_LANGUAGES: Lang[] = ["en"];

export function isSupportedLang(value: string | undefined): value is Lang {
  return !!value && (SUPPORTED_LANG_CODES as string[]).includes(value);
}

// Every namespace that exists under src/locales/{lang}/ — kept in sync with the folder
// contents. Declaring them all here (rather than only "common") makes i18next fetch the
// full set for the active language as part of init()/changeLanguage(), which is what
// i18nReady below waits on before the app renders.
const ALL_NAMESPACES = [
  "common",
  "auth",
  "home",
  "about",
  "program",
  "curriculum",
  "process",
  "enroll",
  "install",
  "platforms",
  "textbooks",
  "courses",
  "legal",
  "reviewBoard",
  "noticeBoard",
  "classroom",
  "admin",
  "teacher",
];

// namespace마다 개별 HTTP 요청을 보내던 것(언어당 최대 18개) 대신, 언어별로 미리
// 묶인 virtual module(vite.config.ts의 localeBundlePlugin이 생성 — 원본 namespace
// JSON 파일은 전혀 바뀌지 않는다)을 언어당 딱 1번만 가져오고, 이후 namespace
// 요청은 전부 그 결과에서 잘라서 돌려준다. i18next 쪽에서 보는 시그니처
// (language, namespace) => 데이터는 그대로라 t()/returnObjects 등 호출부는 무관하다.
const BUNDLE_IMPORTERS: Record<Lang, () => Promise<{ default: Record<string, Record<string, unknown>> }>> = {
  ko: () => import("virtual:locale-bundle/ko"),
  en: () => import("virtual:locale-bundle/en"),
  zh: () => import("virtual:locale-bundle/zh"),
  vi: () => import("virtual:locale-bundle/vi"),
};

// 같은 언어에 대해 bundle을 여러 번 fetch하지 않도록 Promise 자체를 캐시한다 —
// 아직 로딩 중인 bundle에 대해 여러 namespace가 동시에 요청해도 fetch는 1번만 나간다.
const bundleCache = new Map<string, Promise<Record<string, Record<string, unknown>>>>();

function loadLanguageBundle(language: string): Promise<Record<string, Record<string, unknown>>> {
  let cached = bundleCache.get(language);
  if (!cached) {
    const importer = BUNDLE_IMPORTERS[language as Lang];
    cached = importer ? importer().then((mod) => mod.default) : Promise.resolve({});
    bundleCache.set(language, cached);
  }
  return cached;
}

/** Resolves once the active language's full namespace set has loaded — main.tsx waits on
 * this before mounting <App/>, so no component can render before its translations exist. */
export const i18nReady = i18n
  .use(
    resourcesToBackend(async (language: string, namespace: string) => {
      const bundle = await loadLanguageBundle(language);
      return bundle[namespace] ?? {};
    }),
  )
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANG,
    supportedLngs: SUPPORTED_LANG_CODES,
    defaultNS: "common",
    ns: ALL_NAMESPACES,
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "hifive_lang",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
    // No Suspense boundaries anywhere in this codebase today — components just
    // re-render (react-i18next listens for the load event) once a namespace arrives.
    react: { useSuspense: false },
  });

export default i18n;
