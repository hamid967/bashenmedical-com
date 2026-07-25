/**
 * ui-v3 shared state primitives — the single source of truth for
 * loading / disabled / error handling across Buttons, Fields, DataTable,
 * and Dialogs. Wrappers must consume these instead of re-implementing
 * spinners, error extraction, or busy toasts.
 */
import * as React from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────
 * Labels — bilingual defaults; consumers may override per call.
 * ──────────────────────────────────────────────────────────── */
export const V3_LABELS = {
  loading: "جارٍ التحميل…",
  saving: "جارٍ الحفظ…",
  processing: "جارٍ التنفيذ…",
  genericError: "حدث خطأ غير متوقّع.",
  saveError: "تعذّر الحفظ.",
  actionError: "تعذّر إتمام العملية.",
} as const;

/* ────────────────────────────────────────────────────────────
 * Error extraction — one canonical helper. Accepts Error,
 * PostgrestError-shaped objects, strings, or unknowns.
 * ──────────────────────────────────────────────────────────── */
export function extractErrorMessage(
  err: unknown,
  fallback: string = V3_LABELS.genericError,
): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object") {
    const rec = err as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message) return rec.message;
    if (typeof rec.error_description === "string" && rec.error_description) {
      return rec.error_description as string;
    }
    if (typeof rec.hint === "string" && rec.hint) return rec.hint as string;
  }
  return fallback;
}

/* ────────────────────────────────────────────────────────────
 * LoadingSpinner — the ONLY spinner used by ui-v3 wrappers.
 * ──────────────────────────────────────────────────────────── */
export interface LoadingSpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  label?: string;
}
export function LoadingSpinner({
  size = 16,
  label = V3_LABELS.loading,
  className,
  ...rest
}: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin", className)}
      width={size}
      height={size}
      role="status"
      aria-label={label}
      {...rest}
    />
  );
}

/* ────────────────────────────────────────────────────────────
 * InlineError — the ONLY inline error surface used by Fields
 * and Dialog bodies. Toast usage stays on `toast.error(...)`.
 * ──────────────────────────────────────────────────────────── */
export interface InlineErrorProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  /** Icon layout: 'compact' (icon+text inline) or 'banner' (padded card). */
  variant?: "compact" | "banner";
}
export function InlineError({ id, children, className, variant = "compact" }: InlineErrorProps) {
  if (variant === "banner") {
    return (
      <div
        id={id}
        role="alert"
        className={cn(
          "flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive",
          className,
        )}
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <p id={id} role="alert" className={cn("text-xs text-destructive", className)}>
      {children}
    </p>
  );
}

/* ────────────────────────────────────────────────────────────
 * useAsyncAction — unified busy/error state for dialog actions,
 * form submits, and any imperative async in wrappers.
 *
 *   const { run, busy, error, reset } = useAsyncAction();
 *   await run(async () => { … }, { onSuccess, errorFallback });
 *
 * By default surfaces errors via `toast.error(...)`; set
 * `mode: 'inline'` to keep the error in state without toasting.
 * ──────────────────────────────────────────────────────────── */
export interface AsyncActionOptions {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
  errorFallback?: string;
  /** How to surface errors: 'toast' (default) or 'inline' (state only). */
  mode?: "toast" | "inline" | "both";
}

export function useAsyncAction() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reset = React.useCallback(() => setError(null), []);

  const run = React.useCallback(
    async <T,>(fn: () => Promise<T> | T, opts: AsyncActionOptions = {}): Promise<T | undefined> => {
      const { onSuccess, onError, errorFallback, mode = "toast" } = opts;
      if (busy) return undefined;
      setBusy(true);
      setError(null);
      try {
        const result = await fn();
        if (mountedRef.current) onSuccess?.();
        return result;
      } catch (err) {
        const msg = extractErrorMessage(err, errorFallback);
        if (mountedRef.current && (mode === "inline" || mode === "both")) setError(msg);
        if (mode === "toast" || mode === "both") toast.error(msg);
        onError?.(err);
        return undefined;
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [busy],
  );

  return { run, busy, error, reset, setError };
}
