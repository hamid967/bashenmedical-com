import { Clock, MapPin, Phone, Siren } from "lucide-react";
import type { PublicBranch } from "@/lib/branches.functions";

const DAY_LABELS: Record<string, string> = {
  sat: "السبت",
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
  fri: "الجمعة",
};

function formatHours(hours: PublicBranch["working_hours"]) {
  if (!hours || typeof hours !== "object") return [];
  return Object.entries(hours).map(([k, v]) => ({
    day: DAY_LABELS[k.toLowerCase()] ?? k,
    time: String(v),
  }));
}

function mapEmbed(b: PublicBranch): string | null {
  if (b.map_embed_url) return b.map_embed_url;
  if (b.lat != null && b.lng != null) {
    return `https://www.google.com/maps?q=${b.lat},${b.lng}&hl=ar&z=15&output=embed`;
  }
  return null;
}

type Props = {
  branch: PublicBranch;
  directionsUrl: string | null;
};

export function BranchVisitInfo({ branch, directionsUrl }: Props) {
  const hours = formatHours(branch.working_hours);
  const embed = mapEmbed(branch);

  return (
    <section id="visit" className="scroll-mt-24">
      <header className="mb-8 max-w-2xl">
        <p className="text-xs font-bold tracking-wide text-[color:var(--brand-gold)]">زورنا</p>
        <h2 className="mt-2 text-2xl font-bold text-[color:var(--brand-deep)] md:text-3xl">
          الموقع وساعات العمل
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground md:text-base">
          العنوان، أرقام التواصل، والخريطة — كل ما تحتاجه قبل الزيارة.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          {branch.address_ar && (
            <div className="flex items-start gap-3 text-sm">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-[color:var(--brand-deep)]">العنوان</p>
                <p className="mt-1 leading-7 text-muted-foreground">{branch.address_ar}</p>
                {directionsUrl && (
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-sm font-semibold text-primary hover:underline"
                  >
                    افتح الاتجاهات على خرائط جوجل
                  </a>
                )}
              </div>
            </div>
          )}

          {branch.phone && (
            <div className="flex items-start gap-3 text-sm">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-[color:var(--brand-deep)]">هاتف الفرع</p>
                <a
                  href={`tel:${branch.phone}`}
                  className="mt-1 inline-block hover:text-primary"
                  dir="ltr"
                >
                  {branch.phone}
                </a>
              </div>
            </div>
          )}

          {branch.emergency_phone && (
            <div className="flex items-start gap-3 text-sm">
              <Siren className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">الطوارئ</p>
                <a
                  href={`tel:${branch.emergency_phone}`}
                  className="mt-1 inline-block font-bold text-destructive"
                  dir="ltr"
                >
                  {branch.emergency_phone}
                </a>
              </div>
            </div>
          )}

          {hours.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[color:var(--brand-deep)]">
                <Clock className="h-4 w-4 text-primary" />
                ساعات العمل
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {hours.map((h) => (
                  <div
                    key={h.day}
                    className="flex justify-between gap-2 border-b border-border/60 pb-1.5"
                  >
                    <dt className="text-muted-foreground">{h.day}</dt>
                    <dd dir="ltr" className="font-medium">
                      {h.time}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        <div className="min-h-[280px] overflow-hidden rounded-2xl border border-border bg-muted lg:min-h-[360px]">
          {embed ? (
            <iframe
              title={`خريطة ${branch.name_ar}`}
              src={embed}
              className="h-full min-h-[280px] w-full border-0 lg:min-h-[360px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="grid h-full min-h-[280px] place-items-center text-sm text-muted-foreground">
              الخريطة غير متاحة لهذا الفرع
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
