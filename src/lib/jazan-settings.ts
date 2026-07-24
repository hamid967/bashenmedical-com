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

export type IntroFrequency = "off" | "every_visit" | "once_per_session" | "once_per_period";

/**
 * Phase 11 — never-block path prefixes.
 * The intro is auto-skipped when the current pathname starts with any of these.
 * Admins can override via `intro.blockedPathPrefixes` (empty → use these defaults).
 */
export const DEFAULT_INTRO_BLOCKED_PREFIXES: readonly string[] = [
  "/book",
  "/auth",
  "/patient",
  "/admin",
  "/owner",
  "/verify",
  "/reservations/manage",
  "/api",
];

export type JazanSettings = {
  intro: {
    enabled: boolean;
    /** Phase 11: `once_per_session` is the recommended default. */
    frequency: IntroFrequency;
    /** Only used when frequency === "once_per_period". */
    cooldownHours: number;
    /** Phase 11 spec: 5000–8000 ms. */
    durationMs: number;
    headlineAr: string;
    headlineEn: string;
    taglineAr: string;
    taglineEn: string;
    /** Optional licensed logo override; empty falls back to bundled BMC logo. */
    logoUrl: string;
    /** Path prefixes where the intro must not appear. Empty → use defaults. */
    blockedPathPrefixes: string[];
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
    frequency: "once_per_session",
    cooldownHours: 24 * 7,
    durationMs: 6_500,
    headlineAr: "مجمع باعشن الطبي",
    headlineEn: "Baeshen Medical Center",
    taglineAr: "رعاية حديثة بروح جازان",
    taglineEn: "Modern care with the spirit of Jazan",
    logoUrl: "",
    blockedPathPrefixes: [],
    debug: false,
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
