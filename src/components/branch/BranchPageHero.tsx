import { CalendarPlus, Phone, MapPin, MessageCircle } from "lucide-react";
import type { PublicBranch } from "@/lib/branches.functions";
import { SITE, whatsappUrl } from "@/lib/site";

type Props = {
  branch: PublicBranch;
  specialtyCount: number;
  doctorCount: number;
  directionsUrl: string | null;
};

/**
 * Full-bleed branch hero inspired by major KSA hospital branch pages:
 * brand-forward name, one supporting line, and a single CTA group over
 * an edge-to-edge visual plane (photo or brand gradient).
 */
export function BranchPageHero({ branch, specialtyCount, doctorCount, directionsUrl }: Props) {
  const phone = branch.phone || SITE.phone;
  const wa = whatsappUrl(`مرحباً، أرغب بالاستفسار عن خدمات ${branch.name_ar}`);

  return (
    <section className="relative isolate min-h-[min(78vh,640px)] overflow-hidden text-white">
      {/* Full-bleed visual plane */}
      <div className="absolute inset-0 -z-20">
        {branch.hero_image_url ? (
          <img
            src={branch.hero_image_url}
            alt=""
            className="h-full w-full object-cover scale-105 animate-[branch-hero-pan_18s_ease-in-out_infinite_alternate]"
            aria-hidden
          />
        ) : (
          <div className="h-full w-full hero-gradient-deep" aria-hidden />
        )}
      </div>
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(105deg, color-mix(in oklab, var(--brand-deep) 92%, transparent) 0%, color-mix(in oklab, var(--brand-deep) 72%, transparent) 48%, color-mix(in oklab, var(--brand) 35%, transparent) 100%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 -z-10 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden
      />

      <div className="container-app relative flex min-h-[min(78vh,640px)] flex-col justify-end pb-10 pt-24 md:pb-14 md:pt-28">
        <p className="mb-3 text-sm font-semibold tracking-wide text-[color:var(--brand-gold-soft)] animate-[branch-fade-up_0.7s_ease_both]">
          {SITE.nameAr}
          {branch.city_ar ? ` · ${branch.city_ar}` : ""}
        </p>
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.15] md:text-6xl animate-[branch-fade-up_0.8s_ease_both]">
          {branch.name_ar}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-white/90 md:text-lg animate-[branch-fade-up_0.95s_ease_both]">
          {branch.description_ar?.trim() ||
            "خدمات طبية متكاملة وحجز إلكتروني مباشر في فرعك الأقرب."}
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3 animate-[branch-fade-up_1.05s_ease_both]">
          <a
            href="#book"
            className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--brand-gold)] px-5 py-3 text-sm font-bold text-[color:var(--brand-deep)] shadow-lg transition hover:brightness-105"
          >
            <CalendarPlus className="h-4 w-4" />
            احجز موعدك الآن
          </a>
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/20"
            dir="ltr"
          >
            <Phone className="h-4 w-4" />
            {branch.phone || SITE.phoneDisplay}
          </a>
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/20"
          >
            <MessageCircle className="h-4 w-4" />
            واتساب
          </a>
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/20"
            >
              <MapPin className="h-4 w-4" />
              الاتجاهات
            </a>
          )}
        </div>

        {(specialtyCount > 0 || doctorCount > 0) && (
          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-sm text-white/85 animate-[branch-fade-up_1.15s_ease_both]">
            {specialtyCount > 0 && (
              <div>
                <dt className="inline text-white/60">التخصصات </dt>
                <dd className="inline font-bold">{specialtyCount}+</dd>
              </div>
            )}
            {doctorCount > 0 && (
              <div>
                <dt className="inline text-white/60">الأطباء </dt>
                <dd className="inline font-bold">{doctorCount}+</dd>
              </div>
            )}
            {branch.address_ar && (
              <div className="flex items-start gap-1.5 max-w-md">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--brand-gold-soft)]" />
                <dd>{branch.address_ar}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      <style>{`
        @keyframes branch-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes branch-hero-pan {
          from { transform: scale(1.05) translate3d(0, 0, 0); }
          to { transform: scale(1.12) translate3d(-1.5%, -1%, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[branch-hero-pan_18s_ease-in-out_infinite_alternate\\],
          [class*="branch-fade-up"],
          [class*="branch-hero-pan"] {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
