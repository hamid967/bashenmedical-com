# خطة إغلاق ثغرات UX في /book — الحجز الذكي + QA

منطقة الشغل ضخمة (~4,500 سطر عبر `book.tsx` + 20 مكوّن `booking/*` + `BranchBookingForm` + `CenterBookingForm` + `useSlotHold` + 3 endpoints في `api/public/book/*`). التنفيذ يتم على **4 دفعات صغيرة**، كل واحدة تُغلق تلقائيًا باختبار Playwright قبل الانتقال للدفعة التالية — بحيث تشوف الأثر خطوة‑بخطوة ولا نغرق في PR واحد.

## المبدأ الحاكم

- لا تعديل على سكيمة قاعدة البيانات.
- لا تعديل على منطق الحجز الأساسي (holds, waitlist, atomic guard). فقط تحسينات UX + رسائل + a11y + توازي AR/EN + تصلّب مسارات الخطأ.
- كل دفعة تنتهي بـ typecheck نظيف + اختبار e2e يمر.

---

## الدفعة 1 — UX الويزارد (رحلة `/book` الرئيسية)

**الملفات:** `src/routes/book.tsx`, `src/components/booking/Stepper.tsx`, `SlotHoldBanner.tsx`, `StepDate.tsx`, `StepTime.tsx`, `StepReview.tsx`, `StepSuccess.tsx`, `SummarySidebar.tsx`.

- **رسائل الخطأ الموحّدة**: تحويل كل رسائل `/api/public/book/*` (validation / conflict / db / hold_expired / already_booked / held_by_other) إلى مفاتيح ترجمة موحّدة، وعرضها في `SubmitErrorBanner` مع CTA مناسب (إعادة اختيار وقت / تسجيل في قائمة الانتظار / تحديث الشاشة).
- **حالات التحميل**: Skeletons موحّدة لخطوات التوفر (`StepDate`/`StepTime`) بدل Spinner فارغ + رسالة "لا توجد أوقات متاحة" مع CTA لقائمة الانتظار.
- **العودة/التقدّم**: تأكيد سلوك back/forward يحفظ الخطوة والبيانات (اختبارات موجودة) + إضافة `useBlocker` عند وجود بيانات غير محفوظة في الخطوات 3–7.
- **العدّاد**: تحسين `SlotHoldBanner` — تحذير مرئي عند تبقّي < 60 ثانية + انتقال سلس عند الانتهاء (إعادة إلى `StepTime` مع رسالة واضحة بدل صفحة خطأ).
- **زر التالي**: تعطيل ذكي مع سبب مرئي (tooltip / نص أسفل الزر) بدل زر معطّل صامت.

**نهاية الدفعة:** `tests/e2e/book-ux-messages.py` يتحقق من عرض رسائل خطأ عربية واضحة لكل حالة.

---

## الدفعة 2 — A11y + لوحة المفاتيح + قارئ الشاشة

**الملفات:** `Stepper.tsx`, `StepShell.tsx`, `Field.tsx`, كل `Step*.tsx`, `SlotHoldBanner.tsx`, `SubmitErrorBanner.tsx`, `BranchBookingForm.tsx`, `CenterBookingForm.tsx`.

- **Focus management**: عند الانتقال بين الخطوات، ينتقل التركيز تلقائيًا إلى عنوان الخطوة (`h2` مع `tabIndex={-1}` + `focus()` عند التغيير).
- **aria-live**: منطقة `role="status"` لعدّاد الحجز، و`role="alert"` لرسائل الخطأ داخل الويزارد.
- **Labels**: مراجعة كل حقول `Field.tsx` + `StepPatient` + `StepDate` للتأكد من `htmlFor` صريح، وليس فقط placeholder.
- **زر التالي/السابق**: حجم لمس ≥ 44×44 (تصنيف `min-h-11 min-w-11` على الموبايل) + focus-visible واضح.
- **RTL/LTR**: مراجعة `dir` على الأيقونات (Chevron) والحقول (`inputMode="tel"` للجوال) والأرقام (`ar-SA-u-nu-latn`).
- **Contrast**: مراجعة أي `text-muted-foreground/50` أو ألوان أرقام العدّاد على الخلفيات الملوّنة.

**نهاية الدفعة:** `tests/a11y/book_axe_zero_violations.py` يجب أن يعطي 0 مخالفات على `/book` (AR + EN) للفئات: `label`, `button-name`, `color-contrast`, `aria-required-attr`, `focus-visible`.

---

## الدفعة 3 — توازي AR/EN في كامل الرحلة

**الملفات:** `src/locales/{ar,en}/booking.json`, كل ملفات `booking/*` + النموذجين المباشرين.

- **جرد**: سكربت `scripts/audit-book-i18n.mjs` يمشي على كل السلاسل النصية في `book.tsx` + `components/booking/*` + `BranchBookingForm` + `CenterBookingForm` ويرصد أي `hardcoded` عربي/إنجليزي غير مربوط بـ `t()`.
- **إكمال المفاتيح المفقودة** في `booking.json` (AR + EN) — خصوصًا رسائل الخطأ الجديدة من الدفعة 1.
- **التواريخ والأرقام**: توحيد `formatDate`/`formatTime` على `ar-SA-u-nu-latn` و`en-US` حسب اللغة الحالية، مع دعم AM/PM بالعربي.
- **اتجاه الأرقام في العدّاد**: منع `flip` في `dir="rtl"` باستخدام `dir="ltr"` صريح على العدّاد والأرقام الطبية (MRN).
- **رسائل السيرفر**: تعديل `/api/public/book/{hold,availability,create}` لإرجاع `kind` كودي فقط (بدون رسائل)، ويتم ترجمة الـ `kind` على العميل.

**نهاية الدفعة:** `tests/e2e/book_bilingual_parity.py` يفتح `/book?lang=ar` و`/book?lang=en` ويقارن أن كل خطوة عندها نص بنفس اللغة (لا تسرّب لغة معاكسة).

---

## الدفعة 4 — E2E شامل (تغطية مسارات النجاح والفشل)

**الملفات:** `tests/e2e/book-*.py` (جديدة + توسيع الموجود).

اختبارات جديدة (Playwright + Python):

1. `book_full_journey_ar.py` — رحلة كاملة عربي من `/doctors` → `/book` → نجاح → QR + PDF.
2. `book_full_journey_en.py` — نفس الرحلة بالإنجليزي.
3. `book_hold_expired_recovery.py` — انتظار انتهاء الـ hold ثم التحقق من الرسالة والعودة السلسة.
4. `book_slot_taken_during_review.py` — محاكاة `already_booked` عند step 8 والتحقق من عرض قائمة الانتظار كخيار.
5. `book_branch_form_full.py` — رحلة كاملة عبر `BranchBookingForm`.
6. `book_center_form_full.py` — رحلة كاملة عبر `CenterBookingForm`.
7. `book_keyboard_only.py` — إتمام الحجز بلوحة المفاتيح فقط (Tab/Enter/Escape).

كل الاختبارات تُضاف إلى `.github/workflows/ci.yml` ضمن مصفوفة الحجز.

---

## سؤال للمهندس حامد قبل البدء

أبدأ فورًا بـ **الدفعة 1 (UX الويزارد)**، أم تفضّل ترتيب مختلف (مثلًا A11y أولًا لأنها أعلى قيمة لبعض المستخدمين)؟
