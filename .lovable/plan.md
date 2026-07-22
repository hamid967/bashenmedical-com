# خطة تحويل i18n للملفات الأعلى مخالفات

## البنية الحالية (مؤكّدة)

- `i18next` + `react-i18next` جاهز في `src/lib/i18n/config.ts`
- Namespaces حالياً: `common`, `booking` (ar/en/ur)
- اللغة الافتراضية: `ar` (SSR-safe، بدون كشف تلقائي)
- **0 من أعلى 8 ملفات مخالفة تستخدم `useTranslation`** — كلها نص عربي مباشر

## المبدأ

- **الأولوية للصفحات العامة / SEO** (فهرسة Google، مشاركة روابط) — هنا تُفيد الترجمة فعلاً
- **تأجيل الصفحات الإدارية الداخلية** — تخدم موظفين عرب، والترجمة فيها جهد بلا ROI
- **استثناء `admin.classic.tsx`** — مرشح للإخماد أصلاً (M3)، لا نترجمه

## قائمة الأولويات المعاد ترتيبها

| # | ملف | أسطر | عام؟ | القرار |
|---|---|---|---|---|
| 1 | `doctors.$slug.tsx` | 111 | ✅ SEO | **ترجمة كاملة** |
| 2 | `programs.tsx` | 92 | ✅ SEO | **ترجمة كاملة** |
| 3 | `reservations.manage.tsx` | 82 | ✅ عام | **ترجمة كاملة** |
| 4 | `orders.$ref.tsx` | 73 | ✅ عام | **ترجمة كاملة** |
| 5 | `complex.tsx` | 71 | ✅ SEO | **ترجمة كاملة** |
| 6 | `portal.appointments.tsx` | 121 | 🔒 مريض | **ترجمة (يستخدمها المرضى)** |
| 7 | `portal.prescriptions.tsx` | 130 | 🔒 مريض | **ترجمة** |
| 8 | `portal.refunds.tsx` | 170 | 🔒 مريض | **ترجمة** |
| 9 | `portal.index.tsx` | 96 | 🔒 مريض | **ترجمة** |
| — | `admin.classic.tsx` (492) | 🔧 إداري | **تُستثنى — مرشحة للحذف** |
| — | `patients-analytics.tsx` (199), `patients.$patientId.tsx` (160), `rbac.tsx`, `hr-management.tsx`, `pharmacy-management.tsx`, `reports.tsx`, `admin.super.permissions.tsx`, `audit-export.tsx`، `nurses.tsx`, `admin.no-show-stats.tsx` | 🔧 إداري داخلي | **تأجيل** (طاقم عربي، ROI منخفض) |

**9 ملفات في النطاق — إجمالي ~946 سطر عربي.**

## البنية المقترحة للـ Namespaces

إضافة namespaces جديدة لتفادي تضخّم `common.json`:

```text
src/locales/{ar,en,ur}/
├── common.json         (موجود)
├── booking.json        (موجود)
├── doctors.json        (جديد — doctors.$slug + programs)
├── reservations.json   (جديد — reservations.manage + orders.$ref)
├── complex.json        (جديد — complex.tsx)
└── portal.json         (جديد — 4 ملفات portal.*)
```

تحديث `src/lib/i18n/config.ts` لتسجيل الـ namespaces الجديدة.

## سير العمل — دفعة واحدة لكل ملف

لكل ملف من الـ 9:
1. **استخراج** كل نص عربي إلى مفاتيح ذات معنى (`doctors.detail.book_cta` بدلاً من `key_1`)
2. **إضافة** المفاتيح إلى `ar/*.json` + ترجمة `en/*.json` + `ur/*.json` (Urdu = fallback من ar عند غياب المفتاح)
3. **تعديل** الملف: `import { useTranslation } from "react-i18next"` + `const { t } = useTranslation("<ns>")` + استبدال النصوص بـ `{t("key")}`
4. **الحفاظ على SEO**: نصوص `head()` (title/description/og) تظل تستخدم `t()` أيضاً — لكن مع fallback ثابت لضمان SSR الآمن
5. **التحقق**: build يمرّ + قراءة الملف بعد التعديل لتأكيد صحة JSX

## الترتيب الزمني للتسليم

| مرحلة | الملفات | ملاحظة |
|---|---|---|
| **P1** | تحديث `config.ts` + إضافة 4 ملفات namespace فارغة (ar/en/ur) | تحضير |
| **P2** | `doctors.$slug.tsx` (SEO — الأهم) | يُسلَّم للمراجعة |
| **P3** | `programs.tsx` + `complex.tsx` | SEO |
| **P4** | `reservations.manage.tsx` + `orders.$ref.tsx` | صفحات ضيوف |
| **P5** | `portal.index.tsx` + `portal.appointments.tsx` | بوابة المريض |
| **P6** | `portal.prescriptions.tsx` + `portal.refunds.tsx` | بوابة المريض |

بعد كل مرحلة أتوقف لتأكيد الجودة (خصوصاً ترجمات EN) قبل الانتقال للتالية.

## ما لن أفعله في هذه الخطة

- ❌ لن أترجم `admin.classic.tsx` (مرشح للحذف)
- ❌ لن أترجم صفحات الإدارة الداخلية (10 ملفات، طاقم عربي)
- ❌ لن أضيف كشف لغة تلقائي عبر `navigator.language` (يكسر SSR)
- ❌ لن أغيّر منطق التوجيه/RTL/LTR (يعمل حالياً)

## تفاصيل تقنية

- `useTranslation("doctors")` مع `defaultNS` = `common` يبقى كما هو
- كل ملف JSON بصيغة flat keys بنقاط: `"detail.book_cta": "احجز الآن"`
- ترجمات EN دقيقة (ليست Google Translate) لكل مفتاح
- ترجمات UR: نُضيف الملفات فارغة أو نسخة من AR — i18next سيُرجع fallback لـ AR تلقائياً عبر `fallbackLng`
- SSR-safe: `initImmediate: false` مضبوط أصلاً — `t()` تُرجع الترجمة الصحيحة أثناء render السيرفر
- لا تعديل على شيفرة الأعمال (business logic) — تحويل نصوص فقط

## المطلوب منك

اختر إحدى:
- **(أ) نفّذ P1+P2 الآن** (البنية + أول صفحة SEO) وأعرض النتيجة للمراجعة قبل التالي
- **(ب) نفّذ P1→P4 دفعة واحدة** (كل الصفحات العامة/SEO)
- **(ج) نفّذ الخطة كاملة P1→P6** بلا توقف
- **(د) عدّل الخطة** (استبعاد ملف، ضم ملف إداري، إلخ)
