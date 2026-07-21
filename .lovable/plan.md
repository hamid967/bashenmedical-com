# خطة فريق التصميم — تحسين وتطوير (Design Excellence Roadmap)

فريق حامد — قسم UX/UI. نطاق الخطة: توحيد اللغة البصرية عبر الموقع التسويقي + بوابة المريض + لوحة الإدارة، ورفع مستوى التفاعل والوصولية دون كسر أي وظائف موجودة.

---

## Wave 1 — تدقيق وتوحيد الأساس (Foundation Audit)
**الهدف:** خريطة واضحة للفجوات البصرية قبل أي إعادة تصميم.

- تدقيق Design Tokens v2 (portal) و v3 (admin) والتسويق:
  - رصد الفروقات في ألوان/ظلال/زوايا/تباعد بين الأنظمة الثلاثة.
  - تحديد الـtokens المكرّرة أو المتضاربة.
- تدقيق Typography:
  - توحيد سلم الخطوط (heading/body/mono) لعربي/إنجليزي.
  - قياس التباين (WCAG AA/AAA) لكل token نص × سطح.
- تدقيق Iconography:
  - جرد أيقونات lucide المستخدمة + رصد الاستخدام غير المتسق.
- المخرجات:
  - `docs/design-system/audit-2026-07.md`
  - جدول tokens موحّد مقترح (unified layer فوق الأنظمة الحالية).

## Wave 2 — Design System v4 موحّد (Unified DS)
**الهدف:** طبقة tokens واحدة تخدم الثلاثة أنظمة مع الحفاظ على المسميات الحالية.

- إنشاء `--ds-*` كطبقة primitives (color, space, radius, shadow, motion).
- إعادة توجيه `--portal-*` و `--admin-*` و tokens التسويق لتقرأ من `--ds-*`.
- توثيق داخل `/admin/design-tokens` (موجود) + إضافة صفحة `/admin/design-system` تعرض:
  - Components gallery (Buttons/Inputs/Cards/Badges/Tables).
  - Motion presets + easing curves.
  - Do/Don't لكل primitive.
- قاعدة lint إضافية: منع hex/rgb خارج `src/styles.css`.

## Wave 3 — رفع تجربة بوابة المريض (Portal Polish)
**الهدف:** إغلاق ديون Design Tokens v2 وترقية الصفحات الأعلى استخداماً.

- إكمال ترحيل الصفحات ذات الأرقام الأعلى في `scripts/portal-tokens-baseline.json`:
  - `portal.prescriptions.tsx` (87), `portal.appointments.tsx` (61), `portal.calendar.tsx` (45), `portal.family.tsx` (35), `portal.laboratory.tsx` (34).
- تحويل حالات Empty/Loading/Error إلى `PortalEmptyState` + `PortalSkeleton` بشكل متسق.
- Micro-interactions: hover/active/focus عبر tokens الحركة (`--portal-dur-*`).
- تفعيل الاختبار البصري: قلب `portal_component_usage.py` إلى `sys.exit(1)` بعد اكتمال الترحيل.

## Wave 4 — لوحة الإدارة (Admin Command Center Polish)
**الهدف:** رفع الاتساق البصري بعد Waves 1-2 من Hamed AI Command Center.

- تطبيق `DataTableV2` على جداول admin المتبقية (Reservations, Users, Audit Logs).
- توحيد header/breadcrumb/actions عبر primitive جديد `AdminPageHeader` مماثل لـ `PortalPageHeader`.
- ضبط density mode (compact/comfortable) قابل للتبديل من إعدادات المستخدم.
- KPI cards: ثبات المقاسات + skeleton parity + دعم trend سالب/موجب بألوان دلالية.

## Wave 5 — الحركة وإمكانية الوصول (Motion & A11y)
**الهدف:** حركة هادفة + مطابقة WCAG AA على جميع الصفحات.

- Motion:
  - تعريف presets: `fade`, `slide-up`, `scale-in`, `stagger` عبر Motion for React.
  - احترام `prefers-reduced-motion` (موجود جزئياً — توحيده).
- Accessibility:
  - إعادة تشغيل `axe_baseline` بعد كل موجة وتوثيق الفرق.
  - إصلاح contrast/focus-ring/labels في المكونات المتبقية.
  - دعم skip-links على جميع الـshells (portal/admin/marketing).

---

## تفاصيل تقنية (Technical Notes)
- الملفات الأساسية: `src/styles.css`, `src/components/portal/ui/*`, `src/components/admin/v2/*`, `docs/design-system/*`.
- CI:
  - `scripts/lint-portal-tokens.mjs` blocking (قائم).
  - إضافة `scripts/lint-admin-tokens.mjs` مماثل بعد Wave 2.
  - `tests/visual/portal_visual_regression.py` — تحديث snapshots في نهاية كل موجة.
- بدون تغييرات في backend أو RLS أو business logic — الخطة UI/DS فقط.

## Definition of Done لكل موجة
1. لا زيادة في أعداد `portal-tokens-baseline.json`.
2. `bunx tsgo --noEmit` + `bun test` نظيفان.
3. `axe_baseline` بدون تراجع.
4. Visual regression tests خضراء أو snapshots محدّثة عمداً.
5. توثيق التغيير في `docs/design-system/`.

## الترتيب الزمني المقترح
| الموجة | المدة | التبعية |
|---|---|---|
| W1 Audit | يومان | — |
| W2 DS v4 | 3-4 أيام | W1 |
| W3 Portal | 3 أيام | W2 |
| W4 Admin | 3 أيام | W2 (يمكن بالتوازي مع W3) |
| W5 Motion + A11y | يومان | W3, W4 |

**المخرج النهائي:** نظام تصميم موحّد قابل للتوسّع + بوابتان (مريض/إدارة) بمستوى بصري متسق + توثيق حي في `/admin/design-system`.
