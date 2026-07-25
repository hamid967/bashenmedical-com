# ui-v3 — Unified UI Layer (Phase 11)

Single import surface for buttons, forms, cards, tables, and dialogs across the
public site, patient portal, and admin console. Wrappers are thin — they compose
the shadcn primitives in `@/components/ui/*` rather than duplicating them.

```tsx
import {
  Button,
  Field,
  FieldGrid,
  SectionCard,
  DataTable,
  ConfirmDialog,
  FormDialog,
  Input,
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from "@/components/ui-v3";
```

## Added value per wrapper

| Wrapper         | Adds                                                                |
| --------------- | ------------------------------------------------------------------- |
| `Button`        | `loading` spinner + `aria-busy`, `leftIcon`/`rightIcon` slots.      |
| `Field`         | Label + required marker + help + error, ARIA wiring, inline layout. |
| `FieldGrid`     | Responsive 1/2/3 column form grid.                                  |
| `SectionCard`   | Card with title/description/actions/footer and `flush` for tables.  |
| `ConfirmDialog` | Async `onConfirm` with loading + toast on error, destructive style. |
| `FormDialog`    | Form scaffold with submit/cancel, loading, toast, invalid-disable.  |
| `DataTable`     | Canonical re-export of `DataTableV2` — never fork a second table.   |

## Rules

1. **No duplicate primitives.** If shadcn already ships it, re-export unchanged.
2. **New pages import from `@/components/ui-v3`** exclusively.
3. **Legacy pages** keep working — `@/components/ui/*` imports remain valid.
4. **Tokens only** — never hard-code colors; rely on the tokens in
   `src/styles.css`.

---

## RTL & Dark mode

All ui-v3 components inherit direction and theme from ancestors — you never pass
`dir` or a theme prop to a component. Two switches control everything:

- **RTL** — set `<html dir="rtl" lang="ar">` (the app already does this for Arabic).
  Logical CSS (`ms-*`, `me-*`, `ps-*`, `pe-*`) mirrors automatically; the
  `Icon` component mirrors direction-sensitive glyphs (e.g. `ArrowForward`) when
  `dir="rtl"` is active.
- **Dark** — toggle the `dark` class on `<html>`. Every color is a token from
  `src/styles.css`, so contrast passes AA in both themes (verified by
  `pnpm design:contrast`).

To preview a single screen in either state during development:

```tsx
// Force RTL for one subtree (e.g. an Arabic-only preview inside an LTR shell)
<div dir="rtl" lang="ar"><MyExample /></div>

// Force dark for one subtree
<div className="dark bg-background text-foreground p-6"><MyExample /></div>
```

---

## Example pages

Copy-paste these into any route (`src/routes/**`) to see the full contract —
loading, disabled, error, RTL, and dark — with zero extra wiring.

### 1) Buttons — variants, loading, icons, RTL mirroring

```tsx
import { Button, Icon } from "@/components/ui-v3";
import { useState } from "react";

export function ButtonsExample() {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-wrap gap-3">
      <Button>حفظ</Button>
      <Button variant="secondary">إلغاء</Button>
      <Button variant="destructive">حذف</Button>
      <Button variant="outline" leftIcon={<Icon name="Stethoscope" />}>
        استشارة
      </Button>
      <Button rightIcon={<Icon name="ArrowForward" />}>متابعة</Button>
      <Button disabled>غير متاح</Button>
      <Button
        loading={saving}
        onClick={async () => {
          setSaving(true);
          await new Promise((r) => setTimeout(r, 1200));
          setSaving(false);
        }}
      >
        حفظ التغييرات
      </Button>
    </div>
  );
}
```

- **RTL:** `ArrowForward` flips automatically; icon slots swap sides via
  logical spacing.
- **Dark:** variants use `bg-primary`, `bg-destructive`, `border-border` tokens
  — no override needed.

### 2) Field & FieldGrid — validation, disabled, loading

```tsx
import { Field, FieldGrid, Input, Button, SectionCard } from "@/components/ui-v3";
import { useState } from "react";

export function FormExample() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const emailError = email && !email.includes("@") ? "بريد غير صالح" : undefined;

  return (
    <SectionCard title="بيانات المريض" description="جميع الحقول مطلوبة">
      <FieldGrid columns={2}>
        <Field label="الاسم الكامل" required help="كما في الهوية">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="البريد الإلكتروني" required error={emailError}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="رقم الملف" disabled>
          <Input value="MRN-2026-0421" readOnly />
        </Field>
        <Field label="الفرع" loading>
          <Input placeholder="جارٍ التحميل…" />
        </Field>
      </FieldGrid>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary">إلغاء</Button>
        <Button disabled={!name || !!emailError || !email}>حفظ</Button>
      </div>
    </SectionCard>
  );
}
```

### 3) SectionCard — flush mode for tables

```tsx
import { SectionCard, DataTable, Button } from "@/components/ui-v3";

export function CardExample() {
  return (
    <SectionCard
      title="المواعيد اليوم"
      description="آخر تحديث: قبل دقيقة"
      actions={<Button size="sm">تصدير CSV</Button>}
      flush
    >
      <DataTable
        columns={[
          { key: "time", header: "الوقت" },
          { key: "patient", header: "المريض" },
          { key: "doctor", header: "الطبيب" },
        ]}
        rows={[
          { time: "٠٩:٠٠", patient: "أحمد", doctor: "د. سارة" },
          { time: "٠٩:٣٠", patient: "منى", doctor: "د. خالد" },
        ]}
      />
    </SectionCard>
  );
}
```

### 4) ConfirmDialog — async, destructive, error banner

```tsx
import { Button, ConfirmDialog } from "@/components/ui-v3";
import { useState } from "react";

export function ConfirmExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        إلغاء الحجز
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="تأكيد إلغاء الحجز"
        description="لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="نعم، ألغِ"
        cancelLabel="تراجع"
        destructive
        errorMode="inline"
        onConfirm={async () => {
          await new Promise((_, rej) =>
            setTimeout(() => rej(new Error("تعذّر الاتصال بالخادم")), 1200),
          );
        }}
      />
    </>
  );
}
```

### 5) FormDialog — create/edit with invalid-disable

```tsx
import { FormDialog, Field, FieldGrid, Input, Button } from "@/components/ui-v3";
import { useState } from "react";

export function FormDialogExample() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  return (
    <>
      <Button onClick={() => setOpen(true)}>إضافة ملاحظة</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="ملاحظة جديدة"
        submitLabel="حفظ"
        invalid={!title.trim()}
        onSubmit={async () => {
          await new Promise((r) => setTimeout(r, 800));
          setTitle("");
        }}
      >
        <FieldGrid columns={1}>
          <Field label="العنوان" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </FieldGrid>
      </FormDialog>
    </>
  );
}
```

### 6) DataTable — loading, empty, error

```tsx
import { DataTable, SectionCard } from "@/components/ui-v3";

const cols = [
  { key: "time", header: "الوقت" },
  { key: "patient", header: "المريض" },
];

export function TableStatesExample() {
  return (
    <div className="grid gap-4">
      <SectionCard title="تحميل" flush>
        <DataTable columns={cols} rows={[]} loading />
      </SectionCard>
      <SectionCard title="فارغ" flush>
        <DataTable columns={cols} rows={[]} emptyMessage="لا توجد نتائج" />
      </SectionCard>
      <SectionCard title="خطأ" flush>
        <DataTable columns={cols} rows={[]} error={new Error("فشل الاتصال")} />
      </SectionCard>
    </div>
  );
}
```

### 7) Icons — sizing, color, RTL mirroring

```tsx
import { Icon } from "@/components/ui-v3";

export function IconsExample() {
  return (
    <div className="flex items-center gap-4 text-primary">
      <Icon name="Stethoscope" size={24} />
      <Icon name="PatientHeart" size={28} strokeWidth={1.75} />
      <Icon name="JazanMark" size={32} />
      {/* Mirrors under dir="rtl" */}
      <Icon name="ArrowForward" size={20} title="متابعة" />
    </div>
  );
}
```

---

## Side-by-side preview (RTL + Dark)

Drop this into a scratch route to eyeball every state at once:

```tsx
import { ButtonsExample } from "./ButtonsExample";

export default function Preview() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-background">
      <section dir="ltr" lang="en" className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">LTR · Light</h3>
        <ButtonsExample />
      </section>
      <section dir="rtl" lang="ar" className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">RTL · Light</h3>
        <ButtonsExample />
      </section>
      <section
        dir="ltr"
        lang="en"
        className="dark rounded-lg border p-4 bg-background text-foreground"
      >
        <h3 className="mb-3 font-semibold">LTR · Dark</h3>
        <ButtonsExample />
      </section>
      <section
        dir="rtl"
        lang="ar"
        className="dark rounded-lg border p-4 bg-background text-foreground"
      >
        <h3 className="mb-3 font-semibold">RTL · Dark</h3>
        <ButtonsExample />
      </section>
    </div>
  );
}
```

---

## Checklist before shipping a new page

- [ ] All imports come from `@/components/ui-v3`.
- [ ] Every async button/dialog uses `loading` — no custom spinners.
- [ ] Errors surface via `Field.error`, `errorMode` on dialogs, or `DataTable.error`.
- [ ] Direction-sensitive glyphs use `<Icon>` (auto-mirrors), not raw SVG.
- [ ] No hard-coded colors — tokens only.
- [ ] Verified in both `dir="rtl"` and `.dark` — run `pnpm design:visual` to
      snapshot both.
