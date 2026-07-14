import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

/**
 * Inline banner shown above a portal form when a save/mutation fails.
 * Provides a retry button that re-runs the last submitted operation.
 */
export function MutationErrorBanner({
  title = "تعذّر حفظ التغييرات",
  message,
  onRetry,
  retrying,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-3"
    >
      <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-red-800">{title}</div>
        <p className="mt-0.5 text-xs text-red-700 leading-5 break-words">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {retrying ? "جاري إعادة المحاولة..." : "إعادة المحاولة"}
          </button>
        )}
      </div>
    </div>
  );
}
