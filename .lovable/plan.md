# Change Manifest — نظام حجز أحادي الصفحة على `/book`

> ⚠️ **ملاحظة تقنية مهمة قبل البدء**
> الأمر مكتوب لـ Next.js 15 App Router، لكن هذا المشروع يعمل على **TanStack Start + React 19 + Vite**، وليس Next.js. لا يمكن التحويل إلى Next.js دون إعادة بناء كامل. سأنفّذ نفس التصميم والمنطق بالكامل باستخدام TanStack Start (نفس React 19 / TypeScript strict / Tailwind / shadcn / Framer Motion / TanStack Query / RHF+Zod / Supabase / date-fns). التنقل بين المراحل عبر `router.navigate({ search })` بدون Full Reload يتحقق بنفس السلوك تمامًا.

## 1. الوضع الحالي (فحص)

نظام الحجز موجود ويغطي جزءًا كبيرًا من المطلوب — لن أنشئ نظامًا موازيًا:

| موجود | الملف/الجدول |
|---|---|
| صفحة أحادية بـ 9 مراحل | `src/routes/book.tsx` (988 سطر) + `src/components/booking/Step*.tsx` |
| Slot Hold + مؤقت 5 دقائق | `src/lib/booking-hold.ts`, `src/routes/api/public/book/hold.ts`, جدول `slot_holds`, `SlotHoldBanner.tsx` |
| Idempotency Key + Submit | `src/lib/booking-submit.ts`, `src/routes/api/public/book/create.ts` |
| Availability APIs | `book/availability.ts`, `book/month-availability.ts` |
| Waitlist + Cancel + Track | `book/waitlist*.ts`, `cancel.ts`, `track.ts` |
| جداول DB | `appointments`, `appointment_slots`, `slot_holds`, `appointment_status_history`, `appointment_waitlist`, `appointment_audit` |
| Dependents / OTP / Insurance | `DependentPicker.tsx`, `EmailOtpLinker.tsx`, `InsuranceSection.tsx` |
| لوحة الإدارة للحجوزات | `/admin/appointments` + Audit Logs |

## 2. الفجوات مقارنة بالمواصفات

1. **تنقّل المراحل**: يعتمد state داخلي فقط — لا يعكس المرحلة في URL (`?step=…`)، فزر رجوع المتصفح لا يتنقّل بين المراحل.
2. **`booking-confirmation` صفحة منفصلة**: يخالف شرط "كل شيء داخل `/book`". يجب دمجها كـ `step=success`.
3. **رقم الحجز**: صيغة `BMC-YYYYMMDD-XXXX` غير مُطبَّقة (يستخدم UUID/reference موجود بصيغة مختلفة).
4. **الدالة الذرية `confirm_appointment_booking`**: التأكيد الحالي يستخدم عدة عمليات — يجب لفّها في Postgres function واحدة مع `SELECT … FOR UPDATE` وإعادة معالجة idempotency على الخادم.
5. **حالة عامة موحّدة**: `useReducer` داخل `book.tsx` (988 سطر) — أفصل إلى `features/booking/store/` مع Actions المذكورة (`RESET_AFTER_BRANCH`…).
6. **Focus / A11y / Live regions** عند تغيير المرحلة غير مكتملة.
7. **Bottom Sheet ملخص الحجز على الجوال** — الحالي Sidebar فقط.
8. **Prefetch للمرحلة التالية** غير مطبّق.
9. **PatientType = new_patient** كخيار مستقل (زائر) غير مفصول عن `self`.
10. **Draft version + expiresAt** غير مُطبَّق في sessionStorage.

## 3. الخطة (تدريجية، بدون كسر ما يعمل)

### المرحلة 1 — تصدير المرحلة إلى URL وإلغاء الصفحة المنفصلة
- إضافة `validateSearch` لـ `/book` مع `step` enum (patient/branch/service/doctor/slot/verification/insurance/review/success) + `ref` للحجز الناجح.
- استخدام `router.navigate({ search, replace: true })` لتحديث المرحلة.
- دعم زر رجوع المتصفح عبر `useSearch` كمصدر حقيقة للمرحلة.
- دمج `booking-confirmation.tsx` كـ `step=success&ref=BMC-…` — إعادة توجيه القديم للحفاظ على الروابط الخارجية.

### المرحلة 2 — إعادة تنظيم بنية الملفات (بدون نسخ منطق)
إنشاء `src/features/booking/` كنقطة تجميع مع:
- `store/booking.store.ts` (Zustand أو نقل reducer الحالي)
- `types/booking.types.ts` (BookingDraft + BookingStep + PatientType)
- `schemas/*.schema.ts` (Zod لكل مرحلة)
- `hooks/useBookingFlow.ts`, `useBookingDraft.ts` (نقل من `book.tsx`)
- `utils/booking-steps.ts` (mapping + navigation)
- المكوّنات الحالية `src/components/booking/Step*.tsx` تبقى مكانها وتستورد من `features/booking`.
- تقليص `book.tsx` من 988 سطر إلى ~200 سطر orchestrator.

### المرحلة 3 — رقم الحجز + Atomic function
- Migration: دالة `public.confirm_appointment_booking(p_hold_id, p_idempotency_key, p_patient_payload jsonb)` في transaction واحد مع `FOR UPDATE`، تُرجع `reference_number` بصيغة `BMC-YYYYMMDD-XXXX` (sequence يومي per date).
- تحديث `book/create.ts` لاستدعاء الدالة فقط بدل التسلسل الحالي.
- إعادة استخدام `idempotency_key` على الخادم: إن وُجد سجل بنفس المفتاح، إرجاع نفس النتيجة.

### المرحلة 4 — Draft + Bottom Sheet + A11y + Motion
- Draft schema versioned `{ version:1, data, savedAt, expiresAt }` في sessionStorage للزائر، وفي جدول `booking_drafts` (جديد) للمسجّل.
- `SummarySheet` جوّال (shadcn `Sheet`) + شريط أزرار ثابت أسفل مع Safe Area.
- Focus management: التركيز على H1 المرحلة الجديدة + `aria-current="step"` + `aria-live="polite"` للأخطاء/النجاح.
- Framer Motion enter/exit مع احترام `prefers-reduced-motion` واتجاه RTL.

### المرحلة 5 — Prefetch + PatientType.new_patient + اختبارات
- Prefetch للمرحلة التالية فقط عبر `queryClient.prefetchQuery`.
- فصل `new_patient` (زائر) عن `self` (حساب موجود) في `StepPatient.tsx`.
- E2E: `booking-slot-race.spec.ts`, `booking-hold-expiry.spec.ts`, `booking-idempotency.spec.ts`, `booking-back-button.spec.ts`, `booking-rtl.spec.ts`.

## 4. Migrations المطلوبة (سأعرضها قبل التنفيذ)

1. `confirm_appointment_booking(...)` — function + sequence لـ `BMC-YYYYMMDD-XXXX`.
2. `booking_drafts` — جدول للمسوّدات المسجَّلة (اختياري، أطلب موافقتك أولًا).

لن أعدّل جداول `appointments`/`appointment_slots`/`slot_holds` القائمة — فقط أضيف الدالة.

## 5. ما لن يُلمس

- API endpoints العامة `/api/public/book/*` — نفس العقود، فقط تعديل داخلي.
- RLS و RBAC الحالية.
- لوحة إدارة `/admin/appointments` (تعمل بالفعل).
- OTP / التأمين / Waitlist — يبقون كما هم.

## 6. شروط القبول (نفس شروطك)

- الحجز كامل داخل `/book` — لا Full Reload.
- زر رجوع المتصفح يتنقّل بين المراحل ويحفظ البيانات.
- منع الحجز المزدوج مضمون على مستوى Postgres transaction.
- Idempotency تُعاد نفس النتيجة عند تكرار الطلب.
- رقم الحجز بصيغة `BMC-YYYYMMDD-XXXX`.
- عربي/إنجليزي، RTL/LTR، جوال/سطح مكتب.
- `tsgo --noEmit` نظيف + build ناجح + Playwright الجديد أخضر.

---

**تنبيه**: هذه خطة كبيرة (≈ 4 دُفعات تنفيذ + migration واحدة على الأقل). أطلب إذنك:
1. المضي بالمرحلة 1+2 أولًا (URL sync + إعادة هيكلة) بدون migrations؟
2. أم البدء بالمرحلة 3 (Atomic function + BMC reference) لأنها الأعلى قيمة أمنيًا؟
3. أم تنفيذ كل الأربعة بالتتابع في جلسات متتالية؟
