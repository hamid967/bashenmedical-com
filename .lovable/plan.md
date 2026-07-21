# إعادة تصميم لوحة المريض + توحيد Design System

قائد الدفعة: **UX/UI + Frontend + QA** — بإشراف م. حامد.
النطاق: مسارات `/portal/*` (34 صفحة) + طبقة `src/components/ui` + توكنز `src/styles.css`.
مبدأ: لا تغيير في منطق الأعمال؛ تغييرات بصرية/تنظيمية فقط. الحد الأدنى لتغييرات الـ backend = صفر.

---

## المرحلة 1 — Design System v2 (يوم 1–2)

### 1.1 توحيد التوكنز في `src/styles.css`
- تدقيق `@theme` الحالي: توحيد ألوان الحالة (success/warning/danger/info) بصيغة `oklch`.
- إضافة **surfaces متدرجة**: `--surface-1..4`, `--surface-elevated`, `--surface-sunken`.
- Radii/Shadows/Motion: `--radius-{sm,md,lg,xl,2xl}`, `--shadow-{soft,elevated,glow}`, `--ease-out-quart`, `--dur-{fast,base,slow}`.
- Typography scale: مقياس عربي/إنجليزي متطابق مع `line-height` مدروس للـRTL.
- **Jazan motif tokens**: gradient/pattern محفوظ في CSS variables، بدون شعارات حكومية.

### 1.2 مكونات مشتركة جديدة تحت `src/components/portal/ui/`
- `PortalPageHeader` — عنوان + وصف + breadcrumb + إجراءات.
- `PortalCard` / `PortalStatCard` / `PortalEmptyState` / `PortalSkeleton`.
- `PortalSection` — عنوان قسم + محتوى بمسافات متسقة.
- `PortalDataList` — بديل موحّد للجداول على الموبايل.
- `PortalBadge` (حالات: مؤكد/معلق/ملغى/مكتمل) — ألوان دلالية فقط.
- كل المكونات تستخدم shadcn primitives + تلتزم `text-foreground`/`bg-background`.

### 1.3 توثيق `docs/design-system/portal-v2.md`
سُلّم الألوان، الخطوط، المسافات، دليل الاستخدام، أمثلة قبل/بعد.

---

## المرحلة 2 — إعادة تصميم شل اللوحة (يوم 3)

- `portal.tsx`: shell جديد بـ `SidebarProvider` (desktop) + `BottomNav` (mobile ≤ md).
- **معمار المعلومات** — تجميع 34 صفحة في 6 مجموعات:
  1. **الرئيسية**: dashboard, index
  2. **الحجوزات**: appointments, book, calendar, schedule, family
  3. **السجل الطبي**: records, prescriptions, laboratory, radiology, reports, reports.downloads, consents
  4. **المدفوعات**: invoices, payments, refunds, insurance, orders
  5. **التواصل**: doctors, notifications, complaints, inquiries, messaging
  6. **الحساب**: profile, settings, sessions, reminder-preferences
- شريط علوي: تحية باسم المريض + إشعارات + مبدّل لغة + قائمة حساب.
- RTL/LTR بلا كسر — اختبار كامل بالعربي والإنجليزي.

---

## المرحلة 3 — إعادة تصميم الصفحات ذات الأولوية (يوم 4–6)

بالترتيب:
1. `portal.dashboard.tsx` — بطاقات ذكية (الموعد القادم، آخر النتائج، الفواتير المستحقة).
2. `portal.appointments.tsx` — قوائم مدمجة (قادم/سابق/ملغى) + إجراءات سريعة.
3. `portal.records.tsx` + `prescriptions/laboratory/radiology/reports` — نمط بصري موحّد.
4. `portal.invoices.tsx` + `payments/refunds` — عرض مالي واضح مع حالات دلالية.
5. `portal.family.tsx` + `profile/settings` — نماذج نظيفة، قوائم بأزرار كبيرة.

الباقي (17 صفحة) يرث shell + tokens تلقائياً ويُهذّب تكراراً بمقاربة "أدنى تغيير".

---

## المرحلة 4 — إمكانية الوصول والأداء (يوم 7)

- تشغيل `tests/a11y/axe_baseline.py` على كل مسارات `/portal/*` (AR/EN).
- تصحيح أي مخالفة `color-contrast`/`label`/`button-name`.
- قياس Web Vitals عبر `src/lib/observability/web-vitals.ts` — هدف: LCP < 2.5s, CLS < 0.1, INP < 200ms.

---

## Definition of Done (DoD)

- [ ] كل توكنز الألوان/المسافات/الظلال في `src/styles.css` (لا hex/rgb inline).
- [ ] صفر استخدام لـ `text-white`/`bg-black`/`text-gray-*` في `src/routes/_authenticated/portal.*`.
- [ ] كل صفحة `/portal/*` تستخدم `PortalPageHeader` + `PortalCard` أو ما يعادلها.
- [ ] Sidebar (desktop) + BottomNav (mobile) يعملان في AR/EN بدون كسر.
- [ ] `bun run build` أخضر بلا تحذيرات TS/Lint جديدة.
- [ ] `tsgo` أخضر.
- [ ] axe: **صفر مخالفات** critical/serious على كل مسارات `/portal/*`.
- [ ] Lighthouse mobile: Perf ≥ 85, A11y ≥ 95, SEO ≥ 90 على `dashboard` و`appointments`.
- [ ] لا تعديل على أي schema/RLS/serverFn (backend مجمّد لهذه الدفعة).
- [ ] توثيق `docs/design-system/portal-v2.md` مكتمل مع أمثلة قبل/بعد.
- [ ] لقطات قبل/بعد لأهم 5 صفحات في `docs/audit/portal-redesign-2026-07/`.

---

## اختبارات القبول

### E2E (Playwright تحت `tests/e2e/portal-redesign/`)
1. `portal_shell_desktop.py` — sidebar يظهر، الروابط تنتقل، الحالة النشطة صحيحة (AR/EN).
2. `portal_shell_mobile.py` — BottomNav ظاهر @ 375px، 5 عناصر رئيسية تعمل.
3. `portal_dashboard_render.py` — بطاقات الملخص تظهر خلال < 3s، لا CLS مرئي.
4. `portal_appointments_flow.py` — عرض قائمة + فتح تفاصيل موعد بدون خطأ console.
5. `portal_rtl_ltr_parity.py` — تبديل اللغة يعيد بناء التخطيط بلا كسر بصري (screenshot diff).

### A11y (تحت `tests/a11y/`)
6. `portal_axe_full.py` — axe على 34 مسار × لغتين = صفر critical/serious.
7. `portal_keyboard_nav.py` — Tab يمر على كل التفاعليات بترتيب منطقي مع focus مرئي.

### Visual/Design
8. `portal_tokens_lint.py` — grep على `src/routes/_authenticated/portal.*` يمنع hex/tailwind ألوان مباشرة.
9. `portal_component_usage.py` — كل صفحة portal تستورد `PortalPageHeader`.

### Performance
10. `portal_lighthouse.mjs` — تشغيل Lighthouse CI على 3 صفحات، فشل إذا < عتبات DoD.

---

## تقسيم بالفرق (فريق حامد)

| الفريق | المسؤولية |
|---|---|
| UX/UI & Design | توكنز v2 + معمار المعلومات + مكتبة `PortalCard` |
| Frontend Engineering | shell جديد + هجرة الصفحات + BottomNav |
| Identity & Creative | Jazan motif tokens (خلفيات لطيفة، بلا شعارات) |
| QA & Testing | 10 اختبارات القبول أعلاه + سكربتات axe |
| Content | مراجعة كل عناوين/أوصاف الصفحات (AR/EN) |
| Security | تأكيد صفر مساس بـ RLS/serverFn |

---

## المخاطر والحدود

- **مجمّد**: أي schema/RLS/serverFn/booking logic — يتطلب تفويض منفصل من م. حامد.
- **خارج النطاق**: صفحات `/admin/*` (دفعة لاحقة).
- **العودة للخلف**: كل تغيير خلف feature flag `VITE_PORTAL_V2` إن طلب م. حامد ذلك.

---

## أول 3 خطوات بعد الموافقة

1. كتابة `src/styles.css` v2 tokens + `docs/design-system/portal-v2.md`.
2. إنشاء `src/components/portal/ui/*` (7 مكونات).
3. تحديث `portal.tsx` بالـ shell الجديد + هجرة `portal.dashboard.tsx` كأول عرض عملي.

هل أبدأ التنفيذ من الخطوة 1؟
