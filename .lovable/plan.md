# تطوير حساب المريض ولوحة المستخدم — خطة تنفيذية

بقيادة م. حامد. المبدأ: **فحص أولاً، ثم مراحل تدريجية تحافظ على ما يعمل**، لا إعادة كتابة شاملة.

> ملاحظة: البنية الحالية TanStack Start (وليس Next.js 15). سنبقي عليها لأنها متوافقة مع كل المتطلبات (SSR/RSC-lite, RLS, PWA, RTL). كل ما ذُكر من مزايا قابل للتنفيذ عليها بدون تغيير الإطار.

---

## المرحلة 0 — فحص وجرد (Read-only، بدون كود)

المخرجات تُسلَّم كتقرير `docs/audit/patient-portal-v2-audit.md`:

1. **جرد المسارات والصفحات** تحت `src/routes/_authenticated/portal/*` + `/auth` + `/reservations*` + `/book`.
2. **جرد الوظائف** (تعمل / متعطلة / ناقصة) لكل شاشة: مواعيد، تقارير، وصفات، فواتير، تأمين، طلبات، عائلة، إشعارات، ملف شخصي.
3. **جرد الجداول وسياسات RLS** المرتبطة (appointments, patients, dependents, medical_reports, prescriptions, invoices, insurance_*, service_inquiries, notifications, push_subscriptions, profiles, user_roles).
4. **ثغرات أمنية**: سياسات مفقودة/فضفاضة، GRANTs، Signed URLs في storage، تسريب بيانات في السجلات.
5. **فجوات UX/A11y**: حالات فارغة/خطأ ناقصة، RTL/LTR، Bottom Nav، Safe Areas.
6. **الأداء**: LCP/INP/CLS الحالية للبوابة، حجم الحزم.

بدون هذا التقرير لا نبدأ أي تعديل — هذا صريح في الأمر.

---

## المراحل التنفيذية (بعد اعتماد الفحص)

### Phase 1 — Auth & Sessions Hardening (لا UI جديد)
- توحيد مسارات `/auth` (تسجيل/دخول/OTP/استعادة/تحديث جوال).
- OTP: انتهاء صلاحية، Rate Limit، عدّاد محاولات، CAPTCHA بعد فشل متكرر (server-side).
- سجل جلسات + قائمة الأجهزة + "خروج من كل الأجهزة".
- سجل دخول (audit).
- **لا محاكاة OTP في الإنتاج** — flag صريح.

### Phase 2 — Portal Shell & Navigation
- Sidebar (desktop) + Bottom Nav (mobile) مع Safe Areas.
- Design Tokens v2 مُطبّقة أصلًا؛ نضيف Skeletons/Empty/Error موحدة لكل شاشة.
- Dashboard يجيب فورًا على الأسئلة الخمسة (موعد قادم، تقرير جديد، دفعة، تأمين معلّق، طلب يحتاج إجراء).

### Phase 3 — Smart Booking Integration داخل البوابة
- إعادة استخدام `/book` wizard لكن مع سياق المريض النشط (self / dependent).
- Slot hold + عدّاد + إعادة تحقق قبل التأكيد (موجود جزئيًا — نُكمل).
- منع الحجز المزدوج بمعاملة atomic في DB.

### Phase 4 — Appointments Center
- تبويبات: قادمة/معلقة/سابقة/ملغاة.
- الإجراءات: تأكيد، إعادة جدولة، إلغاء، Check-in، QR، ICS، تنزيل تأكيد، طلب متابعة.
- تسجيل وصول رقمي ضمن نافذة يحددها Super Admin (setting).

### Phase 5 — Medical Records
- تقارير (مختبر/أشعة/ملخصات/شهادات/تحويلات) + بحث/فلاتر.
- **Signed URLs فقط** (مدة قصيرة)، سجل وصول للمستند.
- إشعار عند نشر تقرير جديد.

### Phase 6 — Prescriptions / Invoices / Insurance
- وصفات: عرض + تنزيل آمن + طلب تجديد (إذا مسموح).
- فواتير: عرض + دفع فعلي (بدون نجاح وهمي — الاعتماد على webhook البوابة).
- التأمين: عضوية مقنّعة، حالة الموافقات، المستندات الناقصة.

### Phase 7 — Requests / Inquiries Hub
- توحيد الطلبات من (الموقع/واتساب/الدعم/الاستقبال/البوابة) في شاشة واحدة للمريض.
- إضافة مرفقات + رد آمن.

### Phase 8 — Family (Dependents)
- إضافة تابع، تحقق علاقة، تبديل ملف نشط ظاهر بوضوح، صلاحيات وصول.

### Phase 9 — Notifications Center
- داخل التطبيق + SMS/WhatsApp/Email/Push (البنية موجودة).
- عرض حالة التسليم فقط عند تأكيد المزود.

### Phase 10 — Profile & Privacy
- بيانات + تفضيلات + موافقات + جلسات/أجهزة.
- تغيير الحساس يتطلب OTP إضافي.

### Phase 11 — AI Assistant (محدود الصلاحيات)
- Actions فقط ضمن بيانات المستخدم؛ لا تشخيص/وصف علاج؛ تأكيد قبل أي تغيير؛ audit كامل.

### Phase 12 — QA شامل
TypeScript strict، Lint، Build، Unit، RLS، Playwright E2E (السيناريوهات الـ13 المذكورة)، a11y (WCAG 2.2 AA)، RTL/LTR، متصفحات.

---

## Change Manifest (سيصدر بعد كل مرحلة)
لكل مرحلة: الملفات المتأثرة + migrations + سياسات RLS + خطة اختبار + خطة تراجع (rollback SQL أو feature flag).

## Rollback
- كل migration له عكس صريح.
- الميزات الجديدة خلف flags قابلة للإطفاء فورًا.
- نسخة snapshot لسياسات RLS قبل كل batch.

---

## المطلوب من م. حامد الآن
اعتماد **المرحلة 0 (الفحص فقط)** لأبدأ بها وأسلّم تقرير الجرد + Change Manifest المفصّل قبل أي تعديل كود.
