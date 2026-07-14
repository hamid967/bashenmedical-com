# نظام استفسار خدمات الواتساب — تصميم تراث جازان

خطة شاملة، سأنفّذها على مراحل بعد موافقتك. لأن الطلب ضخم جدًا (widget + form + DB + admin + portal + auth linking + notifications + audit)، أقترح تقسيمه إلى **3 دفعات** بحيث تراجع كل دفعة قبل الانتقال للتالية.

---

## الدفعة 1 — الأساس (Widget + Form + DB + wa.me handoff)

### قاعدة البيانات (migration واحدة)
- `service_catalog` — الخدمات الـ16 المطلوبة (ar/en/department/order/active). Seed أولي.
- `service_inquiries` — الحقول المذكورة + `request_number` فريد + `internal_status` (`new|contacted|awaiting_patient|appointment_created|completed|cancelled`) + `whatsapp_handoff_status` (`not_opened|opened|delivery_unverified|delivered|failed`) + `source` + FKs (nullable) لـ user/service/specialty/doctor/branch/insurance/appointment/consent.
- `service_inquiry_updates` — سجل تغييرات ثابت (append-only trigger).
- توليد `BMC-WA-YYYYMMDD-0001` عبر دالة SQL `SECURITY DEFINER` + عدّاد يومي (concurrency-safe عبر `INSERT ... ON CONFLICT ... RETURNING`, مثل جدول `branch_mrn_counter` الموجود).
- RLS:
  - anon: `INSERT` فقط عبر server function (لا SELECT).
  - authenticated: `SELECT` صفوف حيث `user_id = auth.uid()`.
  - admin/staff: كامل عبر `has_role`.
- GRANTs صريحة لكل جدول.

### Widget (`FloatingWhatsAppButton.tsx`)
- إعادة بناء بـ HTML/CSS: كبسولة فاتحة، حدّ ذهبي، نقش جازان (SVG صغير inline لأنماط المعينات) على اليسار في RTL / اليمين في LTR، دائرة واتساب خضراء، سهم.
- Fixed bottom-start (يستخدم `start-4` فيتحوّل تلقائيًا). مسافة أسفل كافية حتى لا يغطي `WhatsAppFab` الحالي — سنستبدله بهذا.
- Animation دخول خفيفة + hover scale. Responsive: نص مختصر على الموبايل.
- زر إغلاق صغير (X) يخفيه لهذه الجلسة (`sessionStorage`).
- `aria-label="استفسر عن خدمات مجمع باعشن عبر واتساب"`.
- نُضيفه في `__root.tsx` بدل `WhatsAppFab`.

### Dialog / Bottom sheet (`ServiceInquiryDialog.tsx`)
- shadcn `Dialog` على الديسكتوب، `Drawer` (vaul) على الموبايل.
- عنوان: «استفسر عن خدمات مجمع باعشن».
- الحقول المطلوبة/الاختيارية كما في المواصفة. **لن نطلب الهوية/الإقامة افتراضيًا** (نعرضه فقط كحقل اختياري مطوي).
- Zod validation عربية + normalize للجوال إلى `9665XXXXXXXX`.
- موافقة الخصوصية checkbox إلزامية → نسجّل صفًا في `consent_records`.
- المرفق: input بسيط في الدفعة 1 (رفع فعلي في الدفعة 3 مع Signed URLs).

### تدفّق الإرسال
1. Validate → 2. server fn `createServiceInquiry` (public, rate-limited عبر IP hash + last-submission cookie) → 3. يُنشئ الصف ويُعيد `request_number` → 4. يعرض `ConfirmationView` داخل نفس الحوار (رقم الطلب، الخدمة، التاريخ، الحالة، حالة handoff = `not_opened`).
5. زر «فتح واتساب» → يُحدّث `whatsapp_handoff_status='opened'` (server fn) ثم يفتح `wa.me` في تبويب جديد بالرسالة المحدّدة.
6. رقم واتساب: نقرأه من `clinic_settings.whatsapp_number` (موجود؟ سنتحقق) وإلا نعرض تحذير للأدمن. لن نستخدم أي رقم افتراضي.

### حالة النجاح
- تبقى صفحة التأكيد مفتوحة (لا redirect تلقائي).
- زران: «أنشئ حسابك لمتابعة الطلب» → `/auth?intent=link_inquiry&ref=BMC-WA-...` و«لدي حساب بالفعل» → نفس المسار مع تبويب Sign-in.

---

## الدفعة 2 — الحساب والربط والبورتال

- تعديل `/auth`: يقبل `intent=link_inquiry&ref=...` ويحفظ الـ ref في sessionStorage.
- بعد تسجيل الدخول/OTP: server fn `linkInquiryToUser({ ref })` — يتحقق من تطابق `mobile_number` مع رقم الحساب (verified) ثم يضبط `service_inquiries.user_id`. **لا ربط بالرقم فقط دون تطابق OTP.**
- OTP: نستخدم Supabase phone OTP الحالي (نتحقق أنه مفعّل، وإلا سنطلب تفعيله في هذه الدفعة).
- صفحة `/portal/inquiries` — «طلباتي واستفساراتي»: قائمة + تفاصيل + محادثة (تستخدم `service_inquiry_updates` مع `public_message`) + رفع مرفقات + زر إلغاء (إذا `internal_status in ('new','contacted')`) + زر «تحويل إلى موعد» (يفتح `/book` مع prefill).

---

## الدفعة 3 — الأدمن + الأمان + الإشعارات

- `/admin/service-inquiries` — جدول مع الفلاتر المذكورة + إخفاء جزء من الجوال (`05••••1234`) + إجراءات (assign, status, internal note, request info, link/create appointment, close). كل تغيير → صف في `service_inquiry_updates` + `audit_logs`.
- CRUD لـ `service_catalog` في `/admin/service-catalog` (add/edit/disable/reorder).
- Rate limiting server-side: جدول `public_submission_rate` أو استخدام `security_audit_log` الموجود؛ حد أقصى 3 طلبات/جوال/ساعة و10/IP/ساعة.
- CAPTCHA: hCaptcha invisible يُفعَّل بعد أول رفض rate-limit (سنستخدم secret مضاف عبر add_secret إذا وافقت).
- المرفقات: bucket خاص `inquiry-attachments` (private) + Signed URLs 15 دقيقة، حد 5MB، أنواع محددة (pdf/jpg/png).
- الإشعارات: in-app (جدول `notifications` الموجود) + SMS/WA فقط إذا كان provider مُهيّأ في `clinic_settings` — وإلا نتخطى بصمت ولا نُعلن «تم التسليم».
- حالة handoff «delivered» لا تُضبط أبدًا من الواجهة — فقط عبر webhook مستقبلي من WhatsApp Business API (سنترك route `/api/public/hooks/wa-status` جاهز لكن معطّل بلا secret).

---

## أسئلة قبل البدء

1. **رقم واتساب الرسمي**: هل نستخدم القيمة من `clinic_settings` (سأتحقق من العمود)، أم تريد إدخال رقم الآن؟ الحالي في `SITE.whatsapp = 966555088623` — هل هذا الرقم الرسمي المعتمد للواتساب؟
2. **الاستبدال أو التعايش**: أستبدل `WhatsAppFab` القديم بالكامل بالويدجت الجديد، صحيح؟
3. **OTP بالجوال**: هل هو مفعّل بالفعل في المشروع؟ (لم أرَ إعداد SMS provider). إن لم يكن، هل نبدأ بـ email OTP للربط في الدفعة 2 ثم نضيف SMS لاحقًا؟
4. **هل تفضّل تنفيذ الدفعات الثلاث دفعة واحدة** (رد ضخم واحد، وقت أطول، مراجعة أصعب) **أم دفعة تلو الأخرى** (موصى به)؟

بمجرد إجاباتك سأبدأ فورًا بالدفعة 1 (migration + widget + dialog + submit + confirmation + wa.me handoff).
