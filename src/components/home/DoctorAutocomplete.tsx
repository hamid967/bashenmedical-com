import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Search, Loader2, User2, MapPin, Stethoscope } from "lucide-react";

type Doctor = {
  id: string;
  name_ar: string;
  name_en: string;
  photo_url: string | null;
  branch_id: string | null;
  branch_name_ar: string | null;
  branch_name_en: string | null;
  specialty_id: string | null;
  specialty_slug: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  title_ar: string | null;
  title_en: string | null;
};

type Branch = { id: string; name_ar: string; name_en: string };
type Specialty = { id: string; slug: string; name_ar: string; name_en: string };

export function DoctorAutocomplete() {
  const { lang } = useI18n();
  const { t } = useTranslation("doctorAutocomplete");
  const navigate = useNavigate();
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const iconSide = isAr ? "right-3" : "left-3";
  const inputPad = isAr ? "pr-9" : "pl-9";
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [branch, setBranch] = useState<string>("");
  const [specialty, setSpecialty] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 220);
    return () => window.clearTimeout(id);
  }, [q]);

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const { data: branches } = useQuery({
    queryKey: ["home_ac_branches"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_public_branches");
      return (data ?? []) as Branch[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: specialties } = useQuery({
    queryKey: ["home_ac_specialties"],
    queryFn: async () => {
      const { data } = await supabase
        .from("specialties")
        .select("id,slug,name_ar,name_en")
        .eq("is_active", true)
        .order("sort_order");
      return (data ?? []) as Specialty[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: results, isFetching } = useQuery({
    queryKey: ["home_ac_doctors", debounced, branch, specialty],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const { data } = await supabase.rpc("list_public_doctors", {
        _q: debounced,
        _branch_id: branch || undefined,
        _specialty_slug: specialty || undefined,
        _limit: 8,
        _offset: 0,
      });
      return (data ?? []) as Doctor[];
    },
    staleTime: 30_000,
  });

  const list = useMemo(() => results ?? [], [results]);
  useEffect(() => setActiveIdx(0), [list]);

  const goToDoctor = (d: Doctor) => {
    const search: Record<string, string> = { doctor: d.id };
    if (d.specialty_slug) search.specialty = d.specialty_slug;
    else if (specialty) search.specialty = specialty;
    if (d.branch_id) search.branch = d.branch_id;
    else if (branch) search.branch = branch;
    setOpen(false);
    navigate({ to: "/book", search });
  };

  const goSearchAll = () => {
    const search: Record<string, string> = {};
    if (debounced) search.q = debounced;
    if (specialty) search.specialty = specialty;
    if (branch) search.branch = branch;
    navigate({ to: "/doctors", search });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (list[activeIdx]) goToDoctor(list[activeIdx]);
      else if (debounced.length >= 2) goSearchAll();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="glass-fut mx-auto mt-10 max-w-3xl p-3 md:p-4 text-start"
      dir={dir}
    >
      <div className="grid gap-2 md:grid-cols-[1.6fr_1fr_1fr]">
        {/* Search input */}
        <div className="relative">
          <label htmlFor="home-doctor-ac" className="sr-only">
            {t("searchLabel")}
          </label>
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${iconSide} text-[color:var(--fut-ink-muted)]`}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </span>
          <input
            id="home-doctor-ac"
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="home-doctor-ac-listbox"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => q.trim().length >= 2 && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={t("searchPlaceholder")}
            className={`input-glow w-full ${inputPad}`}
            autoComplete="off"
          />
        </div>

        {/* Branch filter */}
        <label className="block">
          <span className="sr-only">{t("branch")}</span>
          <div className="relative">
            <MapPin
              aria-hidden="true"
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--fut-ink-muted)] ${iconSide}`}
            />
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className={`input-glow w-full appearance-none ${inputPad}`}
              aria-label={t("branch")}
            >
              <option value="">{t("allBranches")}</option>
              {branches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {isAr ? b.name_ar : b.name_en}
                </option>
              ))}
            </select>
          </div>
        </label>

        {/* Specialty filter */}
        <label className="block">
          <span className="sr-only">{t("clinic")}</span>
          <div className="relative">
            <Stethoscope
              aria-hidden="true"
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--fut-ink-muted)] ${iconSide}`}
            />
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className={`input-glow w-full appearance-none ${inputPad}`}
              aria-label={t("clinicAria")}
            >
              <option value="">{t("allClinics")}</option>
              {specialties?.map((s) => (
                <option key={s.id} value={s.slug}>
                  {isAr ? s.name_ar : s.name_en}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      {/* Results dropdown */}
      {open && debounced.length >= 2 && (
        <div
          id="home-doctor-ac-listbox"
          role="listbox"
          className="mt-3 max-h-96 overflow-auto rounded-xl border border-[color:var(--jazan-gold)]/30 bg-[var(--jazan-ivory)]/95 shadow-lg backdrop-blur"
        >
          {isFetching && list.length === 0 ? (
            <div className="p-4 text-sm text-[color:var(--fut-ink-muted)]">{t("searching")}</div>
          ) : list.length === 0 ? (
            <div className="p-4 text-sm text-[color:var(--fut-ink-muted)]">{t("noResults")}</div>
          ) : (
            <ul className="divide-y divide-[color:var(--jazan-gold)]/20">
              {list.map((d, i) => {
                const name = isAr ? d.name_ar : d.name_en;
                const title = isAr ? d.title_ar : d.title_en;
                const spec = isAr ? d.specialty_name_ar : d.specialty_name_en;
                const br = isAr ? d.branch_name_ar : d.branch_name_en;
                const active = i === activeIdx;
                return (
                  <li key={d.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => goToDoctor(d)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-start transition ${active ? "bg-[color:var(--jazan-teal)]/10" : "hover:bg-[color:var(--jazan-teal)]/5"}`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--jazan-teal)]/15 text-[color:var(--jazan-teal)]">
                        {d.photo_url ? (
                          <img
                            src={d.photo_url}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <User2 className="h-5 w-5" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[color:var(--fut-ink)]">
                          {title ? `${title} ` : ""}
                          {name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[color:var(--fut-ink-muted)]">
                          {spec && (
                            <span className="inline-flex items-center gap-1">
                              <Stethoscope className="h-3 w-3" aria-hidden="true" />
                              {spec}
                            </span>
                          )}
                          {br && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {br}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-[color:var(--neon-teal)]">
                        {t("book")}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={goSearchAll}
                  className="block w-full px-3 py-2 text-center text-xs font-semibold text-[color:var(--jazan-teal)] hover:underline"
                >
                  {t("seeAll")}
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      {debounced.length > 0 && debounced.length < 2 && (
        <p className="mt-2 text-xs text-[color:var(--fut-ink-muted)]">{t("typeAtLeastTwo")}</p>
      )}
    </div>
  );
}
