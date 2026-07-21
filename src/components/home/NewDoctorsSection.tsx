import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { User2, Sparkles, ArrowLeft, MapPin, Stethoscope } from "lucide-react";

type NewDoctor = {
  id: string;
  slug: string | null;
  name_ar: string;
  name_en: string;
  title_ar: string | null;
  title_en: string | null;
  photo_url: string | null;
  created_at: string;
  branch_id: string | null;
  branches: { name_ar: string; name_en: string } | null;
  specialties: { name_ar: string; name_en: string; slug: string } | null;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function NewDoctorsSection() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["home_new_doctors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select(
          "id,slug,name_ar,name_en,title_ar,title_en,photo_url,created_at,branch_id,branches(name_ar,name_en),specialties(name_ar,name_en,slug)",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as unknown as NewDoctor[];
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const list = (data ?? []).slice(0, 8);
  if (!isPending && !error && list.length === 0) return null;

  return (
    <section
      className="relative py-16 md:py-20"
      aria-labelledby="new-doctors-heading"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="container-app">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--jazan-gold)]/50 bg-[var(--jazan-ivory)]/80 px-3 py-1 text-[11px] tracking-[0.3em] uppercase text-[var(--jazan-teal)]">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {isAr ? "انضم حديثًا" : "Newly joined"}
            </div>
            <h2
              id="new-doctors-heading"
              className="mt-3 text-2xl md:text-3xl font-bold text-[color:var(--fut-ink)]"
            >
              {isAr ? "أطباء انضموا حديثًا إلى المجمع" : "Doctors who recently joined the complex"}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--fut-ink-muted)]">
              {isAr
                ? "تعرّف على أحدث الاستشاريين واحجز موعدك مباشرة."
                : "Meet our newest consultants and book directly."}
            </p>
          </div>
          <Link
            to="/doctors"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--neon-teal)] hover:opacity-80"
          >
            {isAr ? "كل الأطباء" : "All doctors"}
            <ArrowLeft className={`h-4 w-4 ${isAr ? "" : "rotate-180"}`} />
          </Link>
        </div>

        {error ? (
          <div className="glass-fut p-6 text-center">
            <p className="text-sm text-[color:var(--fut-ink-muted)]">
              {isAr ? "تعذّر تحميل الأطباء الجدد." : "Could not load new doctors."}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-sm font-semibold text-[color:var(--neon-teal)] hover:underline"
            >
              {isAr ? "إعادة المحاولة" : "Retry"}
            </button>
          </div>
        ) : isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="glass-fut h-52 animate-pulse"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((d) => {
              const name = isAr ? d.name_ar : d.name_en;
              const title = isAr ? d.title_ar : d.title_en;
              const spec = d.specialties ? (isAr ? d.specialties.name_ar : d.specialties.name_en) : null;
              const br = d.branches ? (isAr ? d.branches.name_ar : d.branches.name_en) : null;
              const isNew = Date.now() - new Date(d.created_at).getTime() < THIRTY_DAYS_MS;
              const profileHref = d.slug ? `/doctors/${d.slug}` : null;

              return (
                <li key={d.id} className="glass-fut group relative flex flex-col p-5">
                  {isNew && (
                    <span className="absolute top-3 end-3 rounded-full bg-[color:var(--jazan-terracotta)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--jazan-terracotta)]">
                      {isAr ? "جديد" : "New"}
                    </span>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[color:var(--jazan-teal)]/15 text-[color:var(--jazan-teal)] ring-1 ring-[color:var(--jazan-gold)]/30">
                      {d.photo_url ? (
                        <img
                          src={d.photo_url}
                          alt=""
                          className="h-14 w-14 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <User2 className="h-6 w-6" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-[color:var(--fut-ink)]">
                        {title ? `${title} ` : ""}
                        {name}
                      </div>
                      {spec && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-[color:var(--fut-ink-muted)]">
                          <Stethoscope className="h-3 w-3" aria-hidden="true" />
                          <span className="truncate">{spec}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {br && (
                    <div className="mt-3 inline-flex items-center gap-1 text-xs text-[color:var(--fut-ink-muted)]">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      <span className="truncate">{br}</span>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {profileHref ? (
                      <Link
                        to="/doctors/$slug"
                        params={{ slug: d.slug as string }}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-[color:var(--jazan-gold)]/50 bg-[var(--jazan-ivory)]/60 px-3 py-2 text-xs font-semibold text-[color:var(--jazan-teal)] hover:bg-[var(--jazan-ivory)] transition"
                        aria-label={
                          isAr ? `فتح ملف الطبيب ${name}` : `Open profile of ${name}`
                        }
                      >
                        {isAr ? "الملف" : "Profile"}
                      </Link>
                    ) : null}
                    <Link
                      to="/book"
                      search={{
                        doctor: d.id,
                        ...(d.specialties?.slug ? { specialty: d.specialties.slug } : {}),
                        ...(d.branch_id ? { branch: d.branch_id } : {}),
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-[color:var(--jazan-teal)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 transition"
                      aria-label={isAr ? `احجز مع ${name}` : `Book with ${name}`}
                    >
                      {isAr ? "احجز" : "Book"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
