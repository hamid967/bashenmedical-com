
## الهدف

تسليم ثلاث بوابات متكاملة فوق الأساس الحالي (حجوزات + تأمين + تقويم طبيب موجودة) مع بيانات تجريبية موسومة `is_demo` ومحاكيات للتكاملات الخارجية، ثنائية اللغة عربي/إنجليزي مع RTL/LTR.

---

## المرحلة أ — الأساس (Migration واحدة كبيرة)

### 1) توسيع نموذج البيانات
جداول جديدة:
- `permissions` (موجود جزئياً) — إعادة استخدام + إضافة صلاحيات جديدة
- `role_permissions` (موجود) — تعبئة كاملة
- `medical_reports` — تقارير عامة (lab/rad/visit_summary/discharge/certificate/referral) + `is_demo` + `published_at` + `revoked_at` + `file_path` (Storage)
- `report_versions` — نسخ التقارير
- `dependents` — أفراد العائلة
- `patient_check_ins` — تسجيل الوصول
- `payments` + `refunds` — منفصلين عن invoices
- `insurance_approvals` — طلبات الموافقة (مع attachments jsonb)
- `notification_templates` (موجود جزئياً `message_templates`) — نستخدم القائم
- `audit_logs` عام (موسع من appointment_audit)
- `system_settings` (jsonb key/value)
- `integration_logs`
- إضافة `is_demo boolean default false` لكل جدول محتوى (doctors/appointments/invoices/reports/…)

### 2) الأدوار والصلاحيات
Enum `app_role` يوسع إلى:
`patient, super_admin, center_admin, branch_manager, appointment_manager, receptionist, doctor, reports_officer, billing_officer, insurance_officer, support_agent, content_manager, auditor`

جدول `permissions` يحوي:
`view_appointments, create_appointments, modify_appointments, cancel_appointments, view_patient_pii, view_medical_reports, publish_reports, view_invoices, process_refunds, manage_doctors, manage_schedules, manage_employees, view_analytics, export_data, manage_integrations, view_audit_logs, manage_permissions`

دالة `has_permission(_user_id, _perm)` security definer + سياسات RLS تستدعيها.

### 3) RLS كاملة
- كل جدول محتوى للمريض: `auth.uid() = patient.user_id` أو دور مصرح.
- Storage buckets: `medical-reports`, `insurance-cards`, `invoices-pdf` مع RLS.

### 4) Storage
Buckets خاصة + سياسات signed URL فقط.

### 5) Seed DEMO
Migration منفصلة تضيف:
- 8 أطباء تجريبيين، 12 موعد، 6 تقارير، 4 فواتير، 3 موافقات تأمين، 5 إشعارات — كلها `is_demo=true`.
- شارة "DEMO" مرئية في الواجهة على الصفوف الموسومة.

---

## المرحلة ب — لوحة المريض `/portal/*`

الموجود: `/portal`, `/portal/orders`, `/portal/calendar` (طبيب).

الجديد داخل `_authenticated/portal.*`:
- `portal.overview.tsx` (بديل حديث لـ `portal/index`) — بطاقات: الموعد التالي، تقارير جديدة، مبالغ مستحقة، حالة موافقات التأمين، اختصارات سريعة.
- `portal.appointments.tsx` — قائمة قادم/سابق + تأكيد الحضور + إعادة جدولة + إلغاء + تنزيل تأكيد + خرائط + طلب متابعة.
- `portal.reports.tsx` — قائمة التقارير مع فلاتر (نوع/تاريخ) + معاينة PDF عبر signed URL + مشاركة مع طبيب + شارة DEMO.
- `portal.prescriptions.tsx` — قائمة الوصفات + تنزيل + طلب تجديد.
- `portal.invoices.tsx` — الفواتير + المدفوعات + زر «ادفع الآن» (Mock gateway) + إيصال PDF.
- `portal.insurance.tsx` — الموافقات + الحالة + المرفقات المطلوبة.
- `portal.family.tsx` — إضافة/تبديل معالين، تحقق العلاقة، حجز نيابة.
- `portal.profile.tsx` — البيانات، اللغة، التذكيرات، جهة الطوارئ، احتياجات الوصول، الجلسات النشطة.
- `portal.checkin.$ref.tsx` — Check-in ذكي مع نافذة زمنية.

كل صفحة: Loading/Skeleton/Empty/Error states.

---

## المرحلة ج — البوابة الإدارية `/admin/*`

Layout `_authenticated/admin.tsx` يحمي عبر `has_permission`.

- `admin.dashboard.tsx` — KPIs (اليوم/مؤكد/انتظار/إلغاء/عدم حضور/إشغال/تأخر check-in/تقارير معلقة/موافقات معلقة/فواتير غير مسددة) + فلاتر (تاريخ/فرع/تخصص/طبيب).
- `admin.appointments.tsx` (استبدال `/appointments-queue` القديم أو دمج) — CRUD كامل + notes + audit trail + إشعار + تصدير CSV.
- `admin.doctors.tsx` + `admin.doctors.$id.tsx` — إدارة الأطباء والفروع والتخصصات.
- `admin.schedules.tsx` — جداول أسبوعية + استثناءات + منع تداخل.
- `admin.patients.tsx` — بحث + عرض بحسب الصلاحية + دمج مكرر (workflow).
- `admin.reports.tsx` — رفع + مراجعة + نشر + سحب + versioning.
- `admin.billing.tsx` — إنشاء فاتورة + خصم بموافقة + refund workflow.
- `admin.insurance.tsx` — إدارة الموافقات، الشركات، الشبكات.
- `admin.content.tsx` — تحرير محتوى الصفحات (banners/FAQs/services).

كل الإجراءات الحساسة → `audit_logs`.

---

## المرحلة د — Super Admin `/admin/super/*`

- `admin.super.users.tsx` — إدارة المستخدمين + إسناد الأدوار (عبر `user_roles`).
- `admin.super.permissions.tsx` — مصفوفة تفاعلية (permission × role) → تحديث `role_permissions`.
- `admin.super.settings.tsx` — `system_settings` (jsonb).
- `admin.super.integrations.tsx` — قائمة التكاملات (Mock/Live) + آخر تشغيل + سجل الأخطاء.
- `admin.super.audit.tsx` — سجل التدقيق الموحد مع فلاتر.
- `admin.super.templates.tsx` — قوالب الإشعارات (SMS/WhatsApp/Email/Push) + معاينة.
- `admin.super.health.tsx` — حالة النظام (DB/Storage/Functions) + failed jobs.

---

## المرحلة هـ — Mock Adapters

`src/lib/integrations/` مع Adapters typed:
- `payments.mock.ts` — يحاكي Moyasar (payment_intent → confirm → webhook).
- `sms.mock.ts` + `whatsapp.mock.ts` — يسجلان في `notification_delivery_logs`.
- `insurance-eligibility.mock.ts` — يعطي رد شبه واقعي بناء على `insurance_providers`.
- `nafath.mock.ts` — يعيد نجاح مع تأخير.
- `otp.mock.ts` — OTP لوجستي لتجربة UX فقط، مع تنبيه واضح "غير مفعل في الإنتاج".

كل Adapter يظهر شارة "MOCK" في صفحة `admin.super.integrations`.

---

## المرحلة و — Design System + i18n

- إضافة CSS variables الجديدة في `styles.css`:
  - `--brand-teal-deep: 179 84% 21%` (#075E63)
  - `--brand-teal: 183 87% 30%` (#078A8F)
  - `--brand-aqua: 176 55% 95%` (#EAF8F7)
  - `--brand-gold: 37 44% 60%` (#C7A46B)
  - `--brand-navy: 200 55% 14%` (#102A35)
- خطوط: تحميل `IBM Plex Sans Arabic` + `Inter` عبر `<link>` في `__root.tsx`.
- توسيع i18n موحد `src/lib/i18n/portal.ts` مع مفاتيح لكل الشاشات الجديدة.
- Skeletons + Empty + Error + Retry موحدة (`PortalEmptyState`, `PortalErrorState`, `PortalSkeleton`).

---

## ما لن يتم لمسه

- نظام الحجز الحالي `/reservations/*` و `/book` — يبقى كما هو.
- Auth الحالي (Google + email) — لن أضيف OTP في هذه الجولة (يحتاج مزود SMS).
- Edge Functions — لن تُستخدم؛ كل الخادم عبر `createServerFn`.
- الجداول الحالية للمواعيد/التأمين/التقويم/التذكيرات — نبني فوقها.

---

## معايير الإنجاز

- TypeScript يمر، Build ينجح، RTL/LTR على كل الصفحات.
- كل صفحة فيها 5 حالات (Loading/Empty/Error/Success/Permission-denied).
- كل جدول جديد له RLS + GRANTs + سياسات مبنية على `has_permission`.
- شارة DEMO مرئية على الصفوف الموسومة.
- شارة MOCK مرئية على أي إجراء يمر عبر adapter وهمي.
- لا أسرار في الكود، لا service key في المتصفح.

---

## ترتيب التنفيذ (كل مرحلة ≈ turn/turnين)

1. Migration الأساس + الأدوار + RLS + Storage + seed DEMO.
2. Design tokens + خطوط + i18n + Layouts + Empty/Error/Skeleton.
3. صفحات المريض (overview → appointments → reports → invoices → insurance → prescriptions → family → profile → checkin).
4. البوابة الإدارية (dashboard → appointments → schedules → doctors → patients → reports → billing → insurance → content).
5. Super Admin (users → permissions matrix → templates → integrations → audit → health → settings).
6. Mock Adapters + ربطها بالإجراءات (دفع، إشعار، تحقق تأمين).
7. مراجعة نهائية: build + i18n sweep + a11y sweep + تقرير تنفيذ.

---

## قرار مطلوب

هل أبدأ من **الخطوة 1 (Migration الأساس)** الآن؟ أم تريد تعديل النطاق أولاً (مثلاً تأجيل Super Admin أو حذف بعض صفحات المريض)؟
