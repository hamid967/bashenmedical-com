import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Search, MapPin, Stethoscope, X, CalendarPlus, Loader2, SearchX } from "lucide-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { BranchSpecialty, ExcellenceCenter, PublicBranch } from "@/lib/branches.functions";

type Props = {
  branch: PublicBranch;
  specialties: BranchSpecialty[];
  centers: ExcellenceCenter[];
  onBookService?: (payload: {
    specialtyId: string | null;
    label: string;
    kind: "specialty" | "center";
  }) => void;
};

function baseMapEmbed(b: PublicBranch): string | null {
  if (b.map_embed_url) return b.map_embed_url;
  if (b.lat != null && b.lng != null) {
    return `https://www.google.com/maps?q=${b.lat},${b.lng}&hl=ar&z=15&output=embed`;
  }
  return null;
}

function serviceMapEmbed(b: PublicBranch, serviceLabel: string): string | null {
  const anchor = b.address_ar || b.name_ar;
  const q = encodeURIComponent(`${serviceLabel} - ${anchor}`);
  if (b.lat != null && b.lng != null) {
    return `https://www.google.com/maps?q=${q}&ll=${b.lat},${b.lng}&hl=ar&z=16&output=embed`;
  }
  if (b.map_embed_url) return b.map_embed_url;
  return `https://www.google.com/maps?q=${q}&hl=ar&z=15&output=embed`;
}

type TabKey = "all" | "specialty" | "center";

export function BranchServicesExplorer({ branch, specialties, centers, onBookService }: Props) {
  const search = useSearch({ from: "/branches/$slug" });
  const navigate = useNavigate({ from: "/branches/$slug" });
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const deferredQuery = useDeferredValue(query);
  const isFiltering = query !== deferredQuery;
  type SelectedItem = {
    id: string;
    label: string;
    kind: "specialty" | "center";
    specialtyId: string | null;
  };
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const uid = useId();
  const searchId = `${uid}-search`;
  const tabsId = `${uid}-tabs`;
  const panelId = `${uid}-panel`;
  const listId = `${uid}-list`;
  const headingId = `${uid}-heading`;

  const totalCount = specialties.length + centers.length;

  const allItems = useMemo(() => {
    const specs = specialties.map((s) => ({
      id: `s:${s.id}`,
      label: s.name_ar,
      sub: s.name_en,
      kind: "specialty" as const,
      specialtyId: s.id,
    }));
    const cs = centers.map((c) => ({
      id: `c:${c.id}`,
      label: c.name_ar,
      sub: c.short_ar ?? c.name_en,
      kind: "center" as const,
      specialtyId: c.specialty_id ?? null,
    }));
    return [...cs, ...specs];
  }, [specialties, centers]);

  const searchMatches = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (x) => x.label.toLowerCase().includes(q) || (x.sub ?? "").toLowerCase().includes(q),
    );
  }, [allItems, deferredQuery]);

  const counts = useMemo(
    () => ({
      all: searchMatches.length,
      center: searchMatches.filter((x) => x.kind === "center").length,
      specialty: searchMatches.filter((x) => x.kind === "specialty").length,
    }),
    [searchMatches],
  );

  const items = useMemo(
    () => (tab === "all" ? searchMatches : searchMatches.filter((x) => x.kind === tab)),
    [searchMatches, tab],
  );

  const embed = selected ? serviceMapEmbed(branch, selected.label) : baseMapEmbed(branch);
  const hasCoords = branch.lat != null && branch.lng != null;
  const canBookSelected = !!(selected && selected.specialtyId && onBookService);
  const hasQuery = query.trim().length > 0;
  const isEmpty = items.length === 0;
  const resetAll = () => {
    setQuery("");
    setTab("all");
    searchInputRef.current?.focus();
  };

  // Hydrate selection from URL (?service=)
  useEffect(() => {
    const paramId = search.service ?? null;
    if (paramId === (selected?.id ?? null)) return;
    if (!paramId) {
      setSelected(null);
      return;
    }
    const match = allItems.find((it) => it.id === paramId);
    if (match) {
      setSelected({
        id: match.id,
        label: match.label,
        kind: match.kind,
        specialtyId: match.specialtyId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.service, allItems]);

  const selectItem = (it: SelectedItem | null) => {
    setSelected(it);
    setMapLoading(!!it);
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, service: it?.id }),
      replace: true,
      resetScroll: false,
    });
  };

  useEffect(() => {
    if (!embed || !iframeRef.current) return;
    const doc = iframeRef.current.contentWindow;
    if (!doc) {
      iframeRef.current.src = embed;
      return;
    }
    try {
      doc.location.replace(embed);
    } catch {
      iframeRef.current.src = embed;
    }
    setMapLoading(true);
  }, [embed]);

  const tabDefs: ReadonlyArray<{ k: TabKey; label: string; count: number; total: number }> = [
    { k: "all", label: "الكل", count: counts.all, total: totalCount },
    { k: "center", label: "مراكز التميز", count: counts.center, total: centers.length },
    { k: "specialty", label: "التخصصات", count: counts.specialty, total: specialties.length },
  ];

  const onTabsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = tabDefs.findIndex((t) => t.k === tab);
    if (idx < 0) return;
    let next = idx;
    // RTL: ArrowLeft goes forward, ArrowRight goes backward
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = (idx + 1) % tabDefs.length;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp")
      next = (idx - 1 + tabDefs.length) % tabDefs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabDefs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabDefs[next].k);
    tabsRef.current[next]?.focus();
  };

  const onItemsKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (!items.length) return;
    const target = e.target as HTMLElement;
    const current = itemsRef.current.findIndex((el) => el === target);
    if (current < 0) return;
    let next = current;
    if (e.key === "ArrowDown") next = (current + 1) % items.length;
    else if (e.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "Escape" && selected) {
      e.preventDefault();
      selectItem(null);
      return;
    } else return;
    e.preventDefault();
    itemsRef.current[next]?.focus();
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && hasQuery) {
      e.preventDefault();
      setQuery("");
    } else if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      itemsRef.current[0]?.focus();
    }
  };

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      aria-labelledby={headingId}
    >
      <header className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <h2 id={headingId} className="flex items-center gap-2 font-bold">
          <Stethoscope className="h-5 w-5 text-primary" aria-hidden />
          الخدمات المتوفرة في {branch.name_ar}
        </h2>
        <span
          className="text-xs text-muted-foreground flex items-center gap-1.5"
          aria-live="polite"
          aria-atomic="true"
        >
          {isFiltering && <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden />}
          {hasQuery ? `${items.length} نتيجة من ${totalCount}` : `${items.length} من ${totalCount}`}
        </span>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="p-4 space-y-3 border-b lg:border-b-0 lg:border-l border-border">
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              ابحث في خدمات الفرع
            </label>
            <Search
              className="h-4 w-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground pointer-events-none"
              aria-hidden
            />
            <input
              id={searchId}
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="ابحث عن خدمة أو تخصص..."
              className="w-full ps-9 pe-9 py-2.5 rounded-lg border border-input bg-background text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary"
              aria-controls={listId}
              aria-describedby={`${uid}-hint`}
            />
            <span id={`${uid}-hint`} className="sr-only">
              استخدم السهم السفلي للانتقال إلى قائمة النتائج، ومفتاح Escape لمسح البحث.
            </span>
            {hasQuery && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute top-1/2 -translate-y-1/2 end-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="مسح البحث"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>

          <div
            id={tabsId}
            role="tablist"
            aria-label="تصفية الخدمات"
            aria-orientation="horizontal"
            onKeyDown={onTabsKeyDown}
            className="flex gap-1 rounded-lg bg-muted p-1 text-xs"
          >
            {tabDefs.map((t, i) => {
              const isActive = tab === t.k;
              const isEmptyCat = t.count === 0;
              const tabId = `${uid}-tab-${t.k}`;
              const countLabel = hasQuery ? `${t.count} نتيجة من ${t.total}` : `${t.total} عنصر`;
              return (
                <button
                  key={t.k}
                  id={tabId}
                  ref={(el) => {
                    tabsRef.current[i] = el;
                  }}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={panelId}
                  aria-label={`${t.label} — ${countLabel}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setTab(t.k)}
                  className={`flex-1 rounded-md px-2.5 py-1.5 font-medium transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    isActive
                      ? "bg-background text-primary shadow-sm"
                      : isEmptyCat && hasQuery
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="truncate">{t.label}</span>
                  <span
                    aria-hidden
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold min-w-[1.4rem] text-center ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : isEmptyCat
                          ? "bg-muted-foreground/10 text-muted-foreground/60"
                          : "bg-background text-muted-foreground"
                    }`}
                  >
                    {hasQuery ? `${t.count}/${t.total}` : t.total}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${tab}`}
            tabIndex={-1}
            className="focus-visible:outline-none"
          >
            <ul
              id={listId}
              className={`max-h-[420px] overflow-y-auto space-y-1.5 pr-1 transition-opacity ${
                isFiltering ? "opacity-60" : "opacity-100"
              }`}
              aria-busy={isFiltering}
              aria-live="polite"
              aria-relevant="additions removals"
              onKeyDown={onItemsKeyDown}
            >
              {isEmpty ? (
                <li>
                  <div
                    role="status"
                    className="flex flex-col items-center text-center gap-3 py-10 px-4 rounded-lg border border-dashed border-border bg-muted/30"
                  >
                    <div className="h-11 w-11 rounded-full bg-muted grid place-items-center text-muted-foreground">
                      <SearchX className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {hasQuery
                          ? `لا توجد نتائج لـ "${query.trim()}"`
                          : tab === "center"
                            ? "لا توجد مراكز تميز في هذا الفرع"
                            : tab === "specialty"
                              ? "لا توجد تخصصات في هذا الفرع"
                              : "لا توجد خدمات لعرضها"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {hasQuery
                          ? "جرّب كلمات أخرى أو أزل الفلاتر لعرض كل الخدمات."
                          : "جرّب تغيير الفلتر لعرض قائمة مختلفة."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {hasQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            searchInputRef.current?.focus();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden /> مسح البحث
                        </button>
                      )}
                      {(tab !== "all" || hasQuery) && (
                        <button
                          type="button"
                          onClick={resetAll}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          عرض كل الخدمات
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ) : (
                items.map((it, i) => {
                  const active = selected?.id === it.id;
                  return (
                    <li key={it.id}>
                      <button
                        ref={(el) => {
                          itemsRef.current[i] = el;
                        }}
                        type="button"
                        onClick={() =>
                          selectItem(
                            active
                              ? null
                              : {
                                  id: it.id,
                                  label: it.label,
                                  kind: it.kind,
                                  specialtyId: it.specialtyId,
                                },
                          )
                        }
                        className={`w-full text-start rounded-lg border px-3 py-2.5 text-sm transition-all flex items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                          active
                            ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                            : "border-border hover:border-primary/40 hover:bg-muted/40"
                        }`}
                        aria-pressed={active}
                        aria-label={`${it.kind === "center" ? "مركز تميز" : "تخصص"}: ${it.label}${
                          active ? " — محدد على الخريطة" : ""
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              it.kind === "center" ? "bg-primary" : "bg-accent"
                            }`}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span className="block font-medium truncate">{it.label}</span>
                            {it.sub && (
                              <span className="block text-xs text-muted-foreground truncate">
                                {it.sub}
                              </span>
                            )}
                          </span>
                        </span>
                        {active && <MapPin className="h-4 w-4 text-primary shrink-0" aria-hidden />}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        {/* Map panel */}
        <div className="relative bg-muted min-h-[360px]" role="region" aria-label="خريطة الموقع">
          {embed ? (
            <>
              <iframe
                ref={iframeRef}
                title={
                  selected
                    ? `خريطة ${selected.label} - ${branch.name_ar}`
                    : `خريطة ${branch.name_ar}`
                }
                src={embed}
                onLoad={() => setMapLoading(false)}
                className={`w-full h-full min-h-[360px] transition-opacity duration-300 ${
                  mapLoading ? "opacity-70" : "opacity-100"
                }`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              {mapLoading && (
                <div
                  className="pointer-events-none absolute top-3 end-3 rounded-full bg-background/95 backdrop-blur border border-border shadow px-2.5 py-1 text-xs text-muted-foreground flex items-center gap-1.5"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
                  جاري تحديث الخريطة...
                </div>
              )}
            </>
          ) : (
            <div className="h-full min-h-[360px] grid place-items-center text-sm text-muted-foreground">
              لا يوجد موقع محدد على الخريطة لهذا الفرع.
            </div>
          )}

          {selected && (
            <div
              className="absolute top-3 start-3 end-3 rounded-lg bg-background/95 backdrop-blur border border-border shadow-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-center"
              role="status"
              aria-live="polite"
            >
              <MapPin className="h-5 w-5 text-primary shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  {selected.kind === "center" ? "مركز تميز" : "تخصص"} — {branch.name_ar}
                </div>
                <div className="font-semibold truncate">{selected.label}</div>
                {!hasCoords && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    الموقع الدقيق للخدمة غير متوفر — يعرض موقع الفرع تقريبيًا.
                  </div>
                )}
                {selected.kind === "center" && !selected.specialtyId && onBookService && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    هذا المركز غير مرتبط بتخصص محدد — استخدم نموذج الحجز أدناه.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {canBookSelected && (
                  <button
                    type="button"
                    onClick={() =>
                      onBookService!({
                        specialtyId: selected!.specialtyId,
                        label: selected!.label,
                        kind: selected!.kind,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
                    aria-label={`احجز خدمة ${selected!.label}`}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                    احجز هذه الخدمة
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => selectItem(null)}
                  className="rounded-md p-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label="إلغاء تحديد الخدمة"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
