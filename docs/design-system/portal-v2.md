# Portal Design System v2

**Scope:** `/portal/*` routes only. Marketing site untouched.
**Owner:** فريق حامد — UX/UI & Design.
**Status:** In progress (Batch 1 shipped).

---

## Principles

1. **Tokens over hex.** Components read `var(--portal-*)` — never inline hex/rgb.
2. **Semantic status.** `success | warning | error | info` are the only status colors.
3. **RTL/LTR parity.** Every component works in both directions with `dir="rtl|ltr"` inherited from `.portal-root`.
4. **A11y first.** WCAG AA contrast, keyboard focus visible (`portal-focus-ring`), `aria-current` on active nav.
5. **Mobile-first.** All primitives usable at 320px width; tables become `PortalDataList` on mobile.

---

## Tokens (`src/styles.css` — inside `.portal-root`)

### Colors
| Token | Purpose |
|---|---|
| `--portal-primary` `#075E63` | Primary brand |
| `--portal-primary-50` | Tinted background for primary badges/icons |
| `--portal-secondary` `#0B8585` | Secondary accent |
| `--portal-accent` `#C7A46B` | Gold accent (Jazan motif) |
| `--portal-ink`, `--portal-ink-2`, `--portal-ink-3` | Foreground scale |
| `--portal-border`, `--portal-border-strong` | Borders |

### Surfaces (elevation)
`--portal-surface-1` (card), `-2` (subtle), `-3` (sunken), `-sunken`, `-elevated`.

### Status
`--portal-success` / `-50`, `--portal-warning` / `-50`, `--portal-error` / `-50`, `--portal-info` / `-50`.

### Radii
`--portal-radius-{sm,md,lg,xl,2xl}` = `10 / 14 / 20 / 28 / 36 px`.

### Shadows
`--portal-shadow-sm`, `--portal-shadow`, `--portal-shadow-elevated`, `--portal-shadow-glow`.

### Motion
`--portal-ease-out`, `--portal-dur-{fast,base,slow}` = `120 / 220 / 360 ms`.

### Spacing
`--portal-space-{1,2,3,4,6,8}` = `4 / 8 / 12 / 16 / 24 / 32 px`.

### Gradients
`--portal-gradient`, `--portal-gradient-soft`, `--portal-gradient-warm`.

---

## Utilities

| Utility | Purpose |
|---|---|
| `portal-card` | Default card surface |
| `portal-card-hover` | Interactive lift on hover |
| `portal-card-elevated` | Glass card with strong shadow |
| `portal-card-sunken` | Recessed panel |
| `portal-gradient-bg` | Ambient page background |
| `portal-focus-ring` | Keyboard focus ring (`:focus-visible`) |
| `portal-badge` + `-success` / `-warning` / `-error` / `-muted` | Status chips |

---

## Components (`src/components/portal/ui`)

| Component | Use |
|---|---|
| `PortalPageHeader` | One per route. Title + description + breadcrumb + actions. |
| `PortalCard` (+ `Header` / `Body` / `Footer`) | Surface primitive. Variants: `default`, `elevated`, `sunken`, `outline`. |
| `PortalStatCard` | KPI/metric tile with tone (`primary/success/warning/error/muted`) + optional trend. |
| `PortalEmptyState` | Empty state with icon, title, description, CTA. |
| `PortalSkeleton` / `PortalCardSkeleton` | Loading placeholders (uses `portal-shimmer`). |
| `PortalSection` | Grouped section with title + optional action. |
| `PortalBadge` | Inline status chip. |
| `PortalDataList` | Two-column dl for mobile-friendly detail views. |

---

## Information Architecture (sidebar groups)

6 groups matching the plan:
1. **الرئيسية / Home** — `dashboard`, `overview`
2. **الحجوزات / Appointments** — `appointments`, `book`, `calendar`, `schedule`, `family`
3. **السجل الطبي / Medical Records** — `records`, `prescriptions`, `laboratory`, `radiology`, `consents`
4. **المدفوعات / Billing** — `invoices`, `payments`, `refunds`, `insurance`, `orders`
5. **التواصل / Messages** — `doctors`, `notifications`, `inquiries`, `complaints`
6. **الحساب / Account** — `profile`, `sessions`, `reminder-preferences`, `settings`

Bottom nav (mobile) keeps 5 primary destinations: Home / Visits / Book / Records / Me.

---

## Usage example — a route page

```tsx
import { PortalPageHeader, PortalCard, PortalStatCard, PortalSection } from "@/components/portal/ui";

function MyRoute() {
  return (
    <>
      <PortalPageHeader
        title="مواعيدي"
        description="جميع المواعيد القادمة والسابقة."
        breadcrumbs={[{ label: "الرئيسية", to: "/portal" }, { label: "مواعيدي" }]}
        actions={<button className="portal-focus-ring ...">حجز جديد</button>}
      />

      <PortalSection title="ملخص">
        <div className="grid gap-4 sm:grid-cols-3">
          <PortalStatCard label="القادمة" value={3} tone="primary" />
          <PortalStatCard label="مكتملة" value={12} tone="success" />
          <PortalStatCard label="ملغاة" value={1} tone="muted" />
        </div>
      </PortalSection>

      <PortalCard className="p-5">... content ...</PortalCard>
    </>
  );
}
```

---

## Do / Don't

**Do**
- `text-[color:var(--portal-ink)]`, `bg-[color:var(--portal-surface-1)]`
- Use `PortalPageHeader` on every `/portal/*` route
- Wrap tabular data in `PortalDataList` for mobile

**Don't**
- `text-white`, `bg-black`, `text-gray-*`, arbitrary hex
- Copy the same `<div className="mb-4 flex items-center...">` header block per page
- Add a new nav item without placing it in a NAV_GROUP
