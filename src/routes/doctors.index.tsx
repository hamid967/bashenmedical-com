/**
 * صفحة الأطباء — Doctors listing (UDH-style)
 *
 * Composes shared building blocks: <UrlDoctorSearchProvider> owns URL-synced
 * state; <DoctorSearchBar>, <DoctorFilters>, and <DoctorResults> read/write
 * through the same context (see src/components/doctors/DoctorSearchContext).
 * The same trio can be embedded elsewhere with <LocalDoctorSearchProvider>.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, Users, ArrowUpDown } from "lucide-react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { buildLocalBusinessSchema, buildBreadcrumbs } from "@/lib/localBusinessSchema";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { type DoctorRow } from "@/components/doctors/types";
import {
  UrlDoctorSearchProvider,
  useDoctorSearch,
  SORT_KEYS,
  type SortKey,
  type UrlPatch,
} from "@/components/doctors/DoctorSearchContext";
import { useFilteredDoctors } from "@/components/doctors/useFilteredDoctors";
import { useFilterCounts } from "@/components/doctors/useFilterCounts";
import { DoctorSearchBar } from "@/components/doctors/DoctorSearchBar";
import { DoctorFilters } from "@/components/doctors/DoctorFilters";
import { DoctorResults } from "@/components/doctors/DoctorResults";
import { bmcOgImageMeta } from "@/lib/og-meta";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  specialty: fallback(z.string(), "").default(""),
  branch: fallback(z.string(), "").default(""),
  gender: fallback(z.string(), "").default(""),
  language: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "rating").default("rating"),
  page: fallback(z.number().int(), 1).default(1),
});

type SearchParams = z.infer<typeof searchSchema>;

const SITE_URL = "https://bashenmedical.com";
const PAGE_URL = `${SITE_URL}/doctors`;
const PAGE_TITLE = "أطباؤنا | مجمع باعشن الطبي";
const PAGE_DESC =
  "استشاريون وأخصائيون في مختلف التخصصات الطبية بمجمع باعشن الطبي — احجز موعدًا مع طبيبك في صبيا، جازان.";

async function fetchDoctors(): Promise<DoctorRow[]> {
  const { data, error } = await supabase.rpc("list_public_doctors", {
    _limit: 200,
    _offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as unknown as DoctorRow[];
}

export const Route = createFileRoute("/doctors/")({
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["public-doctors"],
      queryFn: fetchDoctors,
    }),
  head: ({ loaderData }) => {
    const list = (loaderData as DoctorRow[] | undefined) ?? [];
    const listed = list.filter((d) => d.slug);

    const buildPhysician = (d: DoctorRow) => {
      const url = `${SITE_URL}/doctors/${encodeURIComponent(d.slug!)}`;
      const node: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Physician",
        "@id": url,
        name: d.name_ar,
        alternateName: d.name_en || undefined,
        url,
      };
      if (d.photo_url) node.image = d.photo_url;
      if (d.specialty_name_ar || d.specialty_name_en) {
        node.medicalSpecialty = d.specialty_name_en || d.specialty_name_ar;
      }
      if (d.languages && d.languages.length > 0) node.knowsLanguage = d.languages;
      if (d.gender === "male" || d.gender === "female") node.gender = d.gender;
      if (d.branch_names_ar && d.branch_names_ar.length > 0) {
        node.affiliation = d.branch_names_ar.map((name) => ({
          "@type": "Hospital",
          name,
        }));
      }
      if (d.ratings_count > 0 && d.avg_rating > 0) {
        node.aggregateRating = {
          "@type": "AggregateRating",
          ratingValue: Number(d.avg_rating).toFixed(1),
          reviewCount: d.ratings_count,
          bestRating: "5",
          worstRating: "1",
        };
      }
      return node;
    };

    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: PAGE_TITLE,
      numberOfItems: listed.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: listed.map((d, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/doctors/${encodeURIComponent(d.slug!)}`,
        item: buildPhysician(d),
      })),
    };

    return {
      meta: [
        ...bmcOgImageMeta(),
        { title: PAGE_TITLE },
        { name: "description", content: PAGE_DESC },
        { property: "og:title", content: PAGE_TITLE },
        { property: "og:description", content: PAGE_DESC },
        { property: "og:type", content: "website" },
        { property: "og:url", content: PAGE_URL },
        { property: "og:locale", content: "ar_SA" },
      ],
      links: [{ rel: "canonical", href: PAGE_URL }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(buildLocalBusinessSchema({ pageUrl: PAGE_URL })),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            buildBreadcrumbs([
              { name: "الرئيسية", path: "/" },
              { name: "الأطباء", path: "/doctors" },
            ]),
          ),
        },
        ...(listed.length > 0
          ? [{ type: "application/ld+json", children: JSON.stringify(itemList) }]
          : []),
      ],
    };
  },
  component: DoctorsPage,
});

function DoctorsPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/doctors/" });

  // Route-owned typed patch/reset callbacks. The provider stays generic.
  const onPatch = useCallback(
    (patch: UrlPatch, resetPage: boolean) => {
      navigate({
        search: (prev: SearchParams) => ({
          ...prev,
          ...patch,
          ...(resetPage ? { page: 1 } : null),
        }),
        replace: true,
      });
    },
    [navigate],
  );
  const onReset = useCallback(
    () =>
      navigate({
        search: (prev: SearchParams) => ({
          q: "",
          specialty: "",
          branch: "",
          gender: "",
          language: "",
          sort: prev.sort,
          page: 1,
        }),
        replace: true,
      }),
    [navigate],
  );

  return (
    <UrlDoctorSearchProvider params={params} onPatch={onPatch} onReset={onReset}>
      <DoctorsPageBody />
    </UrlDoctorSearchProvider>
  );
}

function DoctorsPageBody() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const { sort, activeCount, setSort } = useDoctorSearch();

  const { data: doctors = [], isLoading } = useQuery({
    queryKey: ["public-doctors"],
    queryFn: fetchDoctors,
    staleTime: 60_000,
  });

  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties-active"],
    queryFn: async () =>
      (
        await supabase
          .from("specialties")
          .select("id,slug,name_ar,name_en")
          .eq("is_active", true)
          .order("sort_order")
      ).data ?? [],
    staleTime: 5 * 60_000,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["public-branches"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_public_branches");
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const allLangs = useMemo(() => {
    const s = new Set<string>();
    doctors.forEach((d) => (d.languages ?? []).forEach((l) => s.add(l)));
    return Array.from(s);
  }, [doctors]);

  // Derived state shown in the hero + faceted counts for filter previews.
  const { filtered, start, perPage } = useFilteredDoctors(doctors, { ar });
  const counts = useFilterCounts(doctors);

  // Live-preview visual feedback: briefly fade the results whenever the
  // filter/sort signature changes, so the user perceives the update.
  const { q, specialty, branch, gender, language, sort: activeSort } = useDoctorSearch();
  const filterKey = `${q}|${specialty.join(",")}|${branch.join(",")}|${gender}|${language.join(",")}|${activeSort}`;
  const [flash, setFlash] = useState(false);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 220);
    return () => window.clearTimeout(t);
  }, [filterKey]);

  // Fetch next available slot for currently visible doctors only.
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const visibleKey = useMemo(() => [...visibleIds].sort(), [visibleIds]);
  const { data: nextSlotMap = {} as Record<string, string> } = useQuery({
    queryKey: ["doctors-next-slots", visibleKey],
    enabled: visibleKey.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_doctors_next_slot", {
        _doctor_ids: visibleKey,
      });
      if (error) return {};
      const out: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ doctor_id: string; next_slot_at: string }>) {
        out[row.doctor_id] = row.next_slot_at;
      }
      return out;
    },
  });

  const sortLabel = (s: SortKey): string =>
    ar
      ? s === "rating"
        ? "الأعلى تقييمًا"
        : s === "experience"
          ? "الأكثر خبرة"
          : "الاسم (أ-ي)"
      : s === "rating"
        ? "Top rated"
        : s === "experience"
          ? "Most experienced"
          : "Name (A-Z)";

  const filtersPanel = (
    <DoctorFilters
      specialties={specialties}
      branches={branches}
      languages={allLangs}
      counts={counts}
    />
  );

  return (
    <div className="bg-muted/30 min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />
        <div className="container-app relative py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              <Users className="h-3.5 w-3.5" />
              {ar ? "الفريق الطبي" : "Medical team"}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1]">
              {ar ? "أطباؤنا الاستشاريون" : "Our Consultant Doctors"}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
              {ar
                ? "نخبة من الأطباء الاستشاريين والأخصائيين في مختلف التخصصات. ابحث عن طبيبك، تعرف على خبرته، واحجز موعدك في دقائق."
                : "A selection of consultants and specialists across many specialties. Find your doctor, review their expertise, and book in minutes."}
            </p>

            <div className="mt-8">
              <DoctorSearchBar />
            </div>

            <div className="mt-8 flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">{doctors.length}+</span>
                <span className="text-muted-foreground">
                  {ar ? "طبيب واستشاري" : "Doctors & consultants"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">{specialties.length}+</span>
                <span className="text-muted-foreground">{ar ? "تخصص طبي" : "Specialties"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">{branches.length}</span>
                <span className="text-muted-foreground">{ar ? "فروع" : "Branches"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container-app py-8">
        <div className="grid lg:grid-cols-[300px_1fr] gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  {ar ? "تصفية النتائج" : "Filter results"}
                </h3>
              </div>
              {filtersPanel}
            </div>
          </aside>

          <section aria-label="Doctors results">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {ar ? (
                  <>
                    عرض{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {filtered.length === 0 ? 0 : start + 1}–
                      {Math.min(start + perPage, filtered.length)}
                    </span>{" "}
                    من أصل{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {filtered.length}
                    </span>
                  </>
                ) : (
                  <>
                    Showing{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {filtered.length === 0 ? 0 : start + 1}–
                      {Math.min(start + perPage, filtered.length)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {filtered.length}
                    </span>
                  </>
                )}
              </p>

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowUpDown className="h-4 w-4" />
                  <span className="hidden sm:inline">{ar ? "الترتيب" : "Sort"}</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label={ar ? "الترتيب" : "Sort"}
                  >
                    {SORT_KEYS.map((s) => (
                      <option key={s} value={s}>
                        {sortLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="lg:hidden gap-2">
                      <Filter className="h-4 w-4" />
                      {ar ? "تصفية" : "Filters"}
                      {activeCount > 0 && (
                        <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">
                          {activeCount}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side={ar ? "right" : "left"} className="overflow-y-auto">
                    <h3 className="font-bold mb-4 mt-4 flex items-center gap-2">
                      <Filter className="h-4 w-4 text-primary" />
                      {ar ? "تصفية النتائج" : "Filter results"}
                    </h3>
                    {filtersPanel}
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            <div
              className={`transition-opacity duration-200 ${flash ? "opacity-60" : "opacity-100"}`}
            >
              <DoctorResults
                doctors={doctors}
                isLoading={isLoading}
                nextSlotMap={nextSlotMap}
                onVisibleIdsChange={setVisibleIds}
                onPageChange={() => {
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
