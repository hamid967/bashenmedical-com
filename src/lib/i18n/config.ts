import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import urCommon from "@/locales/ur/common.json";
import arBooking from "@/locales/ar/booking.json";
import enBooking from "@/locales/en/booking.json";
import urBooking from "@/locales/ur/booking.json";
import arPrograms from "@/locales/ar/programs.json";
import enPrograms from "@/locales/en/programs.json";
import urPrograms from "@/locales/ur/programs.json";
import arFooter from "@/locales/ar/footer.json";
import enFooter from "@/locales/en/footer.json";
import arHeader from "@/locales/ar/header.json";
import enHeader from "@/locales/en/header.json";
import arDoctorAutocomplete from "@/locales/ar/doctorAutocomplete.json";
import enDoctorAutocomplete from "@/locales/en/doctorAutocomplete.json";

// Primary UI languages — surfaced in the language switcher and used across
// the app to key layout/direction. Adding a code here forces every
// `Record<Lang, ...>` in the codebase to add a branch, so we keep this narrow
// and register extended locales (see EXTRA_LOCALES) in i18next only.
export const SUPPORTED_LANGS = ["ar", "en"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "ar";

// Extended locales registered with i18next but not part of the `Lang` union.
// Users who call `i18n.changeLanguage("ur")` get these translations; any
// missing key falls back to DEFAULT_LANG (ar) via i18next's fallbackLng.
export const EXTRA_LOCALES = ["ur"] as const;
export const RTL_LOCALES: readonly string[] = ["ar", "ur"] as const;

export const resources = {
  ar: {
    common: arCommon,
    booking: arBooking,
    programs: arPrograms,
    footer: arFooter,
    header: arHeader,
    doctorAutocomplete: arDoctorAutocomplete,
  },
  en: {
    common: enCommon,
    booking: enBooking,
    programs: enPrograms,
    footer: enFooter,
    header: enHeader,
    doctorAutocomplete: enDoctorAutocomplete,
  },
  ur: { common: urCommon, booking: urBooking, programs: urPrograms },
} as const;

if (!i18n.isInitialized) {
  // IMPORTANT: initialize with DEFAULT_LANG on BOTH server and client so the
  // first client render matches the SSR HTML. If we used LanguageDetector at
  // init, a returning visitor with `localStorage["lang"] = "en"` would render
  // English on first paint while the server sent Arabic, causing a hydration
  // mismatch across every page that reads translations via `useI18n()`.
  // The detected language is applied AFTER hydration by `syncClientLanguage()`.
  i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LANG,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: [...SUPPORTED_LANGS, ...EXTRA_LOCALES] as string[],
    defaultNS: "common",
    ns: ["common", "booking", "programs", "footer", "header", "doctorAutocomplete"],
    interpolation: { escapeValue: false },
    returnNull: false,
    // Force synchronous init so t() returns real translations during SSR
    // instead of raw keys (fixes hydration mismatch e.g. "page.title" vs "احجز موعدك").
    initImmediate: false,
    react: { useSuspense: false },
  } as Parameters<typeof i18n.init>[0]);
}

/**
 * Read the visitor's stored language and apply it. MUST only be called from
 * `useEffect` after hydration, never during SSR or synchronous render.
 *
 * Intentionally:
 *  - ONLY honors an explicit `localStorage["lang"]` — never `navigator.language`.
 *    Navigator-based detection creates unavoidable SSR/hydration mismatches
 *    because the server cannot know the visitor's browser locale, and any
 *    Arabic-default page would flash to English for en-* browsers.
 *  - Defers the actual `changeLanguage` call via `setTimeout(..., 0)` so it
 *    runs strictly AFTER React has committed the initial hydration pass,
 *    even when nested Suspense boundaries hydrate progressively.
 */
export function syncClientLanguage(): void {
  if (typeof window === "undefined") return;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem("lang");
  } catch {
    /* localStorage may be blocked */
  }
  if (!stored) return; // no explicit preference → keep DEFAULT_LANG
  const next = (SUPPORTED_LANGS as readonly string[]).includes(stored)
    ? (stored as Lang)
    : DEFAULT_LANG;
  if (i18n.language === next) return;
  window.setTimeout(() => {
    if (i18n.language !== next) void i18n.changeLanguage(next);
  }, 0);
}
// Keep the LanguageDetector import referenced so tree-shaking / typecheck is
// stable if we later re-introduce it; we intentionally don't wire it into i18n
// init because it runs synchronously and would race hydration.
void LanguageDetector;

export default i18n;
