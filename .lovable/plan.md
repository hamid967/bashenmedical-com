# G3 — Analytics AI

ثلاث قدرات ذكية فوق بيانات BI الموجودة (bi_daily_kpis + appointments + complaints)، بدون أي بيانات مستخدم إضافية، وباستخدام Lovable AI Gateway (بدون مفتاح خارجي).

## القدرات

### 1) No-Show Prediction
- ميزات مشتقة من `appointments`: تاريخ الحجز vs موعد الزيارة (lead time)، الفرع، التخصص، وقت اليوم، تاريخ العميل (نسبة الغياب السابقة)، نوع التأمين، عدد التأكيدات (SMS/WA).
- محرك افتراضي: **Logistic scoring** خفيف داخل PL/pgSQL (بدون تدريب خارجي)، مع طبقة اختيارية تستدعي Gemini لتفسير عوامل الخطر لكل حالة.
- ناتج: `no_show_predictions(appointment_id, risk 0-1, top_factors[], recommendation)` يتحدّث ساعياً عبر pg_cron.

### 2) Smart Recommendations
- توصيات على مستوى الفرع/التخصص/اليوم: تعديل السعة، إضافة إشعار تذكير إضافي، عرض slots بديلة.
- تُولَّد بواسطة server function تستدعي `google/gemini-3.6-flash` مع KPIs مجمّعة (بدون PII).

### 3) Complaint Classification
- تصنيف تلقائي لكل شكوى جديدة (fields من `complaints`): الفئة، الحدة، القسم المسؤول، توصية رد.
- Trigger على `AFTER INSERT` → استدعاء server function `classifyComplaint` → تحديث الأعمدة `ai_category`, `ai_severity`, `ai_suggested_owner`.

## المخطط الفني

### قاعدة البيانات (migration واحدة)
```text
CREATE TABLE no_show_predictions (
  appointment_id uuid PK REFERENCES appointments,
  risk numeric(4,3),
  top_factors jsonb,
  recommendation text,
  computed_at timestamptz
);

ALTER TABLE complaints
  ADD COLUMN ai_category text,
  ADD COLUMN ai_severity text,
  ADD COLUMN ai_suggested_owner text,
  ADD COLUMN ai_classified_at timestamptz;

CREATE TABLE ai_recommendations (
  id uuid PK, scope text, scope_id text,
  kind text, payload jsonb, generated_at timestamptz, dismissed_at timestamptz
);
```
+ GRANTs + RLS: قراءة للأدوار admin/analyst فقط، service_role للكتابة.

### Server Functions (TanStack، مسار `src/lib/ai/`)
- `predictNoShow.functions.ts` — batch job، يقرأ المواعيد القادمة (48h) ويكتب `no_show_predictions`.
- `generateRecommendations.functions.ts` — يقرأ `bi_daily_kpis` آخر 30 يوم ويولّد ≤10 توصيات.
- `classifyComplaint.functions.ts` — استدعاء واحد لكل شكوى، محمي بـ `assertHasRole('admin'|'analyst')` أو DB trigger.

### واجهة الإدارة
- `/admin/ai-insights` — 3 تبويبات:
  - **No-Show**: جدول المواعيد عالية الخطر + زر "إرسال تذكير الآن".
  - **Recommendations**: بطاقات + accept/dismiss.
  - **Complaints AI**: جدول تصنيفات + دقة يدوية (override).

### الجدولة
- `pg_cron` كل ساعة: `predictNoShow` (48h window).
- `pg_cron` يومياً 06:00: `generateRecommendations`.
- شكاوى: real-time عبر trigger + net.http_post إلى `/api/public/hooks/classify-complaint`.

### الأمان
- كل الاستدعاءات لـ Lovable AI من الخادم فقط (`LOVABLE_API_KEY`).
- PII masking قبل الإرسال: لا أسماء/أرقام هوية/جوال — فقط hashed ids + متغيرات رقمية.
- تسجيل التوكنات في `ai_usage_costs` كما هو النمط الحالي.
- RLS: قراءة للـ `admin` و`analyst` فقط عبر `has_role`.

### الاختبارات
- Unit: مصنّف الشكاوى (mock gateway) + PII masking.
- Integration: RLS matrix للجداول الثلاثة.
- E2E: `/admin/ai-insights` تفتح فقط لـ admin/analyst وتعرض بيانات.

## Rollout
1. Migration + GRANTs + RLS.
2. Server functions + PII masker.
3. UI `/admin/ai-insights`.
4. Cron jobs + trigger.
5. اختبارات + توثيق في `docs/ai-insights.md`.

## خارج النطاق
- تدريب نماذج ML مخصصة (ML pipelines).
- بيانات ديموغرافية إضافية.
- تنبؤات مالية / إيرادات — تُعالج في G3.2 لاحقاً.
