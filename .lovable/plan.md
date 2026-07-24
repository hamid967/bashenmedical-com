# خطة "منظومة باعشن HIS" — Medinous-Style Booking

المرجع: `Baeshen_Medinous_Style_Booking_System_Lovable.md` (804 سطر، 30 قسم).
الوثيقة نفسها ستنسخ إلى `docs/specs/booking-medinous-style.md` كمرجع دائم.

## المبادئ

- تطوير `/book` الحالي، بدون نظام حجز مواز.
- الحفاظ على: `slot_holds`, `Idempotency-Key`, NPHIES adapter, Realtime monitor.
- Migrations قابلة للتراجع؛ Manifest قبل أي تغيير عالي الخطورة.
- فصل صارم Demo/Production عبر `is_demo boolean not null default false` + RLS تُخفيها في الإنتاج + Feature flag `bookings.show_demo`.
- لا نسخ لواجهة Medinous أو محتواها.

## Phase 1 — Audit & Change Manifest (بدون كود إنتاج)

الناتج: `docs/audit/booking-hiv-phase1.md` يحوي:

1. **Current Architecture** — قائمة routes `/book`, `/reservations/manage`, `/admin/*`, `patient.*`, `doctor.*`.
2. **Database Map** — الجداول الحالية (34 جدول محدد، منها `appointments`, `slot_holds`, `availability_slots`, `patients`, `doctors`, `doctor_branches`, `insurance_*`, `patient_check_ins`, `appointment_status_history`, `appointment_waitlist`).
3. **Gap Analysis** — ما ينقص مقابل القسم 22 من الوثيقة:
   - `patient_identifiers` (MRN + national_id متعدد)
   - `clinics` (منفصلة عن `branches`)
   - `services` كجدول موحد
   - `doctor_schedules` + `schedule_exceptions`
   - `appointment_slots` (حالياً `availability_slots` — نُقيّم إعادة التسمية أو التكيّف)
   - `queue_entries`, `estimates`, `refunds` (بعضها موجود؛ نتحقق)
   - `booking_source` عمود على `appointments`
   - State machine كاملة (16 حالة) — الحالي أقل
4. **Security Findings** — RLS gaps, IDOR surface, branch-scope.
5. **Change Manifest** — مصنّف حسب الخطورة (safe/medium/high) مع Rollback لكل تغيير.
6. **Migration Order** لباقي المراحل.

**بوابة اعتماد م. حامد** قبل الانتقال للمرحلة 2.

## Phase 2 — Foundation (Patient Master + Schedule Engine)

- Patient Master Index: توحيد `patients` + `patient_profiles`، إضافة `patient_identifiers` (national_id/iqama/passport)، MRN صيغة `BMC-MRN-######` (يوجد `branch_mrn_counter`).
- **Duplicate Review Case**: جدول `patient_duplicate_cases` بدل الدمج التلقائي، مع UI مراجعة.
- Schedule Engine: `doctor_schedules` (أسبوعي) + `schedule_exceptions` (إجازات/طوارئ) + `service_durations`.
- تعزيز Slot Hold الحالي: تحقق من التوفر ذرّياً على الخادم، `hold_id`+`expires_at`، تحرير عند تغيير الاختيار.
- Atomic Booking RPC: transaction واحدة (10 خطوات من القسم 8) + Idempotency (موجود، نتحقق من التغطية).
- رقم الحجز `BMC-APT-YYYYMMDD-XXXX` (موجود counter — نتحقق من الصيغة).
- عمود `booking_source` على `appointments` + enum.

## Phase 3 — SPA Booking + Front Desk + Queue

- `/book` كـ SPA مع Stepper و Sticky Summary و Bottom Sheet جوال و Autosave و Browser Back/Forward بدون فقد بيانات (كثير منه موجود — نغلق الفجوات).
- `/admin/front-desk`: بحث مريض، تسجيل، Snapshot، إنشاء حجز، حجوزات اليوم، Check-in، إعادة جدولة، إلغاء، No-show.
- Queue: `queue_entries` مع الحالات (waiting/called/skipped/in_service/completed/cancelled) + رقم انتظار.
- Waiting-list Opportunity workflow (1-click confirm + مهلة).
- Reschedule "Hold-New-then-Release-Old" (القسم 14).
- No-show بصلاحية + فترة سماح + سبب.

## Phase 4 — Portals (Patient / Doctor / Branch Manager)

- `/patient/*`: appointments, reports, prescriptions, billing, insurance, requests, family, profile — يبني على `PatientShell` الموجودة.
- `/doctor`: جدول اليوم، المنتظرون، إنهاء الزيارة، طلب متابعة (بدون EMR كامل).
- `/admin/branch-manager`: مواعيد اليوم، الحضور، الانتظار، No-show، إشغال الأطباء، التأمين، التحصيل — مع فلاتر (تاريخ/طبيب/تخصص/خدمة/عيادة/حالة/مصدر/تأمين).
- Notification channels موحدة (In-app/SMS/WhatsApp/Email/Push) مع حالات (queued/sent/delivered/failed/unknown).

## Phase 5 — Insurance, NPHIES, Billing

- Insurance states (11 حالة، القسم 16).
- NPHIES Adapter محاذي للحالي مع Mock/Prod flag صريح + Request ID logging بدون PII.
- Estimates + Invoices + Payments + Refunds workflow.
- Payment states (9 حالات) — لا تأكيد قبل webhook موثّق + signature + idempotency.

## Phase 6 — Security / A11y / Perf / Docs / Production Readiness

- RBAC 10 أدوار (Super Admin → Patient) على UI+API+RLS.
- Cross-patient/branch/IDOR test suite.
- WCAG 2.2 AA؛ Chromium+Firefox+WebKit Playwright.
- Super Admin settings (القسم 23) — لا سياسات hardcoded.
- Documentation + Training runbooks.

## Demo/Production Data Separation

في كل جدول جديد تحوي بيانات تجريبية:

```sql
is_demo boolean not null default false
-- RLS: policy on production excludes rows where is_demo AND NOT current_setting('app.show_demo', true)::bool
```

+ Feature flag `bookings.show_demo` في `ai_feature_flags` + toggle في Super Admin UI. لا `is_demo=true` في مسارات المرضى الحقيقية.

## Definition of Done (كل مرحلة)

- Migrations reversible + Rollback موثّق.
- Unit + Integration + Playwright خضراء.
- ESLint + tsc + build ناجحة.
- Security scan بدون findings حرجة جديدة.
- RLS/RBAC tests للـcross-tenant.
- No fake buttons / no fake success (شرط القسم 30).

## القرار المطلوب

الاعتماد على تسليم Phase 1 (Audit + Manifest بدون تعديل كود إنتاجي) خلال الجولة القادمة، والباقي بعد مراجعة الـManifest.
