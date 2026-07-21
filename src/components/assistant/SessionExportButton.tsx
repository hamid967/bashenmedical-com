/**
 * Small dropdown button that exports the current AI session as CSV or PDF.
 * Reused across the public assistant and portal assistant surfaces.
 */
import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
import {
  exportSessionCSV,
  exportSessionPDF,
  type ExportMsg,
  type SessionExportOptions,
} from "@/lib/ai/session-export";

export type SessionExportButtonProps = {
  messages: ExportMsg[];
  sessionCredits: number;
  preEstimateTokens?: number;
  model?: string;
  conversationId?: string | null;
  surface?: string;
  lang?: "ar" | "en";
  disabled?: boolean;
  className?: string;
};

export function SessionExportButton(props: SessionExportButtonProps) {
  const { messages, disabled, className } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isAr = (props.lang ?? "ar") === "ar";
  const t = (ar: string, en: string) => (isAr ? ar : en);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isDisabled = disabled || messages.length === 0;
  const opts: SessionExportOptions = {
    messages,
    sessionCredits: props.sessionCredits,
    preEstimateTokens: props.preEstimateTokens,
    model: props.model,
    conversationId: props.conversationId,
    surface: props.surface,
    lang: isAr ? "ar" : "en",
  };

  return (
    <div ref={rootRef} className={`relative inline-block ${className ?? ""}`} dir={isAr ? "rtl" : "ltr"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isDisabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("تصدير تقرير الجلسة", "Export session report")}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        <span>{t("تصدير", "Export")}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute z-50 mt-1 min-w-[180px] rounded-md border border-black/10 dark:border-white/10 bg-popover text-popover-foreground shadow-lg ${isAr ? "start-0" : "end-0"}`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              exportSessionPDF(opts);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5 text-rose-500" aria-hidden />
            <span className="flex-1 text-start">{t("تقرير PDF (طباعة)", "PDF report (print)")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              exportSessionCSV(opts);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            <span className="flex-1 text-start">{t("جدول CSV", "CSV spreadsheet")}</span>
          </button>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-black/5 dark:border-white/10">
            {t("يشمل الرصيد، المدخلات/المخرجات، وخلاصة الطلبات", "Includes credits, input/output tokens, and request summary")}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SessionExportButton;
