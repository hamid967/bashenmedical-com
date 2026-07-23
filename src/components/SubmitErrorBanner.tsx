import { AlertCircle, RefreshCw, WifiOff, Clock, ServerCrash, ShieldAlert } from "lucide-react";
import type { BookingSubmitKind } from "@/lib/booking-submit";
import {
  describeBookingError,
  kindToCode,
  formatCorrelationId,
} from "@/lib/booking/errors";

/**
 * Inline error banner rendered above a form when the last submission failed.
 *
 * Prefers server-provided `serverCode` (e.g. `SLOT_TAKEN`, `HOLD_EXPIRED`,
 * `INVALID_IDEMPOTENCY_KEY`) via `describeBookingError` so AR/EN copy stays
 * consistent with the central catalog in `src/lib/booking/errors.ts`.
 * Falls back to the transport-level `kind` and the raw `message` when no
 * code is available, preserving legacy behavior for older call sites.
 */

const FALLBACK_META: Record<
  Exclude<BookingSubmitKind, "success">,
  { titleAr: string; titleEn: string; icon: React.ReactNode }
> = {
  validation: { titleAr: "بيانات غير مقبولة", titleEn: "Invalid data", icon: <ShieldAlert className="h-5 w-5" /> },
  db: { titleAr: "تعذّر حفظ الطلب", titleEn: "Couldn't save request", icon: <ServerCrash className="h-5 w-5" /> },
  conflict: { titleAr: "الوقت لم يعد متاحًا", titleEn: "Slot unavailable", icon: <Clock className="h-5 w-5" /> },
  network: { titleAr: "لا يوجد اتصال", titleEn: "No connection", icon: <WifiOff className="h-5 w-5" /> },
  timeout: { titleAr: "انتهت مهلة الاتصال", titleEn: "Request timed out", icon: <Clock className="h-5 w-5" /> },
  server: { titleAr: "خطأ في الخادم", titleEn: "Server error", icon: <ServerCrash className="h-5 w-5" /> },
  unknown: { titleAr: "حدث خطأ غير متوقع", titleEn: "Unexpected error", icon: <AlertCircle className="h-5 w-5" /> },
};

function iconForKind(kind: Exclude<BookingSubmitKind, "success">) {
  return (FALLBACK_META[kind] ?? FALLBACK_META.unknown).icon;
}

export function SubmitErrorBanner({
  kind,
  message,
  onRetry,
  retrying,
  serverCode = null,
  correlationId = null,
  lang = "ar",
}: {
  kind: Exclude<BookingSubmitKind, "success">;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Machine-readable server code, e.g. `SLOT_TAKEN`, `HOLD_EXPIRED`. */
  serverCode?: string | null;
  /** Booking attempt correlation ID for support (last 8 chars shown). */
  correlationId?: string | null;
  lang?: "ar" | "en";
}) {
  const descriptor = serverCode ? describeBookingError(serverCode) : null;
  const effectiveCode = descriptor?.code ?? kindToCode(kind, serverCode);
  const title =
    descriptor && descriptor.code !== "UNKNOWN"
      ? descriptor.title[lang]
      : (FALLBACK_META[kind] ?? FALLBACK_META.unknown)[lang === "ar" ? "titleAr" : "titleEn"];
  const bodyMessage =
    descriptor && descriptor.code !== "UNKNOWN" && !message
      ? descriptor.message[lang]
      : message;

  const showRetry =
    kind !== "validation" &&
    !!onRetry &&
    // Descriptor says the error is recoverable in-flow.
    (descriptor?.recoverable ?? true);

  const shortCid = formatCorrelationId(correlationId);
  const supportLabel = lang === "ar" ? "مرجع الدعم" : "Support ref";
  const retryLabel = lang === "ar" ? "إعادة المحاولة" : "Retry";
  const retryingLabel = lang === "ar" ? "جاري إعادة المحاولة..." : "Retrying...";

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-error-code={effectiveCode}
      className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-3"
    >
      <div className="mt-0.5 text-destructive shrink-0">{iconForKind(kind)}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-destructive">{title}</div>
        {bodyMessage && (
          <p className="mt-0.5 text-xs text-destructive/90 leading-5 break-words">{bodyMessage}</p>
        )}
        {shortCid && (
          <p className="mt-1 text-[10px] text-destructive/70 font-mono tracking-wide">
            {supportLabel}: {shortCid}
          </p>
        )}
        {showRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? retryingLabel : retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
