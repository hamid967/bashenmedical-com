import { Link } from "@tanstack/react-router";
import { Stethoscope, CalendarPlus, ArrowLeft, Sparkles, type LucideIcon } from "lucide-react";
import type { BranchSpecialty, ExcellenceCenter } from "@/lib/branches.functions";

type Props = {
  branchId: string;
  specialties: BranchSpecialty[];
  centers: ExcellenceCenter[];
  onBookSpecialty?: (specialtyId: string) => void;
};

const FALLBACK_ICONS: LucideIcon[] = [Stethoscope, Sparkles];

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="mb-8 max-w-2xl">
      <p className="text-xs font-bold tracking-wide text-[color:var(--brand-gold)]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold text-[color:var(--brand-deep)] md:text-3xl">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground md:text-base">{subtitle}</p>
    </header>
  );
}

export function BranchServicesGrid({ branchId, specialties, centers, onBookSpecialty }: Props) {
  const empty = specialties.length === 0 && centers.length === 0;

  return (
    <section id="services" className="scroll-mt-24">
      <SectionHeading
        eyebrow="خدمات الفرع"
        title="التخصصات والخدمات الطبية"
        subtitle="اختر التخصص المناسب واحجز مباشرة في هذا الفرع — بنفس وضوح صفحات المستشفيات الرائدة."
      />

      {empty ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
          لم تُضف خدمات لهذا الفرع بعد. يمكنك الحجز العام من زر «احجز».
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {centers.map((c) => (
            <article
              key={`c-${c.id}`}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-[color:var(--brand-gold-soft)] bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_color-mix(in_oklab,var(--brand-deep)_40%,transparent)]"
            >
              <div
                className="absolute inset-x-0 top-0 h-1 bg-[color:var(--brand-gold)]"
                aria-hidden
              />
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--brand-mist)] text-[color:var(--brand-deep)] ring-1 ring-[color:var(--brand-gold-soft)]">
                  <Sparkles className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-[color:var(--brand-sand)] px-2.5 py-1 text-[10px] font-bold text-[color:var(--brand-deep)]">
                  مركز تميز
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-[color:var(--brand-deep)]">{c.name_ar}</h3>
              <p className="mt-2 flex-1 text-sm leading-7 text-muted-foreground">
                {c.short_ar || c.description_ar || "رعاية متخصصة بمعايير عالية."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {c.specialty_id && onBookSpecialty && (
                  <button
                    type="button"
                    onClick={() => onBookSpecialty(c.specialty_id!)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:opacity-95"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    احجز الآن
                  </button>
                )}
                {c.slug && (
                  <Link
                    to="/excellence/$slug"
                    params={{ slug: c.slug }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold hover:border-primary/40 hover:text-primary"
                  >
                    التفاصيل
                    <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                )}
              </div>
            </article>
          ))}

          {specialties.map((s, idx) => {
            const Icon = FALLBACK_ICONS[idx % FALLBACK_ICONS.length];
            return (
              <article
                key={`s-${s.id}`}
                className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_16px_40px_-24px_color-mix(in_oklab,var(--brand-deep)_35%,transparent)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    {s.icon ? (
                      <span className="text-lg leading-none" aria-hidden>
                        {s.icon}
                      </span>
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-[color:var(--brand-deep)]">
                  {s.name_ar}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-7 text-muted-foreground">
                  {s.description_ar?.trim() || `احجز موعدًا مع استشاريي ${s.name_ar} في هذا الفرع.`}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {onBookSpecialty && (
                    <button
                      type="button"
                      onClick={() => onBookSpecialty(s.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:opacity-95"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      احجز الآن
                    </button>
                  )}
                  <Link
                    to="/book"
                    search={{ branch: branchId, specialty: s.id, step: 4 }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold hover:border-primary/40 hover:text-primary"
                  >
                    حجز سريع
                  </Link>
                  {s.slug && (
                    <Link
                      to="/specialties/$slug"
                      params={{ slug: s.slug }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-2 text-xs font-semibold text-muted-foreground hover:text-primary"
                    >
                      عن التخصص
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
