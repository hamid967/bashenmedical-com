# Portal Primitives — دليل الاستخدام

> طبقة العناصر المشتركة (`src/components/portal/ui/*`) وطبقة التوكنات الأساسية (`--ds-*`) — المرجع الوحيد لكل صفحة داخل `/portal/*`.

آخر تحديث: 2026-07 · الحالة: **مستقر** · طبقات: `--ds-*` (primitives) → `--portal-*` (semantic proxy) → مكوّنات.

---

## 1) قواعد ذهبية (اقرأها أولًا)

1. **لا ألوان Tailwind خام داخل `portal/*`**: ممنوع `bg-white` `text-black` `text-red-500` `bg-red-50` `bg-black/40` وأي `#hex` أو `rgba(...)`. استخدم توكنات فقط.
2. **مصدر الحقيقة = `var(--ds-*)`**. توكنات `--portal-*` موجودة كطبقة توافُق فقط وتُشير حاليًا إلى `--ds-*` بنفس القيم.
3. **لا `@apply` لتوكنات جديدة داخل ملفات module**. استخدم `style={{ background: "var(--ds-…)" }}` أو الأصناف الجاهزة (`portal-card`, `portal-badge`, …).
4. **كل صفحة تبدأ من `PortalPageHeader` + `PortalSection` + `PortalCard`**. لا تُنشئ صناديق يدوية بـ`border rounded-2xl bg-white`.
5. **الحركة والانتقالات** عبر `--ds-dur-base` + `--ds-ease-out` فقط (لا `transition-all` بأزمنة عشوائية).
6. **linter يحرس هذا كله**: `bun run lint:portal-tokens` — يمنع أي تراجع في CI.

---

## 2) خريطة التوكنات (`--ds-*`)

| المجموعة | التوكن | استخدامه |
|---|---|---|
| العلامة | `--ds-brand-50/500/700/800` | خلفيات ناعمة، الأزرار الأساسية، النصوص المؤكَّدة |
| المميّز | `--ds-accent-500` | تأكيدات دافئة، شارات لون ثانوي |
| الحالات | `--ds-success/warning/error/info-500` + `-50` | Toasts، شارات، رسائل تحقق |
| الحبر (نصوص) | `--ds-ink-900/600/400` | العنوان / الوصف / التلميح |
| الحدود | `--ds-border` `--ds-border-strong` | فواصل، مدخلات، بطاقات |
| الأنصاف | `--ds-radius-sm/md/lg/xl/2xl` | 10 / 14 / 20 / 28 / 36 px |
| الظلال | `--ds-shadow-sm/md/lg/glow` | البطاقات، الرفع، تركيز focus |
| الحركة | `--ds-dur-fast/base/slow` + `--ds-ease-out/in-out` | 120 / 220 / 360 ms |
| الأيقونات | `--ds-icon-sm/md/lg` | 16 / 20 / 24 px |

> **قاعدة**: أي لون/ظل/زمن مذكور بحرفية داخل مكوّن portal يعني أنه يجب أن يتحوّل إلى `var(--ds-*)`.

---

## 3) المكوّنات الجاهزة

كلها من `@/components/portal/ui`:

| المكوّن | متى تستخدمه |
|---|---|
| `PortalPageHeader` | ترويسة الصفحة (Breadcrumbs + eyebrow + عنوان + وصف + إجراءات) |
| `PortalSection` | قسم داخل الصفحة بعنوان ووصف |
| `PortalCard` (+ `Header/Body/Footer`) | البطاقة الأساسية، متغيرات: `default/elevated/sunken/outline` |
| `PortalStatCard` | KPI مع أيقونة، اتجاه، تلميح |
| `PortalBadge` | شارة حالة (`default/success/warning/error/muted`) |
| `PortalDataList` | قائمة تعريفات (dt/dd) لعرض بيانات مقروءة |
| `PortalEmptyState` | حالة فارغة موحّدة |
| `PortalSkeleton` / `PortalCardSkeleton` | حالات التحميل |
| **`PortalButton`** | كل الأزرار داخل portal (`primary/secondary/ghost/outline/danger` × `sm/md/lg`) |
| **`PortalInput`** | كل مدخلات النص (label + hint + error + leading/trailing icon) |

---

## 4) أمثلة سريعة

### 4.1 هيكل صفحة كامل

```tsx
import {
  PortalPageHeader, PortalSection, PortalCard, PortalCardBody,
  PortalButton, PortalBadge, PortalStatCard,
} from "@/components/portal/ui";
import { Calendar, Plus } from "lucide-react";

export function AppointmentsPage() {
  return (
    <>
      <PortalPageHeader
        eyebrow="حسابي"
        title="مواعيدي"
        description="عرض وإدارة جميع الحجوزات القادمة والسابقة."
        breadcrumbs={[{ label: "الرئيسية", href: "/portal" }, { label: "مواعيدي" }]}
        actions={
          <PortalButton variant="primary" leadingIcon={<Plus size={16} />}>
            حجز جديد
          </PortalButton>
        }
      />

      <PortalSection title="نظرة عامة" description="آخر ٣٠ يومًا">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PortalStatCard tone="primary" label="القادمة" value={3} icon={<Calendar />} />
          <PortalStatCard tone="success" label="المكتملة" value={12} />
          <PortalStatCard tone="warning" label="قيد الانتظار" value={1} />
        </div>
      </PortalSection>

      <PortalCard>
        <PortalCardBody>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold" style={{ color: "var(--ds-ink-900)" }}>
                د. سارة العتيبي — طب الأسرة
              </div>
              <div className="text-sm" style={{ color: "var(--ds-ink-600)" }}>
                الأربعاء 22 يوليو · 10:30 ص
              </div>
            </div>
            <PortalBadge variant="success">مؤكّد</PortalBadge>
          </div>
        </PortalCardBody>
      </PortalCard>
    </>
  );
}
```

### 4.2 نموذج مع `PortalInput` + `PortalButton`

```tsx
import { PortalInput, PortalButton, PortalCard, PortalCardBody } from "@/components/portal/ui";
import { Mail, Phone } from "lucide-react";

<PortalCard>
  <PortalCardBody>
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <PortalInput
        label="البريد الإلكتروني"
        type="email"
        required
        leadingIcon={<Mail size={16} />}
        hint="سنرسل تأكيد الموعد على هذا العنوان."
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <PortalInput
        label="رقم الجوال"
        type="tel"
        leadingIcon={<Phone size={16} />}
        error={phoneError}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <div className="flex gap-2 justify-end">
        <PortalButton variant="ghost" type="button" onClick={onCancel}>إلغاء</PortalButton>
        <PortalButton variant="primary" type="submit" loading={saving}>حفظ</PortalButton>
      </div>
    </form>
  </PortalCardBody>
</PortalCard>
```

### 4.3 شارات الحالة

```tsx
<PortalBadge variant="success">مؤكّد</PortalBadge>
<PortalBadge variant="warning">بانتظار الدفع</PortalBadge>
<PortalBadge variant="error">مُلغى</PortalBadge>
<PortalBadge variant="muted">مسوّدة</PortalBadge>
```

### 4.4 استخدام مباشر للتوكنات (بدون مكوّن جاهز)

للحالات النادرة التي لا يغطيها كيت الـprimitives:

```tsx
<div
  style={{
    background: "var(--ds-brand-50)",
    color: "var(--ds-brand-700)",
    border: "1px solid var(--ds-border)",
    borderRadius: "var(--ds-radius-lg)",
    boxShadow: "var(--ds-shadow-sm)",
    padding: "16px",
    transition: "box-shadow var(--ds-dur-base) var(--ds-ease-out)",
  }}
>
  محتوى مخصّص
</div>
```

أو أصناف utility الجاهزة داخل portal (تقرأ نفس التوكنات):

```tsx
<div className="portal-card portal-card-hover p-5">…</div>
<span className="portal-badge portal-badge-success">مؤكّد</span>
<button className="portal-focus-ring …">…</button>
```

---

## 5) الأنماط الممنوعة (Anti-patterns)

| ❌ ممنوع | ✅ البديل |
|---|---|
| `className="bg-white rounded-2xl border p-5"` | `<PortalCard><PortalCardBody>…</PortalCardBody></PortalCard>` |
| `className="text-red-500"` | `style={{ color: "var(--ds-error-500)" }}` أو `<PortalBadge variant="error">` |
| `className="bg-red-50 text-red-600"` | `<PortalBadge variant="error">` |
| `className="bg-black/40"` (خلفية modal) | `style={{ background: "color-mix(in oklab, var(--ds-ink-900) 40%, transparent)" }}` |
| `<button className="bg-teal-700 text-white …">` | `<PortalButton variant="primary">` |
| `<input className="border rounded px-3 h-10">` | `<PortalInput label="…" />` |
| `transition-all duration-300` | `transition-[…] duration-[var(--ds-dur-base)] ease-[var(--ds-ease-out)]` |
| `@import "https://fonts.googleapis.com/…"` داخل styles.css | `<link>` في `src/routes/__root.tsx` (Tailwind v4) |

---

## 6) التحقق التلقائي

- **Lint التوكنات**: `bun run lint:portal-tokens` — يفشل CI عند اكتشاف ألوان خام/تراجعات.
- **Visual regression**: `python3 tests/visual/portal_visual_regression.py` — يقارن اللقطات ويُخرج تقريرًا إلى `/mnt/documents/visual-regression/report.html` عند أي فرق.
- **حالات استثنائية مبرَّرة**: ضع تعليق `// tokens-allow` بجانب السطر مع سبب واضح (مثال: لون خارج palette portal يستخدمه اندماج طرف ثالث).

---

## 7) مراجع سريعة

- توكنات `--ds-*` مُعرَّفة في `src/styles.css` (بحث: `--ds-`).
- مصدر مكوّنات portal: `src/components/portal/ui/*`.
- تدقيق الحالة الحالية: [`audit-2026-07.md`](./audit-2026-07.md).
- خارطة ترحيل portal v2: [`portal-v2.md`](./portal-v2.md).
