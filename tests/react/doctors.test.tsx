/**
 * React component tests — doctors/*
 *
 * Covers:
 *  - LocalDoctorSearchProvider: filter/sort actions produce expected state
 *  - useFilteredDoctors: filters by specialty/branch/gender/language, sort
 *    modes, and pagination clamp
 *  - useFilterCounts: faceted counts respect OTHER filters (leave-one-out)
 *  - DoctorFilters: clicking a language checkbox toggles context state and
 *    renders the live count
 *
 * Run:  bun test tests/react/doctors.test.tsx
 */
import "./setup";
import { describe, test, expect, afterEach } from "bun:test";
import { render, renderHook, screen, act, cleanup, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  LocalDoctorSearchProvider,
  useDoctorSearch,
} from "../../src/components/doctors/DoctorSearchContext";
import { useFilteredDoctors } from "../../src/components/doctors/useFilteredDoctors";
import { useFilterCounts } from "../../src/components/doctors/useFilterCounts";
import { DoctorFilters } from "../../src/components/doctors/DoctorFilters";
import { I18nProvider } from "../../src/lib/i18n";
import type { DoctorRow } from "../../src/components/doctors/types";

afterEach(cleanup);

// ---- Fixtures -------------------------------------------------------------

const mkDoc = (over: Partial<DoctorRow> = {}): DoctorRow => ({
  id: "d",
  slug: "d",
  name_ar: "طبيب",
  name_en: "Doctor",
  title_ar: null,
  title_en: null,
  photo_url: null,
  gender: "male",
  years_experience: 5,
  languages: ["ar"],
  specialty_id: "s1",
  specialty_name_ar: "قلب",
  specialty_name_en: "Cardiology",
  branch_ids: ["b1"],
  branch_names_ar: ["الفرع الأول"],
  branch_slugs: ["main"],
  avg_rating: 4,
  ratings_count: 10,
  booking_enabled: true,
  total_count: 1,
  ...over,
});

const DOCS: DoctorRow[] = [
  mkDoc({
    id: "1",
    name_ar: "أحمد",
    name_en: "Ahmed",
    gender: "male",
    languages: ["ar"],
    avg_rating: 5,
    years_experience: 20,
    specialty_id: "s1",
    branch_ids: ["b1"],
  }),
  mkDoc({
    id: "2",
    name_ar: "سارة",
    name_en: "Sara",
    gender: "female",
    languages: ["ar", "en"],
    avg_rating: 4.5,
    years_experience: 10,
    specialty_id: "s2",
    branch_ids: ["b1", "b2"],
  }),
  mkDoc({
    id: "3",
    name_ar: "خالد",
    name_en: "Khalid",
    gender: "male",
    languages: ["en"],
    avg_rating: 3,
    years_experience: 15,
    specialty_id: "s1",
    branch_ids: ["b2"],
  }),
  mkDoc({
    id: "4",
    name_ar: "ليلى",
    name_en: "Layla",
    gender: "female",
    languages: ["ar", "en", "fr"],
    avg_rating: 4.8,
    years_experience: 8,
    specialty_id: "s2",
    branch_ids: ["b2"],
  }),
];

const wrapLocal =
  (initial?: Parameters<typeof LocalDoctorSearchProvider>[0]["initial"]) =>
  ({ children }: { children: ReactNode }) => (
    <LocalDoctorSearchProvider initial={initial}>{children}</LocalDoctorSearchProvider>
  );

// ---- LocalDoctorSearchProvider actions -----------------------------------

describe("LocalDoctorSearchProvider", () => {
  test("toggleLanguage adds then removes", () => {
    const { result } = renderHook(() => useDoctorSearch(), { wrapper: wrapLocal() });
    expect(result.current.language).toEqual([]);
    act(() => result.current.toggleLanguage("ar"));
    expect(result.current.language).toEqual(["ar"]);
    act(() => result.current.toggleLanguage("en"));
    expect(result.current.language).toEqual(["ar", "en"]);
    act(() => result.current.toggleLanguage("ar"));
    expect(result.current.language).toEqual(["en"]);
  });

  test("setGender + activeCount", () => {
    const { result } = renderHook(() => useDoctorSearch(), { wrapper: wrapLocal() });
    expect(result.current.activeCount).toBe(0);
    act(() => result.current.setGender("female"));
    expect(result.current.gender).toBe("female");
    expect(result.current.activeCount).toBe(1);
    act(() => result.current.toggleSpecialty("s1"));
    expect(result.current.activeCount).toBe(2);
  });

  test("clearAll resets filters but keeps sort", () => {
    const { result } = renderHook(() => useDoctorSearch(), {
      wrapper: wrapLocal({ sort: "experience" }),
    });
    act(() => {
      result.current.toggleLanguage("ar");
      result.current.setGender("male");
    });
    expect(result.current.activeCount).toBe(2);
    act(() => result.current.clearAll());
    expect(result.current.activeCount).toBe(0);
    expect(result.current.sort).toBe("experience");
  });

  test("toggling a filter resets page to 1", () => {
    const { result } = renderHook(() => useDoctorSearch(), {
      wrapper: wrapLocal({ page: 3 }),
    });
    expect(result.current.page).toBe(3);
    act(() => result.current.toggleSpecialty("s1"));
    expect(result.current.page).toBe(1);
  });
});

// ---- useFilteredDoctors ---------------------------------------------------

describe("useFilteredDoctors", () => {
  test("no filters → all doctors, sorted by rating desc", () => {
    const { result } = renderHook(() => useFilteredDoctors(DOCS), { wrapper: wrapLocal() });
    expect(result.current.filtered.map((d) => d.id)).toEqual(["1", "4", "2", "3"]);
  });

  test("filter by gender=female", () => {
    const { result } = renderHook(() => useFilteredDoctors(DOCS), {
      wrapper: wrapLocal({ gender: "female" }),
    });
    expect(result.current.filtered.map((d) => d.id).sort()).toEqual(["2", "4"]);
  });

  test("filter by language=ar,en → doctor must speak BOTH", () => {
    const { result } = renderHook(() => useFilteredDoctors(DOCS), {
      wrapper: wrapLocal({ language: ["ar", "en"] }),
    });
    expect(result.current.filtered.map((d) => d.id).sort()).toEqual(["2", "4"]);
  });

  test("filter by specialty=s1", () => {
    const { result } = renderHook(() => useFilteredDoctors(DOCS), {
      wrapper: wrapLocal({ specialty: ["s1"] }),
    });
    expect(result.current.filtered.map((d) => d.id).sort()).toEqual(["1", "3"]);
  });

  test("filter by branch=b2 (multi-branch aware)", () => {
    const { result } = renderHook(() => useFilteredDoctors(DOCS), {
      wrapper: wrapLocal({ branch: ["b2"] }),
    });
    // 2 has b1+b2, 3 has b2, 4 has b2
    expect(result.current.filtered.map((d) => d.id).sort()).toEqual(["2", "3", "4"]);
  });

  test("sort by experience desc", () => {
    const { result } = renderHook(() => useFilteredDoctors(DOCS), {
      wrapper: wrapLocal({ sort: "experience" }),
    });
    expect(result.current.filtered.map((d) => d.id)).toEqual(["1", "3", "2", "4"]);
  });

  test("full-text query against name and specialty", () => {
    const { result } = renderHook(() => useFilteredDoctors(DOCS), {
      wrapper: wrapLocal({ q: "sara" }),
    });
    expect(result.current.filtered.map((d) => d.id)).toEqual(["2"]);
  });

  test("empty result when no doctor matches", () => {
    const { result } = renderHook(() => useFilteredDoctors(DOCS), {
      wrapper: wrapLocal({ language: ["ur"] }),
    });
    expect(result.current.filtered).toEqual([]);
    expect(result.current.paged).toEqual([]);
    expect(result.current.totalPages).toBe(1);
  });
});

// ---- useFilterCounts (faceted, leave-one-out) -----------------------------

describe("useFilterCounts", () => {
  test("baseline counts with no filters", () => {
    const { result } = renderHook(() => useFilterCounts(DOCS), { wrapper: wrapLocal() });
    expect(result.current.language.ar).toBe(3); // 1, 2, 4
    expect(result.current.language.en).toBe(3); // 2, 3, 4
    expect(result.current.gender.male).toBe(2);
    expect(result.current.gender.female).toBe(2);
    expect(result.current.specialty.s1).toBe(2);
    expect(result.current.specialty.s2).toBe(2);
  });

  test("selecting gender=female shrinks specialty counts but not gender counts", () => {
    const { result } = renderHook(() => useFilterCounts(DOCS), {
      wrapper: wrapLocal({ gender: "female" }),
    });
    // Specialty counts constrained by gender=female: 2 & 4 are both s2.
    expect(result.current.specialty.s2).toBe(2);
    expect(result.current.specialty.s1 ?? 0).toBe(0);
    // Gender counts computed WITHOUT the gender filter → still baseline.
    expect(result.current.gender.male).toBe(2);
    expect(result.current.gender.female).toBe(2);
  });
});

// ---- DoctorFilters rendering + interaction --------------------------------

describe("DoctorFilters", () => {
  const langs = ["ar", "en", "fr"];

  test("renders language options with live counts and toggles context", () => {
    let ctxRef: ReturnType<typeof useDoctorSearch> | null = null;
    function Peek() {
      ctxRef = useDoctorSearch();
      return null;
    }
    function Setup() {
      const counts = useFilterCounts(DOCS);
      return (
        <>
          <Peek />
          <DoctorFilters
            specialties={[]}
            branches={[]}
            languages={langs}
            counts={counts}
            show={{ specialty: false, branch: false, gender: false }}
          />
        </>
      );
    }
    render(
      <I18nProvider>
        <LocalDoctorSearchProvider>
          <Setup />
        </LocalDoctorSearchProvider>
      </I18nProvider>,
    );

    // Each language label appears once. Default lang is Arabic so labels are Arabic.
    expect(screen.getByText("العربية")).toBeDefined();
    expect(screen.getByText("الإنجليزية")).toBeDefined();
    // Count next to Arabic label (3 doctors speak ar).
    expect(screen.getAllByLabelText("3 matches").length).toBeGreaterThan(0);

    // Toggle Arabic on → context updates.
    const arCheckbox = screen.getByText("العربية").closest("label")!.querySelector("input")!;
    act(() => fireEvent.click(arCheckbox));
    expect(ctxRef!.language).toEqual(["ar"]);
  });

  test("options with 0 matches are disabled", () => {
    // Constrain by gender=female → only doctors 2 & 4 remain (both speak ar/en,
    // 4 also speaks fr). Nobody speaks 'ur' → its facet count is 0 → disabled.
    function Setup() {
      const counts = useFilterCounts(DOCS);
      return (
        <DoctorFilters
          specialties={[]}
          branches={[]}
          languages={["ar", "en", "fr", "ur"]}
          counts={counts}
          show={{ specialty: false, branch: false, gender: false }}
        />
      );
    }
    render(
      <I18nProvider>
        <LocalDoctorSearchProvider initial={{ gender: "female" }}>
          <Setup />
        </LocalDoctorSearchProvider>
      </I18nProvider>,
    );
    // "الأوردو" = Arabic label for Urdu (default lang is ar).
    const urInput = screen
      .getByText("الأوردو")
      .closest("label")!
      .querySelector("input") as HTMLInputElement;
    expect(urInput.disabled).toBe(true);
    // 'fr' has 1 match (doctor 4) → NOT disabled.
    const frInput = screen
      .getByText("الفرنسية")
      .closest("label")!
      .querySelector("input") as HTMLInputElement;
    expect(frInput.disabled).toBe(false);
  });
});
