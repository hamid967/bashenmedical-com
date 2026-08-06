/**
 * Shared leadership roles for /team and /team/leadership.
 * Names are intentionally role-only on the public site (privacy).
 */
export type LeaderRole = {
  key: string;
  ar: string;
  en: string;
  desc_ar: string;
  desc_en: string;
};

export const LEADERSHIP_ROLES: LeaderRole[] = [
  {
    key: "ceo",
    ar: "المدير التنفيذي",
    en: "Chief Executive",
    desc_ar: "القيادة العامة والاستراتيجية التشغيلية للمجمع.",
    desc_en: "Overall leadership and operational strategy.",
  },
  {
    key: "cmo",
    ar: "المدير الطبي",
    en: "Chief Medical Officer",
    desc_ar: "الإشراف على جودة الخدمات الطبية وسلامة المرضى.",
    desc_en: "Oversees medical quality and patient safety.",
  },
  {
    key: "coo",
    ar: "مدير العمليات",
    en: "Chief Operations Officer",
    desc_ar: "إدارة الفروع والعمليات اليومية والمشتريات.",
    desc_en: "Branch operations, day-to-day execution, procurement.",
  },
  {
    key: "cto",
    ar: "مدير تقنية المعلومات",
    en: "Chief Technology Officer",
    desc_ar: "المنصات الرقمية، البنية التحتية، وأمن المعلومات.",
    desc_en: "Digital platforms, infrastructure, and security.",
  },
  {
    key: "quality",
    ar: "مدير الجودة والاعتماد",
    en: "Head of Quality & Accreditation",
    desc_ar: "معايير الجودة، الاعتمادات، والتحسين المستمر.",
    desc_en: "Quality standards, accreditations, continuous improvement.",
  },
  {
    key: "px",
    ar: "مدير خدمة العملاء",
    en: "Head of Patient Experience",
    desc_ar: "تجربة المريض والاستجابة لملاحظات الزوار.",
    desc_en: "Patient journey and feedback response.",
  },
  {
    key: "nursing",
    ar: "مدير التمريض",
    en: "Director of Nursing",
    desc_ar: "الإشراف على كادر التمريض ومعايير الرعاية السريرية.",
    desc_en: "Nursing workforce and clinical care standards.",
  },
  {
    key: "pharmacy",
    ar: "مدير الصيدلية",
    en: "Pharmacy Director",
    desc_ar: "إدارة الصيدلية الداخلية وصرف الأدوية والسلامة الدوائية.",
    desc_en: "In-house pharmacy, dispensing, and medication safety.",
  },
];

export const TEAM_VALUES = [
  {
    ar: { t: "سلامة المريض أولًا", d: "كل قرار تشغيلي يمر بمعايير سلامة معتمدة." },
    en: {
      t: "Patient safety first",
      d: "Every operational decision follows accredited safety standards.",
    },
  },
  {
    ar: { t: "رعاية إنسانية", d: "تجربة مريض واضحة من الحجز حتى المتابعة." },
    en: { t: "Humane care", d: "A clear patient journey from booking to follow-up." },
  },
  {
    ar: { t: "جودة معتمدة", d: "التزام بمعايير CBAHI والتحسين المستمر." },
    en: { t: "Accredited quality", d: "Commitment to CBAHI standards and continuous improvement." },
  },
  {
    ar: { t: "تحول رقمي مسؤول", d: "حجز وتتبع وتقارير عبر المنصة بعد التسجيل." },
    en: {
      t: "Responsible digital care",
      d: "Booking, tracking, and reports via the platform after sign-in.",
    },
  },
];
