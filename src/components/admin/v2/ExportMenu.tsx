/**
 * ExportMenu — Reusable export dropdown (CSV / XLSX / PDF).
 *
 * - Role-gated via `allowed` prop (typically derived from getMyRoles).
 * - Loading state during export with spinner + disabled trigger.
 * - Optional async `fetchAll` for exporting the full filtered dataset
 *   (beyond the currently loaded page).
 * - Toast feedback on success/error using sonner.
 *
 * Meant to be dropped into any admin toolbar or chart card.
 */
import { useState, type ReactNode } from "react";
import { Download, FileText, FileSpreadsheet, FileType2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { exportCsv, exportXlsx, exportPdf, type Column } from "@/lib/export-utils";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export type ExportMenuProps<T> = {
  /** File base name (no extension). Timestamp appended automatically. */
  filename: string;
  /** Column definitions (header + accessor). */
  columns: Column<T>[];
  /** Rows currently loaded. Used when `fetchAll` is not provided. */
  rows: T[];
  /** PDF report title. */
  title: string;
  /** Optional PDF subtitle (e.g. current filters). */
  subtitle?: string;
  /** Optional metadata block for PDF header (label → value). */
  meta?: Record<string, string>;
  /** Optional async loader that returns the full filtered dataset. */
  fetchAll?: () => Promise<T[]>;
  /** Formats to enable. Default: all three. */
  formats?: ExportFormat[];
  /** Role gate — hides menu when false (renders a disabled lock indicator instead). */
  allowed?: boolean;
  /** Disable the trigger (e.g. still loading data). */
  disabled?: boolean;
  /** Trigger label. */
  label?: ReactNode;
  /** Compact trigger (icon only). */
  compact?: boolean;
};

function stampName(base: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const FORMAT_META: Record<ExportFormat, { label: string; hint: string; icon: typeof FileText }> = {
  csv: { label: "CSV", hint: "ملف نصي مفصول بفواصل", icon: FileText },
  xlsx: { label: "Excel (XLSX)", hint: "جدول Excel كامل", icon: FileSpreadsheet },
  pdf: { label: "PDF", hint: "تقرير للطباعة", icon: FileType2 },
};

export function ExportMenu<T>({
  filename,
  columns,
  rows,
  title,
  subtitle,
  meta,
  fetchAll,
  formats = ["csv", "xlsx", "pdf"],
  allowed = true,
  disabled = false,
  label = "تصدير",
  compact = false,
}: ExportMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  if (!allowed) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="لا تملك صلاحية التصدير"
        className="gap-1.5"
      >
        <Lock className="h-4 w-4" />
        {!compact && <span>تصدير</span>}
      </Button>
    );
  }

  const runExport = async (format: ExportFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      const data = fetchAll ? await fetchAll() : rows;
      if (!data || data.length === 0) {
        toast.warning("لا توجد بيانات للتصدير");
        return;
      }
      const name = stampName(filename);
      const fullMeta = {
        "عدد السجلات": String(data.length),
        "تاريخ التصدير": new Date().toLocaleString("ar-SA"),
        ...(meta ?? {}),
      };
      if (format === "csv") exportCsv(name, columns, data);
      else if (format === "xlsx") exportXlsx(name, columns, data, title.slice(0, 31));
      else
        exportPdf({ filename: name, title, subtitle, cols: columns, rows: data, meta: fullMeta });
      toast.success(`تم تصدير ${data.length} سجل بصيغة ${FORMAT_META[format].label}`);
      setOpen(false);
    } catch (err) {
      console.error("[ExportMenu] export failed", err);
      toast.error("تعذّر التصدير", {
        description: err instanceof Error ? err.message : "خطأ غير متوقع",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => (busy ? null : setOpen(v))}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || busy !== null}
          className="gap-1.5"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {!compact && <span>{busy ? "جارٍ التصدير…" : label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
          اختر صيغة التصدير
        </div>
        {formats.map((f) => {
          const m = FORMAT_META[f];
          const Icon = m.icon;
          const isBusy = busy === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => runExport(f)}
              disabled={busy !== null}
              className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-right text-sm hover:bg-muted disabled:opacity-50"
            >
              <span className="mt-0.5">
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Icon className="h-4 w-4 text-primary" />
                )}
              </span>
              <span className="flex-1">
                <span className="block font-medium">{m.label}</span>
                <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
              </span>
            </button>
          );
        })}
        {fetchAll && (
          <div className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
            سيتم تحميل كامل النتائج المطابقة للفلاتر قبل التصدير.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
