# ui-v3 — Unified UI Layer (Phase 11)

Single import surface for buttons, forms, cards, tables, and dialogs across the
public site, patient portal, and admin console. Wrappers are thin — they compose
the shadcn primitives in `@/components/ui/*` rather than duplicating them.

```tsx
import {
  Button, Field, FieldGrid, SectionCard,
  DataTable, ConfirmDialog, FormDialog,
  Input, Select, SelectItem, SelectTrigger, SelectValue, SelectContent,
} from "@/components/ui-v3";
```

## Added value per wrapper

| Wrapper        | Adds                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `Button`       | `loading` spinner + `aria-busy`, `leftIcon`/`rightIcon` slots.       |
| `Field`        | Label + required marker + help + error, ARIA wiring, inline layout.  |
| `FieldGrid`    | Responsive 1/2/3 column form grid.                                   |
| `SectionCard`  | Card with title/description/actions/footer and `flush` for tables.   |
| `ConfirmDialog`| Async `onConfirm` with loading + toast on error, destructive style.  |
| `FormDialog`   | Form scaffold with submit/cancel, loading, toast, invalid-disable.   |
| `DataTable`    | Canonical re-export of `DataTableV2` — never fork a second table.    |

## Rules

1. **No duplicate primitives.** If shadcn already ships it, re-export unchanged.
2. **New pages import from `@/components/ui-v3`** exclusively.
3. **Legacy pages** keep working — `@/components/ui/*` imports remain valid.
4. **Tokens only** — never hard-code colors; rely on the tokens in
   `src/styles.css`.
