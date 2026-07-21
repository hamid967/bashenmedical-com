import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import urCommon from "@/locales/ur/common.json";
import arBooking from "@/locales/ar/booking.json";
import enBooking from "@/locales/en/booking.json";

export const SUPPORTED_LANGS = ["ar", "en", "ur"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "ar";
// RTL languages — used by the i18n layout hook to set `dir="rtl"`.
export const RTL_LANGS: readonly Lang[] = ["ar", "ur"] as const;

export const resources = {
  ar: { common: arCommon, booking: arBooking },
  en: { common: enCommon, booking: enBooking },
  // Urdu currently ships only the `manage.undo.*` copy; all other keys
  // fall back to `DEFAULT_LANG` (ar) via i18next's fallbackLng.
  ur: { common: urCommon },
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
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    defaultNS: "common",
    ns: ["common", "booking"],
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
