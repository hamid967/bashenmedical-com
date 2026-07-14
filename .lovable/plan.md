# خطة بناء نظام الحجز الذكي + لوحة المريض (Baeshen)

المواصفات ضخمة (30 قسم). بدلاً من إعادة كتابة كل شيء دفعة واحدة (ما يكسر ما يعمل حالياً)، سأنفّذها على **7 دفعات مركّزة** — كل دفعة تُسلَّم كاملة (DB + خادم + واجهة + اختبار) قبل الانتقال للتي بعدها. تحتاج تأكيدك على النقاط في نهاية الخطة قبل البدء.

---

## ما يوجد الآن (بعد الفحص)

- `/book` — معالج 9 خطوات يعمل (types.ts, StepService..StepSuccess, submitBooking, idempotency-key). مبني على `appointments` + `availability` + `availability_slots`.
- `/patient/*` بوابة موجودة (30+ صفحة) عبر `_authenticated/`.
- `/reservations/*`, `/my-orders`, `/track`, `/lookup` — سطوح متعددة للحجز (تكرار).
- جداول: `appointments`, `availability`, `availability_slots`, `appointment_waitlist`, `appointment_audit`, `dependents`, `patients`, `doctors`, `branches`, `specialties`, `insurance_providers`, `insurance_approvals`, `payments`, `notifications`.
- **مفقود جوهرياً:** `slot_holds` (تعليق مؤقت للموعد)، حالة "held/pending_*"، OTP هاتف، ربط ضيف→حساب، تدفّق دفع فعلي، تدفق إعادة جدولة/إلغاء موحّد من البوابة، إعدادات Super Admin (كلها مبعثرة).

---

## الدفعات (تُنفَّذ بالترتيب)

### الدفعة 1 — أساس البيانات (يوم واحد)
- Migration: `slot_holds` (patient_ref, doctor_id, date, time, expires_at, idempotency_key).
- توسيع `appointments.status` لتشمل: `held, pending_verification, pending_payment, checked_in, in_progress, no_show`.
- `appointment_status_history` (منفصل عن audit، مرتبط بـ status transition).
- RPC واحد `book_appointment_atomic(...)` بمعاملة SERIALIZABLE: يتحقق من عدم التعارض ويحجز في استعلام واحد. يستبدل الفحص المزدوج الحالي في `create.ts`.
- Indexes: `(doctor_id, appointment_date, appointment_time)` UNIQUE partial على الحالات النشطة.
- RLS + GRANTs لكل جدول جديد.

### الدفعة 2 — محرّك الحجز الجديد (`/book`)
- إعادة استخدام معالج الـ 9 خطوات القائم مع:
  - تعليق الفتحة (5 دقائق) عند الوصول لخطوة الوقت + عدّاد مرئي.
  - إعادة التحقق قبل الإرسال.
  - رسالة "تم الحجز للتو" + اقتراحات ذكية (أقرب وقت/طبيب آخر/فرع آخر/قائمة انتظار).
- إضافة نقطة دخول "أقرب موعد متاح" (استعلام واحد يرجّع أول فتحة عبر كل الأطباء المطابقين).
- إضافة "حجز لأحد أفراد الأسرة" (dependents) في الخطوة 1 للمسجّلين.

### الدفعة 3 — OTP هاتف + ربط ضيف→حساب
- تكامل SMS عبر connector (Twilio/Unifonic). طلب secret واحد.
- جدول `otp_codes` (hash فقط، expire 5 دقائق، rate-limit 3 محاولات).
- تعديل الخطوة 6: OTP إلزامي للجدد، اختياري للمسجّلين.
- بعد التأكيد، دعوة "أنشئ حسابك" — الربط عبر مطابقة الهاتف + OTP جديد فقط (لا عبر booking reference).

### الدفعة 4 — لوحة المريض المعاد تصميمها (`/patient`)
- بطاقات: الموعد التالي، تقارير جديدة، وصفات، فواتير، موافقات تأمين، إجراءات مطلوبة.
- تبويبات مواعيدي: قادمة/معلّقة/سابقة/ملغاة.
- تدفّق موحّد لإعادة جدولة + إلغاء (يستخدم `slot_holds`).
- Bottom nav للجوال (5 عناصر)، sidebar للـ desktop.
- Check-in رقمي (QR + نافذة زمنية).

### الدفعة 5 — قائمة الانتظار + الإشعارات
- توسيع `appointment_waitlist` الموجود + تشغيله فعلياً: عند تحرّر فتحة → notify → hold تلقائي 10 دقائق → confirmation بضغطة.
- مركز إشعارات موحّد (in-app + SMS + email + WhatsApp) مع تفضيلات القناة.

### الدفعة 6 — التقارير + الفواتير + التأمين
- توحيد `medical_reports`/`lab_reports`/`radiology_reports` في عرض واحد مع signed URLs (Storage) بدل روابط عامة.
- ربط `payments` بمزوّد سعودي (بوابة موجودة أو Paddle). لا محاكاة نجاح.
- عرض `insurance_approvals` مع الحالات الكاملة والوثائق المطلوبة.

### الدفعة 7 — Admin/Reception Console + Super Admin Settings
- Command Center: جدول اليوم، timeline، مواعيد الطوارئ، تحويلات.
- `system_settings` — نقل كل الثوابت (slot hold duration, cancellation window…) لواجهة إدارة.
- سجل تدقيق لكل تغيير حسّاس.

---

## تفاصيل تقنية

- كل الجداول الجديدة: RLS + GRANT + `service_role` (وفق قواعد Cloud).
- Server-only logic عبر `createServerFn` أو `/api/public/*` (الأخير للـ webhooks/OTP فقط بعد signature verification).
- التوقيت: كل مقارنة "اليوم" تمرّ عبر `riyadhTodayIso()` الموجود.
- Realtime: `useRealtimeInvalidation` الحالي يوسَّع ليشمل `slot_holds`.
- i18n: كل نص جديد عبر `src/locales/{ar,en}/*.json`.
- لا حذف لصفحات موجودة قبل التأكد من عدم كسر تدفّقات؛ التوحيد تدريجي (`/reservations/*` تبقى redirect إلى `/book` في الدفعة 2).

## ما لن أفعله

- لن أستبدل `client.ts`, `auth-middleware.ts`, `types.ts` (auto-gen).
- لن أنشئ Edge Functions لمنطق داخلي (كل شيء `createServerFn`).
- لن أُدخل بوابة دفع أو مزوّد SMS دون طلب مفاتيحه صراحة.

---

## أحتاج تأكيدك على:

1. **مزوّد SMS للـ OTP**: هل لديك Twilio/Unifonic/آخر؟ (سأطلب المفاتيح في الدفعة 3.)
2. **بوابة الدفع**: هل نفعّل Lovable Stripe المدمج (بدون حساب) أم لديك بوابة سعودية محدّدة (Moyasar/HyperPay)؟
3. **البدء بالدفعة 1** (أساس البيانات + RPC ذرّي) الآن؟ أم تفضّل ترتيباً مختلفاً؟