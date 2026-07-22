/**
 * Shared configuration surface for the cinematic intro (IntroOverlay).
 *
 * Content editors edit the "raw" shape (from Supabase); the overlay
 * hydrates it into the "resolved" shape by mapping icon names → Lucide
 * components. Only icons in ICON_MAP below are available in the editor.
 */
import {
  Stethoscope,
  Baby,
  HeartPulse,
  Bluetooth as Tooth,
  Eye,
  FlaskConical,
  Pill,
  Home,
  Video,
  CalendarCheck,
  Users,
  Award,
  Clock,
  Star,
  Activity,
  ShieldCheck,
  Building2,
  ClipboardList,
  HeartHandshake,
  Microscope,
  Syringe,
  type LucideIcon,
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  Stethoscope,
  Baby,
  HeartPulse,
  Tooth,
  Eye,
  FlaskConical,
  Pill,
  Home,
  Video,
  CalendarCheck,
  Users,
  Award,
  Clock,
  Star,
  Activity,
  ShieldCheck,
  Building2,
  ClipboardList,
  HeartHandshake,
  Microscope,
  Syringe,
};

export const ICON_OPTIONS = Object.keys(ICON_MAP).sort();

export type SceneKey = "pulse" | "brand" | "services" | "stats" | "booking" | "final";

export type RawService = {
  id: string;
  titleAr: string;
  titleEn: string;
  icon: string;
  /** Optional service illustration; lazy-loaded when the services scene appears. */
  image?: string;
  /** Optional short service video; lazy-loaded (preload="none") when the scene appears. */
  video?: string;
};

export type RawStatMetric = {
  id: string;
  labelAr: string;
  value?: number; // omitted for `live` stats — value comes from DB count
  prefix?: string;
  suffix?: string;
  icon: string;
  source: string;
  live?: boolean;
  /** Optional supporting media, lazy-loaded when the stats scene appears. */
  image?: string;
};

export type IntroSettingsRow = {
  id: string;
  is_active: boolean;
  services: RawService[];
  scene_order: SceneKey[];
  stat_metrics: RawStatMetric[];
  headline_ar: string | null;
  headline_en: string | null;
  tagline_ar: string | null;
  tagline_en: string | null;
  prefetch_enabled: boolean;
  prefetch_lead_ms: number;
  updated_at: string;
};

export const DEFAULT_SCENE_ORDER: SceneKey[] = [
  "pulse",
  "brand",
  "services",
  "stats",
  "booking",
  "final",
];

export const DEFAULT_SERVICES: RawService[] = [
  {
    id: "clinics",
    titleAr: "العيادات التخصصية",
    titleEn: "Specialty Clinics",
    icon: "Stethoscope",
  },
  { id: "internal", titleAr: "الباطنية", titleEn: "Internal Medicine", icon: "HeartPulse" },
  { id: "pediatrics", titleAr: "طب الأطفال", titleEn: "Pediatrics", icon: "Baby" },
  { id: "obgyn", titleAr: "النساء والولادة", titleEn: "OB-GYN", icon: "Users" },
  { id: "dental", titleAr: "طب الأسنان", titleEn: "Dentistry", icon: "Tooth" },
  { id: "eye", titleAr: "طب العيون", titleEn: "Ophthalmology", icon: "Eye" },
  { id: "lab", titleAr: "المختبر", titleEn: "Laboratory", icon: "FlaskConical" },
  { id: "pharmacy", titleAr: "الصيدلية", titleEn: "Pharmacy", icon: "Pill" },
  { id: "home", titleAr: "الرعاية المنزلية", titleEn: "Home Care", icon: "Home" },
  { id: "telemed", titleAr: "الاستشارات عن بُعد", titleEn: "Telemedicine", icon: "Video" },
  { id: "booking", titleAr: "حجز إلكتروني", titleEn: "Online Booking", icon: "CalendarCheck" },
];

export const DEFAULT_STATS: RawStatMetric[] = [
  {
    id: "doctors",
    labelAr: "طبيبًا واستشاريًا",
    prefix: "+",
    icon: "Users",
    source: "قاعدة بيانات المجمع — الأطباء النشطون",
    live: true,
  },
  {
    id: "years",
    labelAr: "سنوات من الخبرة",
    value: 15,
    prefix: "+",
    icon: "Award",
    source: "بيانات معتمدة من إدارة المجمع",
  },
  {
    id: "sat",
    labelAr: "رضا المرضى",
    value: 98,
    suffix: "%",
    icon: "Star",
    source: "استبيانات رضا المرضى الداخلية",
  },
  {
    id: "care",
    labelAr: "رعاية طوال الأسبوع",
    value: 7,
    suffix: " أيام",
    icon: "Clock",
    source: "جدول عمل المجمع الرسمي",
  },
];

export const DEFAULT_INTRO_SETTINGS: IntroSettingsRow = {
  id: "default",
  is_active: true,
  services: DEFAULT_SERVICES,
  scene_order: DEFAULT_SCENE_ORDER,
  stat_metrics: DEFAULT_STATS,
  headline_ar: "مجمع باعشن الطبي",
  headline_en: "Baeshen Medical Complex",
  tagline_ar: "صحتك… أولويتنا",
  tagline_en: "Your Health, Our Priority",
  prefetch_enabled: true,
  prefetch_lead_ms: 1500,
  updated_at: new Date(0).toISOString(),
};

export function resolveIcon(name: string, fallback: LucideIcon = Activity): LucideIcon {
  return ICON_MAP[name] ?? fallback;
}
