# Public Read Allowlist — SECURITY DEFINER Functions

هذه القائمة تحدّد الدوال التي **يُسمح** لدور `PUBLIC` / `anon` باستدعائها في قاعدة البيانات. أي دالة `SECURITY DEFINER` خارج هذه القائمة يجب أن تكون **مُنزوعة** الصلاحية من `PUBLIC` و`anon` (تُفرَض blocking عبر `tests/security/test_secdef_privileges.py` في CI).

المصدر الرسمي للقائمة: `PUBLIC_READ_ALLOWLIST` في `tests/security/test_secdef_privileges.py`. **حدّث المستندين معاً** في نفس الـPR.

## قواعد الإدراج

قبل إضافة اسم إلى allowlist يجب أن يستوفي **واحداً على الأقل** مما يلي:

1. **قراءة عامّة صرفة** لبيانات كتالوج غير حسّاسة (أطباء، فروع، تخصصات، مقالات صحية، FAQ).
2. **حماية داخلية عبر OTP/Token** داخل جسم الدالة (رقم جوال + رمز، أو token موقّع).
3. **مساعد ضروري لـRLS/hydration** يحتاجه الفرونت قبل تسجيل الدخول (`has_role`, `get_my_roles`).
4. **مسار حجز/دفع للضيوف** يعتمد على تحقق داخلي (`book_appointment_atomic`).

لا يُقبل الإدراج لأن "الفرونت يحتاجها" فقط — يجب توثيق آلية الحماية الداخلية أدناه.

---

## الفئات

### 1) كتالوج عام (قراءة فقط)

| الدالة | السبب |
|---|---|
| `search_doctors` | بحث عام في الأطباء المفعّلين فقط. |
| `get_public_doctor` | بطاقة طبيب واحدة — حقول عامة فقط. |
| `list_public_doctors` | قائمة الأطباء لصفحة `/doctors`. |
| `list_public_doctors_for_rating` | نسخة مبسّطة للتقييمات العامة. |
| `list_public_branches` / `list_branches_public` | قائمة الفروع. |
| `list_public_branches_for_rating` | فروع لتصفية التقييمات. |
| `list_specialties_public` | التخصصات لواجهة البحث. |
| `list_public_excellence_centers` | مراكز التميّز — بيانات ترويجية. |
| `specialty_doctor_counts` | عدّاد لعرض واجهة الرئيسية. |
| `get_health_articles_public` | المقالات المنشورة فقط (`status = 'published'`). |
| `get_faqs_public` | أسئلة شائعة منشورة. |
| `get_public_doctor_rating_summary` | متوسط التقييم — أرقام مجمّعة. |
| `list_public_doctor_ratings` | التقييمات العامة (بدون معلومات المريض). |

### 2) توفّر المواعيد والحجز للضيوف

| الدالة | السبب |
|---|---|
| `get_available_slots` | الفتحات المتاحة — قراءة عامة. |
| `list_doctors_next_slot` | أقرب موعد لعرض الرئيسية. |
| `doctor_next_available_date` | بطاقة الطبيب. |
| `check_slot_hold` | التحقق من صلاحية `slot_hold` قبل التأكيد. |
| `estimate_appointment_cost` | تقدير سعر عام (بدون بيانات مريض). |
| `book_slot` | حجز فتحة للضيف — يفرض قفلاً ذرياً داخل الدالة. |
| `book_appointment_atomic` | إنشاء حجز الضيف مع تحقق `_assert_slot_free`. |

### 3) مسارات محميّة بـOTP/Token داخل الدالة

كل دالة هنا تطلب رقم الجوال + كود OTP (أو token موقّع) داخل جسمها؛ فشل التحقق يُرجع خطأ قبل أي تعديل.

| الدالة | آلية الحماية |
|---|---|
| `lookup_appointment` | phone + OTP |
| `track_appointment` | phone + OTP |
| `cancel_appointment_by_ref` | phone + OTP + `_enforce_owner_cancel_only` |
| `reschedule_appointment_by_ref` | phone + OTP |
| `list_appointment_audit_by_ref` | phone + OTP |
| `update_reminders_by_ref` | phone + OTP |
| `list_reminder_preferences_by_ref` | phone + OTP |
| `submit_public_rating` | phone + OTP + one-time token |
| `confirm_waitlist_offer` | OTP في رابط الدعوة |
| `lookup_complaint` | رقم شكوى + OTP |
| `track_orders_by_phone` | phone + OTP |
| `get_order_by_ref` | ref + OTP |
| `cancel_order_by_ref` | ref + OTP |
| `claim_service_inquiry` | token موقّع في الرابط |

### 4) مساعدو RLS/hydration

| الدالة | السبب |
|---|---|
| `has_role` | تُستخدَم داخل سياسات RLS للكتالوج + الفرونت لعرض القوائم قبل تسجيل الدخول. سحبها يكسر كل السياسات المعتمدة عليها. |
| `get_my_roles` | يُستدعى بعد تسجيل الدخول لبناء القائمة الجانبية. |
| `get_my_doctor_id` | ربط جلسة الطبيب ببياناته. |
| `is_inquiry_staff` | يُستدعى داخل سياسات RLS لجدول `service_inquiries`. |
| `has_active_consent` | فحص موافقة سارية قبل عرض بعض الميزات. |

---

## كيف تُضيف دالة جديدة

1. تأكد أن الدالة تستوفي إحدى قواعد الإدراج أعلاه، ووثّق آلية الحماية.
2. أضف الاسم إلى:
   - `PUBLIC_READ_ALLOWLIST` في `tests/security/test_secdef_privileges.py`.
   - الجدول المناسب في هذا الملف مع سطر تعليل واضح.
3. في نفس الـPR، أرفق migration بـ `GRANT EXECUTE ... TO PUBLIC` (أو `anon`) مع تعليق `-- allowlisted: <السبب>`.
4. سيتحقق CI job `security-secdef-guard` من عدم وجود انحدار.

## كيف تُزيل دالة

1. Migration بـ `REVOKE EXECUTE ... FROM PUBLIC, anon`.
2. احذف الاسم من allowlist في ملف الاختبار وهذا الملف.
3. إن كان الفرونت يستدعيها، حوّل الاستدعاء إلى server function محمي بـ `requireSupabaseAuth`.

## قواعد صارمة

- لا يُدرج أي اسم يبدأ بـ`_` (داخلي/محفّز) — CI يرفضها تلقائياً.
- لا يُدرج أي `SECURITY DEFINER` writer بدون OTP/token داخلي.
- لا يُمنح `service_role` عبر `PUBLIC` أبداً.
- لا يُستخدم `GRANT ... TO PUBLIC` كحلّ سريع لخطأ `permission denied` — الحلّ الصحيح تحويل الاستدعاء إلى مسار مصادق أو إضافة حماية داخلية موثّقة.
