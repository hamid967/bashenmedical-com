/**
 * CMS content-kind catalog.
 *
 * Each entry declares:
 *   - `label` (Arabic display name)
 *   - `singleton` — a global surface (home, nav, footer…) versus a list (doctors, articles…)
 *   - `fields` — per-kind field schema shared across AR/EN payloads
 *
 * The editor UI uses this to render forms and compute locale completeness.
 * Kept intentionally lightweight (text/textarea/rich/url/image/list) so a
 * single schema-driven renderer covers every surface.
 */
export type CmsKind =
  | "home"
  | "nav"
  | "footer"
  | "hero"
  | "service"
  | "specialty"
  | "doctor"
  | "branch"
  | "offer"
  | "announcement"
  | "article"
  | "faq"
  | "insurance"
  | "contact"
  | "hours"
  | "banner"
  | "intro"
  | "whatsapp"
  | "policy"
  | "page"
  | "seo_defaults";

export type FieldType = "text" | "textarea" | "rich" | "url" | "image" | "list" | "boolean";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  // For `list` fields — schema of each item's sub-fields (text-only).
  itemFields?: { name: string; label: string; type: "text" | "textarea" | "url" }[];
};

export type KindDef = {
  key: CmsKind;
  label: string;
  singleton: boolean;
  /** When true, submitCmsForReview requires 100% completeness in EN as well as AR. */
  bilingual?: boolean;
  fields: FieldDef[];
};

const seoFields: FieldDef[] = [
  { name: "title", label: "العنوان (SEO)", type: "text" },
  { name: "description", label: "الوصف (SEO)", type: "textarea" },
];

export const CMS_KINDS: Record<CmsKind, KindDef> = {
  home: {
    key: "home",
    label: "الصفحة الرئيسية",
    singleton: true,
    bilingual: true,
    fields: [
      { name: "headline", label: "العنوان الرئيسي", type: "text", required: true },
      { name: "subheadline", label: "العنوان الفرعي", type: "textarea" },
      { name: "cta_label", label: "زر الإجراء", type: "text" },
      { name: "cta_href", label: "رابط زر الإجراء", type: "url" },
      ...seoFields,
    ],
  },
  nav: {
    key: "nav",
    label: "شريط التنقل",
    singleton: true,
    bilingual: true,
    fields: [
      {
        name: "items",
        label: "عناصر القائمة",
        type: "list",
        itemFields: [
          { name: "label", label: "النص", type: "text" },
          { name: "href", label: "الرابط", type: "url" },
        ],
      },
    ],
  },
  footer: {
    key: "footer",
    label: "التذييل",
    singleton: true,
    bilingual: true,
    fields: [
      { name: "tagline", label: "الشعار النصي", type: "textarea" },
      {
        name: "columns",
        label: "الأعمدة",
        type: "list",
        itemFields: [
          { name: "title", label: "عنوان العمود", type: "text" },
          { name: "links", label: "روابط (سطر لكل رابط)", type: "textarea" },
        ],
      },
      { name: "copyright", label: "نص حقوق النشر", type: "text" },
    ],
  },
  hero: {
    key: "hero",
    label: "قسم البطل",
    singleton: true,
    bilingual: true,
    fields: [
      { name: "title", label: "العنوان", type: "text", required: true },
      { name: "body", label: "النص", type: "rich" },
      { name: "image", label: "صورة الخلفية", type: "image" },
      { name: "cta_label", label: "زر الإجراء", type: "text" },
      { name: "cta_href", label: "رابط الزر", type: "url" },
    ],
  },
  service: {
    key: "service",
    label: "خدمة",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "name", label: "الاسم", type: "text", required: true },
      { name: "summary", label: "ملخّص", type: "textarea" },
      { name: "body", label: "المحتوى", type: "rich" },
      { name: "icon", label: "أيقونة", type: "image" },
      ...seoFields,
    ],
  },
  specialty: {
    key: "specialty",
    label: "تخصص",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "name", label: "الاسم", type: "text", required: true },
      { name: "description", label: "الوصف", type: "textarea" },
      { name: "image", label: "صورة", type: "image" },
      ...seoFields,
    ],
  },
  doctor: {
    key: "doctor",
    label: "طبيب",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "name", label: "الاسم", type: "text", required: true },
      { name: "title", label: "المسمى", type: "text" },
      { name: "bio", label: "السيرة", type: "rich" },
      { name: "photo", label: "الصورة", type: "image" },
      ...seoFields,
    ],
  },
  branch: {
    key: "branch",
    label: "فرع",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "name", label: "الاسم", type: "text", required: true },
      { name: "address", label: "العنوان", type: "textarea" },
      { name: "phone", label: "الهاتف", type: "text" },
      { name: "map_url", label: "رابط الخريطة", type: "url" },
      { name: "image", label: "صورة", type: "image" },
      ...seoFields,
    ],
  },
  offer: {
    key: "offer",
    label: "عرض",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "title", label: "العنوان", type: "text", required: true },
      { name: "body", label: "التفاصيل", type: "rich" },
      { name: "image", label: "صورة", type: "image" },
      { name: "cta_href", label: "رابط التسجيل", type: "url" },
    ],
  },
  announcement: {
    key: "announcement",
    label: "إعلان",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "message", label: "الرسالة", type: "textarea", required: true },
      { name: "level", label: "المستوى (info/warning)", type: "text" },
      { name: "href", label: "رابط اختياري", type: "url" },
    ],
  },
  article: {
    key: "article",
    label: "مقالة",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "title", label: "العنوان", type: "text", required: true },
      { name: "excerpt", label: "المقتطف", type: "textarea" },
      { name: "body", label: "المحتوى", type: "rich" },
      { name: "cover", label: "صورة الغلاف", type: "image" },
      ...seoFields,
    ],
  },
  faq: {
    key: "faq",
    label: "سؤال شائع",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "question", label: "السؤال", type: "text", required: true },
      { name: "answer", label: "الإجابة", type: "rich", required: true },
    ],
  },
  insurance: {
    key: "insurance",
    label: "شركة تأمين",
    singleton: false,
    fields: [
      { name: "name", label: "الاسم", type: "text", required: true },
      { name: "logo", label: "الشعار", type: "image" },
      { name: "notes", label: "ملاحظات", type: "textarea" },
    ],
  },
  contact: {
    key: "contact",
    label: "بيانات التواصل",
    singleton: true,
    fields: [
      { name: "phone", label: "الهاتف", type: "text" },
      { name: "whatsapp", label: "واتساب", type: "text" },
      { name: "email", label: "البريد", type: "text" },
      { name: "address", label: "العنوان", type: "textarea" },
    ],
  },
  hours: {
    key: "hours",
    label: "ساعات العمل",
    singleton: true,
    fields: [
      { name: "weekday_hours", label: "أيام العمل", type: "text" },
      { name: "weekend_hours", label: "نهاية الأسبوع", type: "text" },
      { name: "notes", label: "ملاحظات", type: "textarea" },
    ],
  },
  banner: {
    key: "banner",
    label: "بانر",
    singleton: false,
    fields: [
      { name: "title", label: "العنوان", type: "text", required: true },
      { name: "image", label: "الصورة", type: "image" },
      { name: "href", label: "الرابط", type: "url" },
    ],
  },
  intro: {
    key: "intro",
    label: "شاشة الترحيب",
    singleton: true,
    fields: [
      { name: "headline", label: "العنوان", type: "text" },
      { name: "body", label: "النص", type: "textarea" },
      { name: "audio_url", label: "الصوت", type: "url" },
      { name: "enabled", label: "مفعّل", type: "boolean" },
    ],
  },
  whatsapp: {
    key: "whatsapp",
    label: "زر واتساب",
    singleton: true,
    fields: [
      { name: "phone", label: "رقم واتساب", type: "text", required: true },
      { name: "tooltip", label: "التلميح", type: "text" },
      { name: "enabled", label: "مفعّل", type: "boolean" },
    ],
  },
  policy: {
    key: "policy",
    label: "سياسة",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "title", label: "العنوان", type: "text", required: true },
      { name: "body", label: "النص", type: "rich", required: true },
    ],
  },
  page: {
    key: "page",
    label: "صفحة مخصصة",
    singleton: false,
    bilingual: true,
    fields: [
      { name: "slug", label: "المسار (slug)", type: "text", required: true },
      { name: "title", label: "العنوان", type: "text", required: true },
      { name: "body", label: "المحتوى", type: "rich", required: true },
      ...seoFields,
    ],
  },
  seo_defaults: {
    key: "seo_defaults",
    label: "الإعدادات الافتراضية للـ SEO",
    singleton: true,
    bilingual: true,
    fields: [
      { name: "site_title", label: "اسم الموقع", type: "text" },
      { name: "site_description", label: "الوصف الافتراضي", type: "textarea" },
      { name: "og_image", label: "صورة OG الافتراضية", type: "image" },
    ],
  },
};

export const CMS_KIND_LIST: KindDef[] = Object.values(CMS_KINDS);

/** Compute % of required (or all if none required) fields with non-empty values in a payload. */
export function computeCompleteness(
  kind: CmsKind,
  payload: Record<string, unknown> | null | undefined,
): number {
  const def = CMS_KINDS[kind];
  if (!def) return 0;
  const p = payload ?? {};
  const required = def.fields.filter((f) => f.required);
  const targets = required.length > 0 ? required : def.fields;
  if (targets.length === 0) return 100;
  let filled = 0;
  for (const f of targets) {
    const v = p[f.name];
    if (v == null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "boolean") {
      filled++;
      continue;
    }
    filled++;
  }
  return Math.round((filled / targets.length) * 100);
}
