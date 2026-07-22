/**
 * Jazan visual/heritage settings — stored in system_settings under key `jazan_visual`.
 * RLS: any authenticated user can SELECT; only super_admin can UPDATE.
 */
import { supabase } from "@/integrations/supabase/client";

export const JAZAN_SETTINGS_KEY = "jazan_visual";

export type JazanIntensity = "off" | "subtle" | "standard" | "featured";

export type JazanHeritageAreas = {
  header: boolean;
  home: boolean;
  portal: boolean;
  admin: boolean;
  footer: boolean;
};

export type JazanSettings = {
  intro: {
    enabled: boolean;
    cooldownHours: number;
    durationMs: number;
    headlineAr: string;
    headlineEn: string;
    taglineAr: string;
    taglineEn: string;
    /** Optional licensed logo override; empty falls back to bundled BMC logo. */
    logoUrl: string;
    /** When true, JazanIntro logs analytics events to the browser console. */
    debug: boolean;
  };
  patternIntensity: JazanIntensity;
  heritageAreas: JazanHeritageAreas;
  announcement: {
    enabled: boolean;
    messageAr: string;
    messageEn: string;
  };
};

export const DEFAULT_JAZAN_SETTINGS: JazanSettings = {
  intro: {
    enabled: true,
    cooldownHours: 24 * 7,
    durationMs: 10_000,
    headlineAr: "مجمع باعشن الطبي",
    headlineEn: "Baeshen Medical Center",
    taglineAr: "من جازان… نعتني بصحتكم",
    taglineEn: "From Jazan… we care for your health",
    logoUrl: "",
  },
  patternIntensity: "standard",
  heritageAreas: {
    header: true,
    home: true,
    portal: true,
    admin: false,
    footer: true,
  },
  announcement: {
    enabled: true,
    messageAr: "من قلب جازان، نقدم رعاية طبية بمعايير حديثة",
    messageEn: "From the heart of Jazan, delivering modern medical care",
  },
};

/** Deep-merge partial DB row with defaults so missing keys stay safe. */
export function mergeJazanSettings(raw: unknown): JazanSettings {
  const d = DEFAULT_JAZAN_SETTINGS;
  const r = (raw ?? {}) as Partial<JazanSettings>;
  return {
    intro: { ...d.intro, ...(r.intro ?? {}) },
    patternIntensity: (r.patternIntensity ?? d.patternIntensity) as JazanIntensity,
    heritageAreas: { ...d.heritageAreas, ...(r.heritageAreas ?? {}) },
    announcement: { ...d.announcement, ...(r.announcement ?? {}) },
  };
}

export async function loadJazanSettings(): Promise<JazanSettings> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", JAZAN_SETTINGS_KEY)
    .maybeSingle();
  return mergeJazanSettings(data?.value);
}

export async function saveJazanSettings(settings: JazanSettings) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("system_settings").upsert(
    {
      key: JAZAN_SETTINGS_KEY,
      value: JSON.parse(JSON.stringify(settings)),
      description: "Jazan visual identity, intro, announcement bar, heritage toggles",
      updated_by: userData.user?.id ?? null,
    },
    { onConflict: "key" },
  );
  if (error) throw error;
}

export const INTENSITY_MULTIPLIER: Record<JazanIntensity, number> = {
  off: 0,
  subtle: 0.5,
  standard: 1,
  featured: 1.4,
};
