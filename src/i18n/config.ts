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

export interface SupportedLanguageInput {
  code: string;
  /** The language's own name for itself — never translated (한국어 stays 한국어 to a Chinese reader). */
  nativeName: string;
  flag: string;
}

// `as const satisfies` derives a precise "ko"|"en"|"zh"|"vi" union for Lang below, the
// same extensibility pattern already used for MeetingPlatformId in data/meetingPlatforms.ts —
// adding a language here automatically widens Lang everywhere it's used.
export const SUPPORTED_LANGUAGES = [
  { code: "ko", nativeName: "한국어", flag: "🇰🇷" },
  { code: "en", nativeName: "English", flag: "🇺🇸" },
  { code: "zh", nativeName: "中文", flag: "🇨🇳" },
  { code: "vi", nativeName: "Tiếng Việt", flag: "🇻🇳" },
] as const satisfies SupportedLanguageInput[];

export type Lang = (typeof SUPPORTED_LANGUAGES)[number]["code"];
export type SupportedLanguage = SupportedLanguageInput;

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
  "install",
  "platforms",
  "textbooks",
  "courses",
  "classroom",
  "admin",
  "teacher",
];

const localeModules = import.meta.glob<{ default: Record<string, unknown> }>("../locales/*/*.json");

/** Resolves once the active language's full namespace set has loaded — main.tsx waits on
 * this before mounting <App/>, so no component can render before its translations exist. */
export const i18nReady = i18n
  .use(
    resourcesToBackend(async (language: string, namespace: string) => {
      const path = `../locales/${language}/${namespace}.json`;
      const loader = localeModules[path];
      if (!loader) return {};
      const mod = await loader();
      return mod.default;
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
