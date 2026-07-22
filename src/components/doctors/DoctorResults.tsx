/**
 * DoctorResults — loading skeleton, empty states, results grid, and pagination
 * wired to the shared DoctorSearchContext + useFilteredDoctors pipeline.
 */
import { Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DoctorCard } from "./DoctorCard";
import { Pagination } from "./Pagination";
import { useDoctorSearch } from "./DoctorSearchContext";
import { useFilteredDoctors } from "./useFilteredDoctors";
import type { DoctorRow } from "./types";

type Props = {
  doctors: DoctorRow[];
  isLoading?: boolean;
  /** Map of doctor.id -> ISO next slot for the visible page. */
  nextSlotMap?: Record<string, string>;
  /** Notify parent about currently visible doctor ids so it can fetch slots. */
  onVisibleIdsChange?: (ids: string[]) => void;
  /** Number of skeleton cards while loading. */
  skeletonCount?: number;
  /** Called when user clicks pagination — parent can scroll to top, etc. */
  onPageChange?: (page: number) => void;
};

export function DoctorResults({
  doctors,
  isLoading = false,
  nextSlotMap = {},
  onVisibleIdsChange,
  skeletonCount = 6,
  onPageChange,
}: Props) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const { activeCount, clearAll, setPage } = useDoctorSearch();
  const { paged, totalPages, page } = useFilteredDoctors(doctors, { ar });

  // Notify parent about visible ids (memoised in the child via sort+join).
  const visibleKey = paged
    .map((d) => d.id)
    .sort()
    .join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useVisibleIdsEffect(visibleKey, onVisibleIdsChange);

  if (isLoading) {
    return (
      <div
        className="grid gap-5 sm:grid-cols-2"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={ar ? "جارٍ تحميل قائمة الأطباء" : "Loading doctors"}
      >
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="glass-fut p-5" aria-hidden>
            <div className="flex items-center gap-4">
              <div className="skeleton-neon h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton-neon h-4 w-2/3 rounded" />
                <div className="skeleton-neon h-3 w-1/2 rounded" />
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <div className="skeleton-neon h-3 w-full rounded" />
              <div className="skeleton-neon h-3 w-5/6 rounded" />
            </div>
            <div className="skeleton-neon mt-6 h-10 w-full rounded-xl" />
          </div>
        ))}
        <span className="sr-only">{ar ? "جارٍ تحميل قائمة الأطباء…" : "Loading doctors…"}</span>
      </div>
    );
  }

  if (paged.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-dashed border-border bg-card p-12 text-center"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Search className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        {activeCount > 0 ? (
          <>
            <h3 className="text-base font-semibold text-foreground">
              {ar ? "لا يوجد أطباء يطابقون بحثك" : "No doctors match your search"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {ar
                ? "جرّب تعديل الفلاتر أو مسحها لعرض المزيد من النتائج."
                : "Try adjusting or clearing your filters to see more results."}
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <X className="h-4 w-4" />
              {ar ? `مسح الفلاتر (${activeCount})` : `Clear filters (${activeCount})`}
            </button>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-foreground">
              {ar ? "لا يوجد أطباء لعرضهم حاليًا" : "No doctors available yet"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {ar
                ? "سيتم إضافة الأطباء قريبًا. يرجى المحاولة لاحقًا."
                : "Doctors will be listed here soon. Please check back later."}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        {paged.map((d) => (
          <DoctorCard key={d.id} d={d} lang={lang} nextSlotIso={nextSlotMap[d.id]} />
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onGo={(p) => {
            setPage(p);
            onPageChange?.(p);
          }}
          ar={ar}
        />
      )}
    </>
  );
}

// Small helper: fire onVisibleIdsChange whenever the id set actually changes.
import { useEffect } from "react";
function useVisibleIdsEffect(key: string, cb: ((ids: string[]) => void) | undefined) {
  useEffect(() => {
    if (!cb) return;
    cb(key ? key.split(",") : []);
  }, [key, cb]);
}
