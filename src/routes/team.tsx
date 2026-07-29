/**
 * صفحة فريق العمل — Public team page
 * Shows medical staff (from list_public_doctors) alongside the
 * organizational leadership/administration structure. Photos are optional;
 * initials placeholder when a doctor has no photo.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Users, Stethoscope, Briefcase, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { DoctorRow } from "@/components/doctors/types";
import { bmcOgImageMeta } from "@/lib/og-meta";
import { buildBreadcrumbs } from "@/lib/localBusinessSchema";

const SITE_URL = "https://bashenmedical.com";
const PAGE_URL = `${SITE_URL}/team`;
const PAGE_TITLE = "فريق العمل | مجمع باعشن الطبي";
const PAGE_DESC =
  "تعرّف على فريق العمل في مجمع باعشن الطبي — الأطباء الاستشاريون والإدارة التنفيذية الذين يقودون منظومة الرعاية في صبيا، جازان.";

async function fetchDoctors(): Promise<DoctorRow[]> {
  const { data, error } = await supabase.rpc("list_public_doctors", {
    _limit: 200,
    _offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as unknown as DoctorRow[];
}

export const Route = createFileRoute("/team")({
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["public-doctors"],
      queryFn: fetchDoctors,
    }),
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:locale", content: "ar_SA" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESC },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildBreadcrumbs([
            { name: "الرئيسية", path: "/" },
            { name: "فريق العمل", path: "/team" },
          ]),
        ),
      },
    ],
  }),
  component: TeamPage,
});

type LeaderRole = {
  ar: string;
  en: string;
  desc_ar: string;
  desc_en: string;
};

const LEADERSHIP: LeaderRole[] = [
  {
    ar: "المدير التنفيذي",
    en: "Chief Executive",
    desc_ar: "القيادة العامة والاستراتيجية التشغيلية للمجمع.",
    desc_en: "Overall leadership and operational strategy.",
  },
  {
    ar: "المدير الطبي",
    en: "Chief Medical Officer",
    desc_ar: "الإشراف على جودة الخدمات الطبية وسلامة المرضى.",
    desc_en: "Oversees medical quality and patient safety.",
  },
  {
    ar: "مدير العمليات",
    en: "Chief Operations Officer",
    desc_ar: "إدارة الفروع والعمليات اليومية والمشتريات.",
    desc_en: "Branch operations, day-to-day execution, procurement.",
  },
  {
    ar: "مدير تقنية المعلومات",
    en: "Chief Technology Officer",
    desc_ar: "المنصات الرقمية، البنية التحتية، وأمن المعلومات.",
    desc_en: "Digital platforms, infrastructure, and security.",
  },
  {
    ar: "مدير الجودة والاعتماد",
    en: "Head of Quality & Accreditation",
    desc_ar: "معايير الجودة، الاعتمادات، والتحسين المستمر.",
    desc_en: "Quality standards, accreditations, continuous improvement.",
  },
  {
    ar: "مدير خدمة العملاء",
    en: "Head of Patient Experience",
    desc_ar: "تجربة المريض والاستجابة لملاحظات الزوار.",
    desc_en: "Patient journey and feedback response.",
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.slice(0, 2).map((p) => p[0] ?? "");
  return chars.join("").toUpperCase() || "؟";
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  const [errored, setErrored] = useState(false);
  const showImg = src && !errored;
  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-primary/10 ring-2 ring-primary/20">
      {showImg ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-lg font-bold text-primary"
          aria-hidden
        >
          {initials(name)}
        </div>
      )}
    </div>
  );
}

function TeamPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [q, setQ] = useState("");

  const { data: doctors = [], isLoading } = useQuery({
    queryKey: ["public-doctors"],
    queryFn: fetchDoctors,
    staleTime: 60_000,
  });

  const filteredDoctors = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return doctors;
    return doctors.filter((d) => {
      const hay = [
        d.name_ar,
        d.name_en,
        d.specialty_name_ar,
        d.specialty_name_en,
        d.title_ar,
        d.title_en,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [doctors, q]);

  return (
    <div className="min-h-dvh bg-muted/30">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <div className="container-app relative py-16 md:py-20">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Users className="h-3.5 w-3.5" />
              {ar ? "فريق العمل" : "Our Team"}
            </div>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl">
              {ar ? "فريق باعشن الطبي" : "The Baeshen Medical Team"}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              {ar
                ? "أطباء استشاريون، أخصائيون، وقيادة إدارية يعملون معًا لتقديم رعاية آمنة وشخصية في كل زيارة."
                : "Consultants, specialists, and an administrative leadership working together to deliver safe, personal care at every visit."}
            </p>
          </div>
        </div>
      </section>

      <div className="container-app space-y-14 py-12">
        {/* Medical team */}
        <section aria-labelledby="team-medical">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <h2 id="team-medical" className="text-2xl font-bold">
                  {ar ? "الفريق الطبي" : "Medical Team"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {ar
                    ? `${doctors.length} طبيب واستشاري في مختلف التخصصات`
                    : `${doctors.length} doctors and consultants across specialties`}
                </p>
              </div>
            </div>

            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground start-3" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={ar ? "ابحث بالاسم أو التخصص" : "Search by name or specialty"}
                className="w-64 rounded-full border border-border bg-card py-2 ps-9 pe-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label={ar ? "بحث في الفريق الطبي" : "Search medical team"}
              />
            </label>
          </div>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-2xl border border-border bg-card"
                />
              ))}
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              {ar ? "لا توجد نتائج مطابقة." : "No matching results."}
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDoctors.map((d) => {
                const name = ar ? d.name_ar : d.name_en || d.name_ar;
                const title = ar ? d.title_ar : d.title_en;
                const specialty = ar ? d.specialty_name_ar : d.specialty_name_en;
                const inner = (
                  <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-md">
                    <Avatar src={d.photo_url} name={name} />
                    <div className="min-w-0 flex-1">
                      {title && (
                        <div className="text-xs text-muted-foreground">{title}</div>
                      )}
                      <div className="truncate font-semibold text-foreground">{name}</div>
                      {specialty && (
                        <div className="mt-1 text-sm text-primary">{specialty}</div>
                      )}
                      {d.years_experience ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {ar
                            ? `${d.years_experience}+ سنة خبرة`
                            : `${d.years_experience}+ years of experience`}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
                return (
                  <li key={d.id}>
                    {d.slug ? (
                      <Link
                        to="/doctors/$slug"
                        params={{ slug: d.slug }}
                        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
                      >
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Administration */}
        <section aria-labelledby="team-admin">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h2 id="team-admin" className="text-2xl font-bold">
                {ar ? "الإدارة التنفيذية" : "Executive Leadership"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {ar
                  ? "الأدوار القيادية المسؤولة عن جودة الخدمات والعمليات اليومية."
                  : "Leadership roles responsible for service quality and daily operations."}
              </p>
            </div>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LEADERSHIP.map((r) => {
              const name = ar ? r.ar : r.en;
              const desc = ar ? r.desc_ar : r.desc_en;
              return (
                <li
                  key={r.en}
                  className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4"
                >
                  <Avatar src={null} name={name} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground">{name}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 text-xs text-muted-foreground">
            {ar
              ? "الأسماء الشخصية للإدارة تُعرض داخل بوابة الموظفين ولا تُنشر علنًا حفاظًا على الخصوصية."
              : "Individual leadership names are shown inside the staff portal and not published for privacy."}
          </p>
        </section>
      </div>
    </div>
  );
}
