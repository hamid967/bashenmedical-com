# خطة تطوير نظام الحجوزات — رؤية 2030

الهدف: الانتقال من نظام حجز رقمي إلى منظومة رعاية استباقية ذكية متوافقة مع رؤية 2030 الصحية (تجربة مريض شاملة، بيانات موحّدة، ذكاء اصطناعي، تكامل وطني، إتاحة كاملة).

## المحاور الستة

### 1) Patient 360 & Unified Identity
- ربط المريض برقم الهوية/الإقامة (`national_id`) + توحيد السجل الطبي (MRN موحّد عبر الفروع).
- تكامل مع منصة **نفاذ الوطني الموحّد** لتسجيل دخول بدون كلمة مرور.
- تكامل **صحتي / وصفتي / أنا** لسحب الملف الصحي والوصفات واللقاحات.
- بروفايل موحّد يجمع: الحجوزات + الفواتير + التقارير + التأمين + العائلة.

### 2) Smart Booking 2.0 (AI-Assisted)
- **Triage ذكي**: نموذج LLM (Lovable AI Gateway) يقترح التخصص/الطبيب المناسب من وصف الأعراض بالعربية/الإنجليزية.
- **Auto-Rebooking**: عند إلغاء طبيب لموعده، النظام يعيد جدولة كل المرضى تلقائياً بأقرب بديل مناسب مع إشعار الموافقة.
- **Predictive No-Show**: تقدير احتمال عدم الحضور واقتراح Overbooking محسوب أو تعزيز التذكير.
- **Voice Booking**: حجز صوتي (Web Speech + STT) للمسنين وذوي الإعاقة.
- **WhatsApp Booking Bot** كامل عبر Cloud API (Sprint مستقل).

### 3) Omnichannel & Real-Time
- **Realtime Slots** عبر Supabase Realtime: تحديث فوري للـ availability لكل المتصفحات المفتوحة (لا تعارض في القبض).
- قنوات دخول موحّدة: Web + PWA + WhatsApp + Voice + Kiosk (فرع) + رابط عميق من صحتي.
- **Digital Front Door**: صفحة `/book` واحدة تتكيّف حسب السياق (زائر، مريض معروف، عائلة، تأمين).

### 4) Insurance & Financial 2030
- تكامل **NPHIES** المباشر للتحقق من الأهلية وطلب الموافقة المسبقة قبل تأكيد الحجز.
- **Cost Transparency**: عرض السعر التقديري + نسبة التغطية + مبلغ المريض قبل التأكيد.
- **Split Payment**: بطاقة + محفظة (Apple Pay / STC Pay / mada Pay) + خطة تقسيط (Tabby/Tamara) لعمليات >1000 ريال.
- إصدار **فاتورة ZATCA E-Invoice Phase 2** تلقائياً (QR + XML) بعد الدفع.

### 5) Post-Visit Continuity of Care
- **Follow-up تلقائي**: بعد N يوم من الزيارة، اقتراح موعد متابعة حسب البروتوكول الطبي للتخصص.
- **Care Plans**: خطة رعاية للأمراض المزمنة (سكري/ضغط) مع تذكيرات دواء + قراءات + مواعيد دورية.
- **Second Opinion داخلي** بضغطة زر من تقرير موجود.
- **Home-Care Bridge**: تحويل حجز عيادة إلى زيارة منزلية إن كان مناسباً طبياً.

### 6) Governance, Accessibility & Trust
- **CBAHI/JCI-ready audit trail**: كل تعديل حجز/إلغاء/تأمين مُسجَّل في `appointment_audit` بتوقيع رقمي.
- **PDPL/HIPAA-aligned**: تشفير PII، سياسات RLS مشدّدة، سجل موافقات (`consent_records`) لكل مشاركة بيانات.
- **WCAG 2.2 AA** كامل + **صمم للجميع**: قارئ شاشة، تباين، لغة إشارة (فيديو للتعليمات).
- **Multi-language**: AR/EN/UR + إضافة FR/HI حسب ديموغرافيا المرضى.
- **SLA Dashboard**: p95 للحجز <15s، توفر 99.9%، زمن رد OTP <5s.

## المراحل (Sprints)

```text
Q1 2026 — Foundation
  S1: NPHIES Eligibility + Cost Transparency
  S2: Realtime Slots + Predictive No-Show v1
  S3: نفاذ SSO + Patient 360 unified view

Q2 2026 — Intelligence
  S4: AI Triage (Lovable AI) + Voice Booking
  S5: Auto-Rebooking Engine + Waitlist 2.0
  S6: WhatsApp Booking Bot (Cloud API)

Q3 2026 — Financial & Continuity
  S7: ZATCA E-Invoice Phase 2 + Split Payment
  S8: Follow-up Scheduler + Chronic Care Plans
  S9: Home-Care Bridge + Second Opinion 1-click

Q4 2026 — Trust & Scale
  S10: PDPL Compliance Pack + Consent Ledger
  S11: WCAG 2.2 AA audit + Sign-Language content
  S12: SLA Observability + Chaos testing
```

## التقنيات (تفاصيل تنفيذية)

- **قاعدة البيانات**: جداول جديدة — `care_plans`, `follow_up_rules`, `nphies_requests`, `triage_sessions`, `voice_booking_transcripts`, `no_show_predictions`. كل جدول مع GRANTs + RLS من اليوم الأول.
- **Server Functions**: `createServerFn` لكل عمليات NPHIES/ZATCA/نفاذ (أسرار في env، تحقق توقيع، rate-limit).
- **Realtime**: Supabase Realtime على `availability_slots` + broadcast channel للـ `slot_holds`.
- **AI**: `lovable-ai` gateway بموديل `google/gemini-2.5-flash` للـ triage (رخيص/سريع)، `gpt-5` للحالات المعقدة.
- **Observability**: توسيع `web_vitals` + `security_audit_log` + جدول `sla_events` مع لوحة `/admin/sla`.
- **Testing**: كل Sprint = ≥3 E2E جدد (AR+EN+UR) + preflight CI + artifacts on failure (نمطنا الحالي).

## KPIs 2030

| المؤشر | اليوم | هدف 2030 |
|---|---|---|
| زمن إتمام الحجز | ~90s | <30s |
| نسبة الحجوزات بدون موظف | ~60% | >95% |
| No-show rate | ~18% | <7% |
| قنوات الحجز | 2 | 6 |
| توفر النظام | 99% | 99.95% |
| رضا المريض (CSAT) | — | >4.7/5 |
| WCAG compliance | جزئي | AA كامل |

## المخاطر والتخفيف

- **NPHIES/نفاذ**: تعتمد موافقات حكومية → ابدأ بطلب الاعتماد بالتوازي مع Sprint 1.
- **AI Triage**: مسؤولية طبية → إظهار تنبيه "اقتراح غير تشخيصي" + مراجعة طبيب قبل التأكيد للحالات الحرجة.
- **Predictive No-Show**: تحيّز محتمل → مراجعة النموذج ربعياً + عدم استخدامه لرفض حجز.

## نقطة البداية المقترحة
Sprint 1 (NPHIES Eligibility + Cost Transparency) — أعلى أثر مالي وتجربة مريض، ويفتح الباب للتكاملات الحكومية اللاحقة. أبدأ به فور موافقتك.
