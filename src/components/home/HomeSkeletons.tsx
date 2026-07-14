import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { JazanSectionLabel, JazanDivider } from "@/components/jazan";

/**
 * Wraps skeletons, an error fallback, and real content — cross-fading between
 * the three states in a single DOM slot. Skeleton block sizes intentionally
 * mirror the real layout so the swap is dimensionally stable.
 *
 * State precedence: error → loading → content.
 */
export function SkeletonSwap({
  loading,
  error,
  skeleton,
  errorFallback,
  children,
}: {
  loading: boolean;
  error?: unknown;
  skeleton: ReactNode;
  errorFallback?: ReactNode;
  children: ReactNode;
}) {
  const state: "error" | "skeleton" | "content" = error
    ? "error"
    : loading
      ? "skeleton"
      : "content";
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={state}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {state === "error" ? errorFallback ?? <SectionError /> : null}
        {state === "skeleton" ? skeleton : null}
        {state === "content" ? children : null}
      </motion.div>
    </AnimatePresence>
  );
}

/** Default error fallback for a home section — Jazan flavored. */
export function SectionError({
  title,
  hint,
  onRetry,
  retryLabel,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  retryLabel?: string;
} = {}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="glass-fut jazan-hairline flex flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <div className="grid h-11 w-11 place-items-center rounded-xl jazan-hairline bg-[var(--jazan-ivory,#FCF9F2)] text-[var(--jazan-terracotta,#B85C3C)]">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-[color:var(--fut-ink)]">
        {title ?? "تعذّر تحميل البيانات"}
      </div>
      <div className="max-w-sm text-xs text-[color:var(--fut-ink-muted)]">
        {hint ?? "حدث خطأ مؤقت أثناء الاتصال بالخادم. يمكنك إعادة المحاولة."}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 rounded-full jazan-hairline jazan-hairline-hover bg-[var(--jazan-ivory,#FCF9F2)] px-4 py-2 text-xs font-semibold text-[var(--jazan-teal,#075E63)] transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {retryLabel ?? "إعادة المحاولة"}
        </button>
      ) : null}
    </div>
  );
}

/** Small eyebrow shown above every section skeleton for visual continuity. */
function JazanSkeletonHeader({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <div className="mb-4">
      <JazanSectionLabel>{label}</JazanSectionLabel>
      <div className="skeleton-jazan mt-2 h-6 w-64 max-w-full rounded" />
    </div>
  );
}

/**
 * Specialties grid — matches real card: glass-fut p-5 + jazan-hairline,
 * icon 44×44, title + 2-line description.
 */
export function SpecialtiesSkeleton({
  count = 8,
  label,
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div>
      <JazanSkeletonHeader label={label} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="glass-fut jazan-hairline p-5">
            <div className="skeleton-jazan h-11 w-11 rounded-xl" />
            <div className="skeleton-jazan mt-3 h-4 w-3/4 rounded" />
            <div className="mt-1 space-y-1.5">
              <div className="skeleton-jazan h-3 w-full rounded" />
              <div className="skeleton-jazan h-3 w-4/5 rounded" />
            </div>
          </div>
        ))}
      </div>
      <JazanDivider variant="subtle" />
    </div>
  );
}

/**
 * Featured doctors grid — matches real card: glass-fut items-center p-6,
 * avatar 96×96 rounded-full, name/title/button.
 */
export function DoctorsSkeleton({
  count = 4,
  label,
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div>
      <JazanSkeletonHeader label={label} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="glass-fut jazan-hairline flex flex-col items-center p-6 text-center">
            <div className="skeleton-jazan h-24 w-24 rounded-full" />
            <div className="skeleton-jazan mt-4 h-4 w-2/3 rounded" />
            <div className="skeleton-jazan mt-1 h-3 w-1/2 rounded" />
            <div className="skeleton-jazan mt-4 h-8 w-full rounded-full" />
          </div>
        ))}
      </div>
      <JazanDivider variant="subtle" />
    </div>
  );
}

/**
 * Announcements grid — badge + date, title, 3-line body, CTA pinned bottom.
 */
export function AnnouncementsSkeleton({
  count = 3,
  label,
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div>
      <JazanSkeletonHeader label={label} />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="glass-fut jazan-hairline flex h-full flex-col p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="skeleton-jazan h-6 w-28 rounded-full" />
              <div className="skeleton-jazan h-3 w-20 rounded" />
            </div>
            <div className="skeleton-jazan mt-5 h-6 w-4/5 rounded" />
            <div className="mt-2 space-y-2">
              <div className="skeleton-jazan h-3 w-full rounded" />
              <div className="skeleton-jazan h-3 w-11/12 rounded" />
              <div className="skeleton-jazan h-3 w-3/4 rounded" />
            </div>
            <div className="mt-auto pt-6">
              <div className="skeleton-jazan h-9 w-40 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      <JazanDivider variant="subtle" />
    </div>
  );
}
