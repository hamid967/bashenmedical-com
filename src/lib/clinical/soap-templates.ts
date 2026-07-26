// SOAP templates keyed by visit type. Bilingual labels; content in Arabic
// with brief English section headers to preserve SOAP conventions.

export type SoapTemplate = {
  id: string;
  label_ar: string;
  label_en: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export const SOAP_TEMPLATES: SoapTemplate[] = [
  {
    id: "general",
    label_ar: "كشف عام",
    label_en: "General Consultation",
    subjective:
      "- الشكوى الرئيسية: \n- بداية الأعراض ومدتها: \n- العوامل المُحسِّنة/المُسوِّئة: \n- الأمراض المزمنة: \n- الأدوية الحالية: \n- الحساسية: ",
    objective:
      "- العلامات الحيوية: ض/د ___ , نبض ___ , حرارة ___ , تنفس ___ , SpO2 ___%\n- المظهر العام: \n- الفحص الموضعي: ",
    assessment: "- التشخيص المبدئي: \n- التشخيصات التفريقية: ",
    plan:
      "- الفحوصات المطلوبة: \n- الأدوية الموصوفة: \n- التثقيف الصحي: \n- المتابعة: ",
  },
  {
    id: "followup",
    label_ar: "زيارة متابعة",
    label_en: "Follow-up",
    subjective:
      "- الحالة منذ آخر زيارة: \n- الاستجابة للعلاج: \n- الالتزام بالأدوية: \n- الأعراض الجديدة: ",
    objective: "- العلامات الحيوية: \n- الفحص السريري الموجّه: ",
    assessment: "- تطور الحالة: (تحسن / مستقر / تدهور)\n- التشخيص الحالي: ",
    plan:
      "- تعديل الأدوية: \n- الفحوصات: \n- موعد المتابعة القادمة: ",
  },
  {
    id: "acute",
    label_ar: "شكوى حادة",
    label_en: "Acute Complaint",
    subjective:
      "- الشكوى الرئيسية: \n- بداية الأعراض: \n- الشدة (0-10): \n- المصاحبات (حرارة/غثيان/…): \n- محاولات علاج سابقة: ",
    objective:
      "- العلامات الحيوية: \n- الفحص الموضعي: \n- علامات الخطر (Red flags): لا/نعم — ",
    assessment: "- التشخيص المبدئي: \n- استبعاد الحالات الطارئة: ",
    plan:
      "- علاج فوري: \n- تحاليل/أشعة: \n- تعليمات العودة الفورية (Warning signs): \n- المتابعة: ",
  },
  {
    id: "chronic",
    label_ar: "متابعة مرض مزمن",
    label_en: "Chronic Disease Follow-up",
    subjective:
      "- المرض المزمن: \n- التحكم بالأعراض: \n- الالتزام بالأدوية والحمية: \n- المضاعفات المُشتبهة: ",
    objective:
      "- العلامات الحيوية: \n- المؤشرات (BMI/HbA1c/BP…): \n- فحوصات المضاعفات: ",
    assessment: "- درجة التحكم: (جيد/متوسط/ضعيف)\n- المضاعفات: ",
    plan:
      "- تعديل الخطة العلاجية: \n- الفحوصات الدورية: \n- تحويل تخصصي: \n- التثقيف: \n- المتابعة القادمة: ",
  },
  {
    id: "pediatric",
    label_ar: "كشف أطفال",
    label_en: "Pediatric Visit",
    subjective:
      "- الشكوى: \n- التغذية: \n- النوم: \n- التطعيمات (حسب العمر): مكتملة/ناقصة\n- النمو والتطور: ",
    objective:
      "- الوزن ___ الطول ___ محيط الرأس ___ (المئينيّات)\n- العلامات الحيوية: \n- الفحص العام: ",
    assessment: "- التشخيص: \n- تقييم النمو: ",
    plan:
      "- علاج/جرعات حسب الوزن: \n- توصيات التغذية: \n- التطعيمات: \n- المتابعة: ",
  },
  {
    id: "antenatal",
    label_ar: "متابعة حمل",
    label_en: "Antenatal Care",
    subjective:
      "- عمر الحمل (أسابيع): \n- الحركة الجنينية: \n- الأعراض (نزيف/تقلصات/إفرازات): \n- تاريخ الحمول السابقة: ",
    objective:
      "- ض/د ___ , نبض ___ , وزن ___ \n- ارتفاع الرحم: \n- نبض الجنين: \n- الوضعية: ",
    assessment: "- الحمل ___ أسبوع، الحالة: طبيعي/عالي الخطورة — السبب: ",
    plan:
      "- الفحوصات: (CBC, GDM, U/S…)\n- المكملات: \n- تعليمات الخطر: \n- الموعد القادم: ",
  },
  {
    id: "preop",
    label_ar: "تقييم ما قبل العملية",
    label_en: "Pre-op Assessment",
    subjective:
      "- نوع العملية المخطط لها: \n- الأمراض المزمنة: \n- الأدوية (خاصة مضادات التخثر): \n- الحساسية: \n- تاريخ التخدير السابق: ",
    objective:
      "- العلامات الحيوية: \n- فحص القلب والصدر: \n- المسالك الهوائية (Mallampati): ",
    assessment: "- تصنيف ASA: I / II / III / IV\n- المخاطر المتوقعة: ",
    plan:
      "- الفحوصات المطلوبة قبل العملية: \n- استشارات: \n- تعليمات الصيام والأدوية: \n- الموافقة المستنيرة: ",
  },
  {
    id: "mentalhealth",
    label_ar: "صحة نفسية",
    label_en: "Mental Health",
    subjective:
      "- الشكوى: \n- المزاج والنوم والشهية: \n- أفكار إيذاء النفس/الآخرين: نعم/لا\n- الضغوط الحالية: \n- تاريخ نفسي سابق وأدوية: ",
    objective:
      "- المظهر والسلوك: \n- الكلام والتفكير: \n- المزاج والوجدان: \n- الإدراك والاستبصار: ",
    assessment: "- التشخيص المبدئي: \n- تقييم الخطورة: منخفض/متوسط/مرتفع",
    plan:
      "- العلاج الدوائي: \n- الإحالة النفسية/الاجتماعية: \n- خطة السلامة: \n- المتابعة: ",
  },
];

export function getTemplate(id: string): SoapTemplate | undefined {
  return SOAP_TEMPLATES.find((t) => t.id === id);
}
