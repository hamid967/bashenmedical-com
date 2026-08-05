import { Link } from "@tanstack/react-router";
import { CalendarPlus, Star, UserRound } from "lucide-react";
import type { BranchDoctor } from "@/lib/branches.functions";

type Props = {
  branchId: string;
  doctors: BranchDoctor[];
};

export function BranchDoctorsStrip({ branchId, doctors }: Props) {
  if (doctors.length === 0) return null;

  return (
    <section id="doctors" className="scroll-mt-24">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-wide text-[color:var(--brand-gold)]">
            الطاقم الطبي
          </p>
          <h2 className="mt-2 text-2xl font-bold text-[color:var(--brand-deep)] md:text-3xl">
            أطباؤنا في هذا الفرع
          </h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground md:text-base">
            تعرّف على الاستشاريين واحجز مع الطبيب المناسب مباشرة.
          </p>
        </div>
        <Link
          to="/doctors"
          search={{
            q: "",
            specialty: "",
            branch: branchId,
            gender: "",
            language: "",
            sort: "rating",
            page: 1,
          }}
          className="text-sm font-semibold text-primary hover:underline"
        >
          كل الأطباء ←
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doctors.slice(0, 9).map((d) => {
          const initials = d.name_ar.replace(/[^\u0600-\u06FFa-zA-Z]/g, "").slice(0, 2) || "د";
          return (
            <article
              key={d.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-5 transition hover:border-primary/35 hover:shadow-[0_14px_36px_-22px_color-mix(in_oklab,var(--brand-deep)_40%,transparent)]"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[color:var(--brand-mist)] text-[color:var(--brand-deep)] ring-1 ring-[color:var(--brand-gold-soft)]">
                  {d.photo_url ? (
                    <img
                      src={d.photo_url}
                      alt={d.name_ar}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-sm font-bold" aria-hidden>
                      {initials}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-[color:var(--brand-deep)]">
                    {d.slug ? (
                      <Link
                        to="/doctors/$slug"
                        params={{ slug: d.slug }}
                        className="hover:text-primary"
                      >
                        {d.name_ar}
                      </Link>
                    ) : (
                      d.name_ar
                    )}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.title_ar || d.specialty_name_ar || "استشاري"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {d.specialty_name_ar && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                    <UserRound className="h-3 w-3" />
                    {d.specialty_name_ar}
                  </span>
                )}
                {d.years_experience != null && d.years_experience > 0 && (
                  <span>+{d.years_experience} سنة خبرة</span>
                )}
                {d.avg_rating != null && d.avg_rating > 0 && (
                  <span className="inline-flex items-center gap-1 text-[color:var(--brand-gold)]">
                    <Star className="h-3 w-3 fill-current" />
                    {d.avg_rating.toFixed(1)}
                  </span>
                )}
              </div>

              <div className="mt-5 flex gap-2">
                <Link
                  to="/book"
                  search={{
                    branch: branchId,
                    doctor: d.id,
                    specialty: d.specialty_id ?? undefined,
                    step: 5,
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-95"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  احجز موعد
                </Link>
                {d.slug && (
                  <Link
                    to="/doctors/$slug"
                    params={{ slug: d.slug }}
                    className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2.5 text-xs font-semibold hover:border-primary/40"
                  >
                    الملف
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
