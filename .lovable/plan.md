## السياق والتحذير

اخترتَ «بناء نظام حجوزات جديد من الصفر (استبدال الحالي)». قبل التنفيذ يجب أن تعرف ما سيُهدم:

**سيتم حذفه/استبداله:**
- `src/routes/book.tsx` ومكوّناته (`src/components/booking/*` — 12 مكوّنًا)
- `src/routes/api/public/book/*` (availability, create, cancel, waitlist, month-availability, track)
- `src/lib/booking-limits.ts`, `src/lib/portal/booking.functions.ts`
- الروابط الداخلية من `/doctors`, `/branches/*`, `/specialties/*`, `Header`, `QuickBar`, `HeroComplex` … إلخ

**سيتوقف عن العمل (كسر مباشر):**
- ~40 اختبار e2e/RLS/unit مرتبط بـ book (tests/e2e/book-*, tests/rls/appt-*, tests/rls/book-*, tests/react/booking.test.tsx …)
- تدفق الإدارة `/appointments-queue`, `/admin`, `/orders/$ref`, `/track`, `/lookup`, `/waitlist`, `/booking-confirmation`
- تكامل MCP (`src/lib/mcp/tools/create-appointment.ts`)
- بوابة المريض `/my-orders` وأدوات التذكير `/api/public/hooks/send-reminders`
- الـ CI (pre-push RLS checks, perf budget, lint guardrails على `book`)

**ما لن يُلمَس (بقرارٍ متعمَّد):**
- جداول قاعدة البيانات: `appointments`, `availability`, `doctor_leaves`, `appointment_audit`, `appointment_waitlist`, `patients`, `doctors`, `branches`, `specialties` — تبقى كما هي مع الـ RLS الحالي. النظام الجديد يستخدم نفس المخطط.
- المصادقة والـ profiles و user_roles.

---

## الخطة

### 1) صفحة تصفح جديدة `/reservations` (شبيهة udh.sa)
- تبويبان: **«اختر العيادة»** و **«ابحث بالطبيب»**
- شريط بحث + شبكة بطاقات (طبيب: صورة/أحرف، اسم، لقب، تخصص، فرع، زر «احجز الآن»)
- بطاقات التخصصات تفتح شبكة الأطباء لهذا التخصص
- قسم «أطباء انضموا حديثًا» + شريط «رعايتك أولويتنا» (زيارة منزلية)
- زر «احجز الآن» يوجّه إلى `/booking/new?doctor=...` (المعالج الجديد)

### 2) معالج حجز جديد `/booking/new` (بديل `/book`)
تدفّق مبسّط من 5 خطوات بدل 9 (على غرار udh):
```
1. طبيب/تخصص (مُعبَّأ مسبقًا من الرابط)
2. اختيار الفرع (إن كان الطبيب يخدم أكثر من فرع)
3. تاريخ + وقت في شاشة واحدة (تقويم + شبكة أوقات)
4. بيانات المريض
5. تأكيد
```
- استخدام React Query + `useReducer` + مزامنة URL كما في `book.tsx` الحالي.
- إعادة استخدام مكوّنات UI جديدة تحت `src/components/reservations/*`.

### 3) واجهات API جديدة تحت `/api/public/reservations/*`
- `GET availability?doctor_id&date` — نفس منطق `book/availability` (نسخ مبسّط).
- `GET month-availability?doctor_id&month` — لتلوين التقويم.
- `POST create` — إنشاء `appointments` مع كل التحققات (Zod, حدود مشتركة، مضاد سباق).
- `POST cancel?ref` — إلغاء بمرجع + رقم جوال.
- منطق نظيف يستخدم جداول القاعدة الحالية.

### 4) صفحة إدارة حجوزاتي `/reservations/my`
- إدخال رقم الجوال + رمز التتبع → قائمة الحجوزات → إلغاء/إعادة جدولة.

### 5) الهدم والتنظيف
- حذف كل الملفات المذكورة في «سيتم حذفه».
- إزالة الروابط من Header/QuickBar/الصفحات وتحديثها لتشير إلى `/reservations` و `/booking/new`.
- حذف الاختبارات المرتبطة بـ book القديمة.
- تحديث `mcp/create-appointment` ليستخدم نفس المسار الجديد أو حذفه إن لم يُطلب.

### تفاصيل تقنية

- **الجداول:** لا migrations. نستخدم `appointments`, `doctors`, `specialties`, `branches`, `availability`, `doctor_leaves` كما هي.
- **المنطقة الزمنية:** `src/lib/riyadh-date.ts` يبقى ويُعاد استخدامه.
- **الحدود:** `booking-limits.ts` يُنقل إلى `reservation-limits.ts` بنفس القيم.
- **مسار الملف (TanStack):** `src/routes/reservations.tsx` (index)، `src/routes/reservations.my.tsx`، `src/routes/booking.new.tsx`، `src/routes/api/public/reservations/*.ts`.

---

## قرار مطلوب منك

هذا استبدال ضخم (≈ 40 ملف مصدر + 40 ملف اختبار)، وسيكسر CI حتى انتهاء التنفيذ. أنصح بشدة بأحد البدائل قبل الشروع:

**البديل أ (موصى به):** إضافة صفحة تصفح `/reservations` جديدة فقط تعيد استخدام `/book` الموجود عبر الروابط العميقة (`/book?doctor=…`). ينجز نفس تجربة udh.sa بدون كسر أي شيء — يوم عمل واحد.

**البديل ب:** بناء `/reservations` + `/booking/new` جنبًا إلى جنب مع `/book` القديم، وتحويل الروابط تدريجيًا، ثم حذف القديم لاحقًا بعد استقرار الجديد.

**البديل ج (ما اخترتَه):** الاستبدال الكامل كما هو مخطَّط أعلاه — 3–4 أيام عمل، كسر مؤقت لعشرات الاختبارات والصفحات الإدارية، إعادة كتابة كاملة.

أيّها تريد؟