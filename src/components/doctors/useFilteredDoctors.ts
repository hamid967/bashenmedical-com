/**
 * useFilteredDoctors — apply the shared filter/sort/paginate pipeline from
 * DoctorSearchContext to a doctor list. Used by DoctorResults and any custom
 * consumer that needs the same derived data (mini widgets, counters, etc.).
 */
import { useEffect, useMemo } from "react";
import { PER_PAGE, useDoctorSearch } from "./DoctorSearchContext";
import type { DoctorRow } from "./types";

export type FilteredDoctors = {
  /** All doctors after filters (before pagination). */
  filtered: DoctorRow[];
  /** Doctors on the current page. */
  paged: DoctorRow[];
  /** 1-based current page after clamping to available pages. */
  page: number;
  totalPages: number;
  /** Zero-based offset of the first item on the current page. */
  start: number;
  perPage: number;
};

export function useFilteredDoctors(
  doctors: DoctorRow[],
  opts: { ar: boolean } = { ar: true },
): FilteredDoctors {
  const { q, specialty, branch, gender, language, sort, page, setPage } = useDoctorSearch();
  const { ar } = opts;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = doctors.filter((d) => {
      if (specialty.length && (!d.specialty_id || !specialty.includes(d.specialty_id)))
        return false;
      if (branch.length) {
        const ids = d.branch_ids ?? [];
        if (!ids.some((b) => branch.includes(b))) return false;
      }
      if (gender && d.gender !== gender) return false;
      if (language.length) {
        const langs = d.languages ?? [];
        if (!language.every((l) => langs.includes(l))) return false;
      }
      if (query) {
        const name = `${d.name_ar} ${d.name_en}`.toLowerCase();
        const spec = `${d.specialty_name_ar ?? ""} ${d.specialty_name_en ?? ""}`.toLowerCase();
        if (!name.includes(query) && !spec.includes(query)) return false;
      }
      return true;
    });

    const collator = new Intl.Collator(ar ? "ar" : "en", { sensitivity: "base" });
    list.sort((a, b) => {
      if (sort === "rating") {
        const diff = Number(b.avg_rating ?? 0) - Number(a.avg_rating ?? 0);
        if (diff !== 0) return diff;
        return (b.ratings_count ?? 0) - (a.ratings_count ?? 0);
      }
      if (sort === "experience") {
        return (b.years_experience ?? 0) - (a.years_experience ?? 0);
      }
      const an = ar ? a.name_ar : a.name_en || a.name_ar;
      const bn = ar ? b.name_ar : b.name_en || b.name_ar;
      return collator.compare(an, bn);
    });
    return list;
  }, [doctors, q, specialty, branch, gender, language, sort, ar]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // Clamp page when filters shrink the result set below the current page.
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, page]);

  const start = (safePage - 1) * PER_PAGE;
  const paged = filtered.slice(start, start + PER_PAGE);

  return { filtered, paged, page: safePage, totalPages, start, perPage: PER_PAGE };
}
