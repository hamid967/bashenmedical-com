/**
 * JazanSettingsProvider — loads Jazan visual settings once and applies them:
 *  - sets --jazan-intensity CSS var on <html>
 *  - toggles heritage area classes (heritage-header/home/portal/admin/footer)
 *  - exposes settings via useJazanSettings()
 *
 * Failure is silent — defaults keep the site rendering.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_JAZAN_SETTINGS,
  INTENSITY_MULTIPLIER,
  loadJazanSettings,
  type JazanSettings,
} from "@/lib/jazan-settings";

const Ctx = createContext<JazanSettings>(DEFAULT_JAZAN_SETTINGS);

export function useJazanSettings() {
  return useContext(Ctx);
}

export function JazanSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<JazanSettings>(DEFAULT_JAZAN_SETTINGS);

  useEffect(() => {
    let mounted = true;
    loadJazanSettings()
      .then((s) => {
        if (mounted) setSettings(s);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty(
      "--jazan-intensity",
      String(INTENSITY_MULTIPLIER[settings.patternIntensity] ?? 1),
    );
    const areas: Array<[string, boolean]> = [
      ["heritage-header", settings.heritageAreas.header],
      ["heritage-home", settings.heritageAreas.home],
      ["heritage-portal", settings.heritageAreas.portal],
      ["heritage-admin", settings.heritageAreas.admin],
      ["heritage-footer", settings.heritageAreas.footer],
    ];
    for (const [cls, on] of areas) root.classList.toggle(cls, on);
  }, [settings]);

  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}
