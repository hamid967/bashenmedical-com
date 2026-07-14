import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import arBooking from "@/locales/ar/booking.json";
import enBooking from "@/locales/en/booking.json";

export const SUPPORTED_LANGS = ["ar", "en"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "ar";

export const resources = {
  ar: { common: arCommon, booking: arBooking },
  en: { common: enCommon, booking: enBooking },
} as const;

if (!i18n.isInitialized) {
  const chain = i18n.use(initReactI18next);
  if (typeof window !== "undefined") chain.use(LanguageDetector);
  chain.init({
    resources,
    lng: typeof window === "undefined" ? DEFAULT_LANG : undefined,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    defaultNS: "common",
    ns: ["common", "booking"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "htmlTag", "navigator"],
      lookupLocalStorage: "lang",
      caches: ["localStorage"],
    },
    returnNull: false,
  });
}

export default i18n;
