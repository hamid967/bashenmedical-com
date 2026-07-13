/**
 * صفحة تصفح الحجوزات — /reservations
 *
 * تجربة مستوحاة من بوابة الخدمات الإلكترونية لمستشفى الأطباء المتحدين:
 * تبويبان (اختر العيادة / ابحث بالطبيب) + شبكة بطاقات + زر «احجز الآن»
 * يفتح معالج الحجز الحالي `/book` مع تمرير الطبيب أو التخصص مسبقًا.
 *
 * لا backend جديد — يستخدم نفس RPCs العامة: list_public_doctors + جدول specialties.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Stethoscope, User, MapPin, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reservations")({
  head: () => ({
    meta: [
      { title: "احجز موعدك | مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "تصفّح الأطباء والعيادات في مجمع باعشن الطبي واحجز موعدك مباشرةً — بحث بالاسم أو بالتخصص وحجز بضغطة زر.",
      },
      { property: "og:title", content: "احجز موعدك — مجمع باعشن الطبي" },
      {
        property: "og:description",
        content: "تصفّح العيادات والأطباء واحجز موعدك مباشرةً بضغطة زر.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ReservationsPage,
});

type Tab = "specialty" | "doctor";

type DoctorRow = {
  id: string;
  slug: string;
  name_ar: string;
  title_ar: string | null;
  photo_url: string | null;
  specialty_id: string;
  specialty_name_ar: string | null;
  branch_id: string | null;
  branch_name_ar: string | null;
  booking_enabled: boolean;
};

type SpecialtyRow = {
  id: string;
  slug: string;
  name_ar: string;
  icon: string | null;
};

async function fetchDoctors(): Promise<DoctorRow[]> {
  const { data, error } = await supabase.rpc("list_public_doctors", {
    _limit: 300,
    _offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as unknown as DoctorRow[];
}

async function fetchSpecialties(): Promise<SpecialtyRow[]> {
  const { data, error } = await supabase
    .from("specialties")
    .select("id,slug,name_ar,icon")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as SpecialtyRow[];
}

function initials(name: string): string {
  const parts = name.replace(/^د\.?\s*/, "").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? "").join("");
}

function ReservationsPage() {
  const [tab, setTab] = useState<Tab>("specialty");
  const [q, setQ] = useState("");
  const [activeSpecialty, setActiveSpecialty] = useState<string | null>(null);

  const { data: doctors = [], isLoading: docsLoading } = useQuery({
    queryKey: ["reservations", "doctors"],
    queryFn: fetchDoctors,
    staleTime: 5 * 60_000,
  });
  const { data: specialties = [], isLoading: specsLoading } = useQuery({
    queryKey: ["reservations", "specialties"],
    queryFn: fetchSpecialties,
    staleTime: 5 * 60_000,
  });

  const filteredDoctors = useMemo(() => {
    let list = doctors.filter((d) => d.booking_enabled);
    if (activeSpecialty) list = list.filter((d) => d.specialty_id === activeSpecialty);
    if (q.trim()) {
      const needle = q.trim();
      list = list.filter(
        (d) =>
          d.name_ar?.includes(needle) ||
          d.specialty_name_ar?.includes(needle) ||
          d.branch_name_ar?.includes(needle),
      );
    }
    return list;
  }, [doctors, activeSpecialty, q]);

  const filteredSpecialties = useMemo(() => {
    if (!q.trim()) return specialties;
    return specialties.filter((s) => s.name_ar.includes(q.trim()));
  }, [specialties, q]);

  const activeSpecialtyRow = activeSpecialty
    ? specialties.find((s) => s.id === activeSpecialty) ?? null
    : null;

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30">
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/10 via-primary/5 to-transparent border-b">
        <div className="container-modern mx-auto max-w-6xl px-4 py-10 md:py-14">
          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-3">
              بوابة الخدمات الإلكترونية
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3">
              احجز موعدك ودعنا نخدمك
            </h1>
            <p className="text-muted-foreground">
              اختر العيادة أو ابحث باسم الطبيب واحجز موعدك بضغطة زر.
            </p>
          </div>

          {/* Tabs */}
          <div className="mt-8 flex justify-center">
            <div className="inline-flex rounded-xl border bg-card p-1 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setTab("specialty");
                  setActiveSpecialty(null);
                  setQ("");
                }}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                  tab === "specialty"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Stethoscope className="inline h-4 w-4 ml-1.5 -mt-0.5" />
                اختر العيادة
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("doctor");
                  setActiveSpecialty(null);
                  setQ("");
                }}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                  tab === "doctor"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <User className="inline h-4 w-4 ml-1.5 -mt-0.5" />
                البحث باسم الطبيب
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="mt-6 max-w-xl mx-auto">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  tab === "specialty"
                    ? "ابحث باسم العيادة…"
                    : "ابحث باسم الطبيب…"
                }
                className="pr-10 h-12 text-base bg-card"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="container-modern mx-auto max-w-6xl px-4 py-10">
        {tab === "specialty" && !activeSpecialty && (
          <SpecialtyGrid
            specialties={filteredSpecialties}
            loading={specsLoading}
            onPick={(id) => setActiveSpecialty(id)}
            doctorCount={(id) =>
              doctors.filter((d) => d.specialty_id === id && d.booking_enabled).length
            }
          />
        )}

        {(tab === "doctor" || activeSpecialty) && (
          <>
            {activeSpecialtyRow && (
              <div className="mb-6 flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveSpecialty(null)}
                  className="gap-1.5"
                >
                  <ArrowRight className="h-4 w-4" />
                  عودة للعيادات
                </Button>
                <div className="text-sm text-muted-foreground">
                  عيادة:{" "}
                  <span className="font-semibold text-foreground">
                    {activeSpecialtyRow.name_ar}
                  </span>
                </div>
              </div>
            )}
            <DoctorGrid doctors={filteredDoctors} loading={docsLoading} />
          </>
        )}
      </section>

      {/* Home care banner */}
      <section className="container-modern mx-auto max-w-6xl px-4 pb-14">
        <div className="rounded-2xl bg-gradient-to-l from-primary/15 to-primary/5 border p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1 text-center md:text-right">
            <div className="text-xs font-semibold text-primary mb-1">
              رعايتك أولويتنا
            </div>
            <h3 className="text-xl md:text-2xl font-bold mb-2">
              رعاية طبية إلى باب منزلك
            </h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              احصل على زيارة طبيب أو ممرّض إلى منزلك بسهولة وموثوقية مع
              خدمات الرعاية الطبية المنزلية من مجمع باعشن.
            </p>
          </div>
          <Link
            to="/home-care"
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 transition"
          >
            اطلب الآن
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ---------------- Specialty grid ---------------- */

function SpecialtyGrid({
  specialties,
  loading,
  onPick,
  doctorCount,
}: {
  specialties: SpecialtyRow[];
  loading: boolean;
  onPick: (id: string) => void;
  doctorCount: (id: string) => number;
}) {
  if (loading) return <GridSkeleton />;
  if (specialties.length === 0)
    return <EmptyState text="لا توجد عيادات مطابقة لبحثك." />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {specialties.map((s) => {
        const count = doctorCount(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="group text-right rounded-2xl border-2 border-border bg-card p-5 hover:border-primary hover:shadow-md transition"
          >
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition">
              <Stethoscope className="h-6 w-6" />
            </div>
            <div className="font-bold text-base mb-1">{s.name_ar}</div>
            <div className="text-xs text-muted-foreground">
              {count > 0 ? `${count} طبيب متاح` : "قريبًا"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Doctor grid ---------------- */

function DoctorGrid({
  doctors,
  loading,
}: {
  doctors: DoctorRow[];
  loading: boolean;
}) {
  if (loading) return <GridSkeleton />;
  if (doctors.length === 0)
    return <EmptyState text="لا يوجد أطباء مطابقون لبحثك." />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {doctors.map((d) => (
        <article
          key={d.id}
          className="rounded-2xl border bg-card p-5 hover:shadow-md hover:border-primary/50 transition flex flex-col"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 text-primary grid place-items-center font-bold text-lg shrink-0 overflow-hidden">
              {d.photo_url ? (
                <img
                  src={d.photo_url}
                  alt={d.name_ar}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                initials(d.name_ar)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-base leading-tight mb-0.5 truncate">
                {d.name_ar}
              </div>
              {d.title_ar && (
                <div className="text-xs text-muted-foreground truncate">
                  {d.title_ar}
                </div>
              )}
              {d.specialty_name_ar && (
                <div className="text-xs font-semibold text-primary mt-1 truncate">
                  {d.specialty_name_ar}
                </div>
              )}
            </div>
          </div>

          {d.branch_name_ar && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
              <MapPin className="h-3.5 w-3.5" />
              {d.branch_name_ar}
            </div>
          )}

          <Link
            to="/book"
            search={{ doctor: d.id, step: 5 }}
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 transition"
          >
            احجز الآن
          </Link>
        </article>
      ))}
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border bg-card p-5 h-40 animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <Search className="mx-auto h-8 w-8 mb-3 opacity-50" />
      <div className="text-sm">{text}</div>
    </div>
  );
}
