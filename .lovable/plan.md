# خطة توحيد Design Tokens v2 على portal/*

## الوضع الحالي

- **primitives جاهزة** في `src/components/portal/ui/`: `PortalPageHeader`, `PortalCard*`, `PortalStatCard`, `PortalSection`, `PortalBadge`, `PortalDataList`, `PortalEmptyState`, `PortalSkeleton`.
- **5 صفحات مُهاجرة**: `dashboard`, `appointments`, `invoices`, `records`, `family`.
- **23 صفحة متبقية** (~13 ألف سطر) تستخدم أنماطًا قديمة (Card من shadcn مباشرة، ألوان hex، spacing متضارب).

## الهدف

نقل كل الصفحات المتبقية لتستخدم primitives الموحّدة، بحيث:
1. أي تغيير في tokens مستقبلًا ينعكس تلقائيًا على كل الصفحات.
2. اختفاء أي `text-white/bg-black/#hex` من طبقة العرض في `portal/*`.
3. اتساق spacing/typography/spacing scale + focus/motion.

## نطاق الدفعات

نُقسّم العمل إلى 5 دفعات حسب التقارب الوظيفي؛ كل دفعة = PR منفصل + typecheck + لقطة قبل/بعد.

### الدفعة 1 — Landing & Nav (سريعة)
`portal.index.tsx`, `portal.tsx`, `portal.doctors.tsx`, `portal.settings.tsx`, `portal.profile.tsx`

### الدفعة 2 — Communications
`portal.notifications.tsx`, `portal.complaints.tsx`, `portal.inquiries.tsx`, `portal.reminder-preferences.tsx`, `portal.sessions.tsx`

### الدفعة 3 — Records & Reports
`portal.laboratory.tsx`, `portal.radiology.tsx`, `portal.reports.tsx`, `portal.reports.downloads.tsx`, `portal.prescriptions.tsx`, `portal.consents.tsx`

### الدفعة 4 — Booking & Scheduling
`portal.book.tsx`, `portal.calendar.tsx`, `portal.schedule.tsx`

### الدفعة 5 — Billing & Insurance
`portal.orders.tsx`, `portal.orders.$kind.$id.tsx`, `portal.payments.tsx`, `portal.refunds.tsx`, `portal.insurance.tsx`

## قواعد التحويل (لكل ملف)

1. استبدال هيكل الصفحة العلوي بـ `PortalPageHeader` (title, subtitle, breadcrumbs, actions).
2. استبدال كل `<Card>` من shadcn بـ `PortalCard` / `PortalCardHeader` / `PortalCardBody` / `PortalCardFooter`.
3. استبدال KPI blocks اليدوية بـ `PortalStatCard`.
4. استبدال قوائم key–value بـ `PortalDataList`.
5. استبدال "لا توجد بيانات" بـ `PortalEmptyState`.
6. استبدال loaders يدوية بـ `PortalCardSkeleton`.
7. أي `Badge` حالة (نجاح/تحذير/خطر/معلومة) → `PortalBadge` بـ `tone`.
8. إزالة كل `bg-white/text-black/#hex` من JSX واستخدام tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`).
9. تجميع الأقسام داخل `PortalSection` لتوحيد `spacing-y`.
10. الإبقاء على كل business logic كما هي — لا تغيير في hooks/loaders/mutations.

## اختبار وضمان الجودة

- Typecheck نظيف بعد كل دفعة.
- E2E موجود: تشغيل السيناريوهات الحرجة (`book`, `cancel`, `reschedule`, `waitlist`) بعد كل دفعة تلامسها.
- لقطات Playwright قبل/بعد (`/tmp/browser/portal-v2/<page>-{before,after}.png`) للصفحات المُهاجرة في كل دفعة.
- تحقق axe سريع على 3 صفحات من كل دفعة.

## التفاصيل التقنية

- لا تعديل على `src/components/portal/ui/*` — فقط استهلاك.
- لا migrations، لا server functions جديدة.
- إذا احتاجت صفحة نمطًا غير موجود في primitives (نادر)، أُضيف variant جديد داخل primitive نفسه بدل يدويّ في الصفحة.
- ملفات > 700 سطر (appointments سابقًا، prescriptions, refunds, family) تُحوّل بـ `line_replace` مركّز على أجزاء JSX فقط، دون كسر الملف.

## المخرجات

- 23 ملف مُحدّث.
- 0 hex/hardcoded colors في `src/routes/_authenticated/portal.*.tsx`.
- تقرير موجز في نهاية كل دفعة: عدد الأسطر المتغيرة، لقطات قبل/بعد، حالة typecheck/tests.

## البدء

سأبدأ فورًا بالدفعة 1 (Landing & Nav) بعد الموافقة. الوقت المتوقع لكل دفعة: 2–3 دورات.
