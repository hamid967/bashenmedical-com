import { useEffect, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import i18n, {
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  syncClientLanguage,
  type Lang,
} from "@/lib/i18n/config";

export type { Lang };
export { SUPPORTED_LANGS, DEFAULT_LANG };

function normalizeLang(raw: string | undefined): Lang {
  if (!raw) return DEFAULT_LANG;
  const short = raw.toLowerCase().split("-")[0];
  return (SUPPORTED_LANGS as readonly string[]).includes(short) ? (short as Lang) : DEFAULT_LANG;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <I18nHtmlSync />
      {children}
    </I18nextProvider>
  );
}

function I18nHtmlSync() {
  const { i18n: inst } = useTranslation();
  const lang = normalizeLang(inst.language);
  // Apply the visitor's stored/detected language after hydration so the first
  // client paint matches the server (which always renders DEFAULT_LANG).
  useEffect(() => {
    syncClientLanguage();
  }, []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  return null;
}

/**
 * Backwards-compatible hook used across the app.
 * Under the hood this is now powered by i18next + JSON locale files
 * under `src/locales/{lang}/common.json`.
 */
export function useI18n() {
  const { t, i18n: inst } = useTranslation("common");
  const lang = normalizeLang(inst.language);
  return {
    lang,
    dir: (lang === "ar" ? "rtl" : "ltr") as "rtl" | "ltr",
    setLang: (l: Lang) => {
      void inst.changeLanguage(l);
      if (typeof window !== "undefined") localStorage.setItem("lang", l);
    },
    t: (key: string, params?: Record<string, string | number>) =>
      t(key, params as Record<string, unknown> | undefined) as string,
  };
}
