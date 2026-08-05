/**
 * Public portal services — loads active `service_catalog` rows marked
 * `show_in_portal`, with a static fallback when the DB has none yet
 * (e.g. migration not applied).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarCheck,
  Search,
  FlaskConical,
  Scan,
  Pill,
  Truck,
  Stethoscope,
  Home as HomeIcon,
  MessageSquareWarning,
  FileText,
  CreditCard,
  HeartPulse,
  Building2,
  Plane,
  ShieldCheck,
  Phone,
  Video,
  Star,
  Users,
  MapPin,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

export type PortalCategory =
  | "appointments"
  | "records"
  | "pharmacy"
  | "care"
  | "billing"
  | "support";

export type PortalService = {
  key: string;
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
  to: string;
  icon: LucideIcon;
  cat: PortalCategory;
  auth?: boolean;
  keywords?: string;
};

const ICON_MAP: Record<string, LucideIcon> = {
  CalendarCheck,
  Search,
  FlaskConical,
  Scan,
  Pill,
  Truck,
  Stethoscope,
  Home: HomeIcon,
  HomeIcon,
  MessageSquareWarning,
  FileText,
  CreditCard,
  HeartPulse,
  Building2,
  Plane,
  ShieldCheck,
  Phone,
  Video,
  Star,
  Users,
  MapPin,
  ClipboardList,
};

export const FALLBACK_PORTAL_SERVICES: PortalService[] = [
  {
    key: "book",
    ar: "احجز موعدك",
    en: "Book Appointment",
    descAr: "احجز مع استشاري في 12 تخصصًا.",
    descEn: "Book with a consultant in 12 specialties.",
    to: "/book",
    icon: CalendarCheck,
    cat: "appointments",
    keywords: "موعد حجز appointment",
  },
  {
    key: "lookup",
    ar: "تعديل / إلغاء موعد",
    en: "Manage Appointment",
    descAr: "ابحث عن حجزك برقم الجوال.",
    descEn: "Look up your booking by phone.",
    to: "/lookup",
    icon: Search,
    cat: "appointments",
  },
  {
    key: "telemed",
    ar: "الاستشارة عن بُعد",
    en: "Telemedicine",
    descAr: "استشارة فيديو مع الطبيب.",
    descEn: "Video consultation with doctor.",
    to: "/telemedicine",
    icon: Video,
    cat: "appointments",
  },
  {
    key: "second",
    ar: "رأي طبي ثانٍ",
    en: "Second Opinion",
    descAr: "مراجعة استشاري مختص لحالتك.",
    descEn: "Specialist review of your case.",
    to: "/second-opinion",
    icon: Stethoscope,
    cat: "appointments",
  },
  {
    key: "lab",
    ar: "التقارير المخبرية",
    en: "Lab Reports",
    descAr: "تحميل نتائج التحاليل.",
    descEn: "Download lab results.",
    to: "/my",
    icon: FlaskConical,
    cat: "records",
    auth: true,
  },
  {
    key: "rad",
    ar: "تقارير الأشعة",
    en: "Radiology Reports",
    descAr: "صور وتقارير الأشعة.",
    descEn: "Images and reports.",
    to: "/my",
    icon: Scan,
    cat: "records",
    auth: true,
  },
  {
    key: "pharmacy",
    ar: "الصيدلية",
    en: "Pharmacy",
    descAr: "اطلب أدويتك أونلاين.",
    descEn: "Order medicines online.",
    to: "/pharmacy",
    icon: Pill,
    cat: "pharmacy",
  },
  {
    key: "delivery",
    ar: "توصيل الأدوية",
    en: "Medicine Delivery",
    descAr: "توصيل إلى باب المنزل.",
    descEn: "Home delivery.",
    to: "/pharmacy",
    icon: Truck,
    cat: "pharmacy",
  },
  {
    key: "track",
    ar: "تتبع الطلب",
    en: "Track Order",
    descAr: "حالة طلب الصيدلية.",
    descEn: "Pharmacy order status.",
    to: "/track",
    icon: MapPin,
    cat: "pharmacy",
  },
  {
    key: "home-care",
    ar: "الرعاية المنزلية",
    en: "Home Care",
    descAr: "زيارات طبية للمنزل.",
    descEn: "In-home medical visits.",
    to: "/home-care",
    icon: HomeIcon,
    cat: "care",
  },
  {
    key: "emergency",
    ar: "الطوارئ",
    en: "Emergency",
    descAr: "خدمات الطوارئ على مدار الساعة.",
    descEn: "24/7 emergency services.",
    to: "/emergency",
    icon: HeartPulse,
    cat: "care",
  },
  {
    key: "intl",
    ar: "المرضى الدوليون",
    en: "International Patients",
    descAr: "خدمات المرضى من خارج المملكة.",
    descEn: "Services for international patients.",
    to: "/international-patients",
    icon: Plane,
    cat: "care",
  },
  {
    key: "corp",
    ar: "خدمات الشركات",
    en: "Corporate",
    descAr: "عقود واتفاقيات الشركات.",
    descEn: "Corporate contracts.",
    to: "/corporate",
    icon: Building2,
    cat: "care",
  },
  {
    key: "insurance",
    ar: "التأمين الطبي",
    en: "Insurance",
    descAr: "شركات التأمين المعتمدة.",
    descEn: "Approved insurance providers.",
    to: "/insurance",
    icon: ShieldCheck,
    cat: "billing",
  },
  {
    key: "packages",
    ar: "الباقات الطبية",
    en: "Medical Packages",
    descAr: "فحوصات وباقات بأسعار مميزة.",
    descEn: "Screening packages.",
    to: "/packages",
    icon: CreditCard,
    cat: "billing",
  },
  {
    key: "invoices",
    ar: "الفواتير",
    en: "Invoices",
    descAr: "استعراض فواتيرك.",
    descEn: "View your invoices.",
    to: "/my",
    icon: FileText,
    cat: "billing",
    auth: true,
  },
  {
    key: "rate",
    ar: "قيّم تجربتك",
    en: "Rate Us",
    descAr: "شاركنا رأيك في الخدمة.",
    descEn: "Share your experience.",
    to: "/rate",
    icon: Star,
    cat: "support",
  },
  {
    key: "complaints",
    ar: "الشكاوى والاقتراحات",
    en: "Feedback",
    descAr: "صوتك يهمّنا.",
    descEn: "Your voice matters.",
    to: "/complaints",
    icon: MessageSquareWarning,
    cat: "support",
  },
  {
    key: "contact",
    ar: "تواصل معنا",
    en: "Contact",
    descAr: "أرقام وقنوات التواصل.",
    descEn: "Phones & channels.",
    to: "/contact",
    icon: Phone,
    cat: "support",
  },
  {
    key: "doctors",
    ar: "دليل الأطباء",
    en: "Doctor Directory",
    descAr: "تصفح الأطباء بالتخصص.",
    descEn: "Browse doctors by specialty.",
    to: "/doctors",
    icon: Users,
    cat: "support",
  },
];

const VALID_CATS = new Set<PortalCategory>([
  "appointments",
  "records",
  "pharmacy",
  "care",
  "billing",
  "support",
]);

function resolveIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Stethoscope;
  return ICON_MAP[name] ?? Stethoscope;
}

export type PortalServiceRow = {
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  icon: string | null;
  href: string | null;
  category: string | null;
  requires_auth: boolean | null;
};

export function mapPortalRows(rows: PortalServiceRow[]): PortalService[] {
  return rows
    .filter((r) => r.href && r.category && VALID_CATS.has(r.category as PortalCategory))
    .map((r) => ({
      key: r.slug,
      ar: r.name_ar,
      en: r.name_en,
      descAr: r.description_ar ?? "",
      descEn: r.description_en ?? "",
      to: r.href!,
      icon: resolveIcon(r.icon),
      cat: r.category as PortalCategory,
      auth: !!r.requires_auth,
    }));
}

/** Client-side fetch for /services (anon-readable via RLS). */
export async function fetchPortalServices(): Promise<PortalService[]> {
  try {
    const { data, error } = await supabase
      .from("service_catalog")
      .select(
        "slug, name_ar, name_en, description_ar, description_en, icon, href, category, requires_auth",
      )
      .eq("is_active", true)
      .eq("show_in_portal", true)
      .order("display_order", { ascending: true });
    if (error) throw error;
    const mapped = mapPortalRows((data ?? []) as PortalServiceRow[]);
    return mapped.length ? mapped : FALLBACK_PORTAL_SERVICES;
  } catch {
    return FALLBACK_PORTAL_SERVICES;
  }
}
