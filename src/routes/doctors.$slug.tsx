import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import {
  buildLocalBusinessSchema,
  buildBreadcrumbs,
  CLINIC_ID,
  SITE_URL,
} from "@/lib/localBusinessSchema";
import { clinicSettingsQuery, type ClinicSettings } from "@/lib/clinicSettings";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Languages,
  GraduationCap,
  Briefcase,
  Award,
  Calendar,
  Clock,
  User,
  ClipboardCheck,
  XCircle,
  Info,
  Star,
  MessageSquare,
  Loader2,
  Building2,
  FileText,
  Stethoscope,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { submitBooking } from "@/lib/booking-submit";

type Doctor = {
  id: string;
  slug: string | null;
  name_ar: string;
  name_en: string | null;
  title_ar: string | null;
  title_en: string | null;
  bio_ar: string | null;
  bio_en: string | null;
  photo_url: string | null;
  photos: string[] | null;
  languages: string[] | null;
  gender: string | null;
  years_experience: number | null;
  education_ar: string | null;
  education_en: string | null;
  experience_ar: string | null;
  experience_en: string | null;
  booking_enabled: boolean | null;
  branch_id: string | null;
  specialties: {
    id: string;
    slug: string;
    name_ar: string;
    name_en: string | null;
  } | null;
  branches: {
    id: string;
    name_ar: string;
    name_en: string | null;
  } | null;
};

const doctorQuery = (slug: string) => ({
  queryKey: ["doctor", slug],
  queryFn: async (): Promise<Doctor> => {
    const { data, error } = await supabase
      .from("doctors")
      .select(
        "id, slug, name_ar, name_en, title_ar, title_en, bio_ar, bio_en, photo_url, photos, languages, gender, years_experience, education_ar, education_en, experience_ar, experience_en, booking_enabled, branch_id, specialties(id, slug, name_ar, name_en), branches!doctors_branch_id_fkey(id, name_ar, name_en)",
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return data as unknown as Doctor;
  },
});

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function riyadhTodayIso(): string {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function formatDateLabel(iso: string, lang: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const locale = lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US";
  return dt.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

type AvailabilityResp = { ok: boolean; times: string[]; booked: string[] };

const availabilityQuery = (doctorId: string, date: string) => ({
  queryKey: ["doctor-availability", doctorId, date],
  queryFn: async (): Promise<AvailabilityResp> => {
    const res = await fetch(`/api/public/book/availability?doctor_id=${doctorId}&date=${date}`);
    if (!res.ok) return { ok: false, times: [], booked: [] };
    return (await res.json()) as AvailabilityResp;
  },
  staleTime: 30_000,
});

export const Route = createFileRoute("/doctors/$slug")({
  loader: async ({ params, context }) => {
    const [doctor, settings] = await Promise.all([
      context.queryClient.ensureQueryData(doctorQuery(params.slug)),
      context.queryClient.ensureQueryData(clinicSettingsQuery()),
    ]);
    return { doctor, settings };
  },
  head: ({ params, loaderData }) => {
    const ld = loaderData as { doctor: Doctor; settings: ClinicSettings } | undefined;
    if (!ld?.doctor) {
      return { meta: [{ title: "غير متوفر" }, { name: "robots", content: "noindex" }] };
    }
    const d = ld.doctor;
    const settings = ld.settings;
    const url = `${SITE_URL}/doctors/${params.slug}`;
    const specName = d.specialties?.name_ar ?? "";
    const title = `${d.name_ar}${specName ? ` — ${specName}` : ""} | مجمع باعشن الطبي`;
    const desc = (
      d.bio_ar ||
      `${d.name_ar} ${d.title_ar ?? ""} في ${specName} بمجمع باعشن الطبي بصبيا، جازان. احجز موعداً الآن.`
    ).slice(0, 155);

    const physician = {
      "@context": "https://schema.org",
      "@type": "Physician",
      "@id": url,
      name: d.name_ar,
      alternateName: d.name_en ?? undefined,
      jobTitle: d.title_ar ?? undefined,
      image: d.photo_url ?? undefined,
      description: d.bio_ar ?? undefined,
      url,
      knowsLanguage: d.languages ?? undefined,
      gender: d.gender ?? undefined,
      medicalSpecialty: d.specialties?.name_en ?? d.specialties?.name_ar ?? undefined,
      hospitalAffiliation: { "@id": CLINIC_ID },
      worksFor: { "@id": CLINIC_ID },
      address: {
        "@type": "PostalAddress",
        streetAddress: settings.street_address,
        addressLocality: settings.address_locality,
        addressRegion: settings.address_region,
        postalCode: settings.postal_code ?? undefined,
        addressCountry: settings.address_country,
      },
    };

    const clinic = buildLocalBusinessSchema({ pageUrl: url, settings });
    const breadcrumbs = buildBreadcrumbs([
      { name: "الرئيسية", path: "/" },
      { name: "الأطباء", path: "/doctors" },
      { name: d.name_ar, path: `/doctors/${params.slug}` },
    ]);

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: url },
        { property: "og:locale", content: "ar_SA" },
        ...(d.photo_url ? [{ property: "og:image", content: d.photo_url }] : []),
        { name: "twitter:card", content: d.photo_url ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(clinic) },
        { type: "application/ld+json", children: JSON.stringify(physician) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbs) },
      ],
    };
  },
  notFoundComponent: DoctorNotFound,
  errorComponent: DoctorError,
  component: DoctorDetail,
});

function DoctorNotFound() {
  return (
    <div className="container-app py-20 text-center">
      <h1 className="text-3xl font-bold">الطبيب غير موجود</h1>
      <Link to="/doctors" className="mt-4 inline-block text-primary hover:underline">
        عرض جميع الأطباء
      </Link>
    </div>
  );
}

function DoctorError({ reset }: { reset: () => void }) {
  return (
    <div className="container-app py-20 text-center">
      <h1 className="text-3xl font-bold">حدث خطأ</h1>
      <button
        onClick={reset}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

/* ================================================================
   Inline Booking Widget — sidebar mini-wizard
   Steps: 1) date  2) time  3) patient info  4) review  5) success
   ================================================================ */

type InlineStep = 1 | 2 | 3 | 4 | 5;
type InlineGender = "male" | "female";

// Local Saudi phone regex (mirrors /book).
const INLINE_SA_PHONE_RE = /^(?:(?:\+?966)|0)?5\d{8}$/;
const INLINE_SA_NID_RE = /^[12]\d{9}$/;

function InlineBookingWidget({
  doctorId,
  bookingEnabled,
  doctorName,
}: {
  doctorId: string;
  bookingEnabled: boolean;
  doctorName: string;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const today = riyadhTodayIso();
  const dates = Array.from({ length: 14 }, (_, i) => addDaysIso(today, i));

  const [step, setStep] = useState<InlineStep>(1);
  const [selectedDate, setSelectedDate] = useState<string>(dates[0]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [gender, setGender] = useState<InlineGender | null>(null);
  const [reason, setReason] = useState("");
  const [reminder24h, setReminder24h] = useState(true);
  const [reminder2h, setReminder2h] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  // When arrived via `#book` (from doctor cards or hero CTA), scroll the
  // widget into view and briefly highlight it so the user lands directly
  // on the booking step without hunting for it.
  const widgetRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#book") return;
    const el = widgetRef.current;
    if (!el) return;
    // Wait a tick so layout is settled before scrolling.
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlight(true);
      window.setTimeout(() => setHighlight(false), 1600);
    }, 60);
    return () => window.clearTimeout(t);
  }, []);

  const { data: availData, isLoading: availLoading } = useQuery({
    ...availabilityQuery(doctorId, selectedDate),
    enabled: bookingEnabled && step >= 2,
  });
  const times = availData?.times ?? [];

  if (!bookingEnabled) {
    return (
      <div
        id="book"
        ref={widgetRef}
        className={`rounded-2xl border border-border bg-card p-6 scroll-mt-24 transition-shadow ${highlight ? "ring-2 ring-primary ring-offset-2" : ""}`}
      >
        <h3 className="font-bold mb-2 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />{" "}
          {ar ? "الحجز غير متاح" : "Booking unavailable"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {ar
            ? "الحجز الإلكتروني غير متاح لهذا الطبيب حالياً. يرجى الاتصال بنا."
            : "Online booking is not available for this doctor. Please contact us."}
        </p>
        <a
          href={`tel:${SITE.phone}`}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90"
        >
          <Phone className="h-4 w-4" /> {SITE.phoneDisplay}
        </a>
      </div>
    );
  }

  // Success state.
  if (step === 5) {
    return (
      <div
        id="book"
        ref={widgetRef}
        className="rounded-2xl border border-border bg-card p-6 text-center scroll-mt-24"
      >
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <h3 className="font-bold mb-1">{ar ? "تم تأكيد الحجز" : "Booking confirmed"}</h3>
        <p className="text-sm text-muted-foreground">
          {ar ? "سنرسل تفاصيل الحجز عبر رسالة نصية." : "We'll send booking details by SMS."}
        </p>
        {reference && (
          <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
            <div className="text-xs text-muted-foreground">{ar ? "رقم المرجع" : "Reference"}</div>
            <div className="font-mono font-bold">{reference}</div>
          </div>
        )}
        <div className="mt-3 text-sm">
          <div>
            {formatDateLabel(selectedDate, lang)} — {selectedTime}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            to="/track"
            search={{ ref: undefined, phone4: undefined }}
            className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90"
          >
            {ar ? "تتبع الحجز" : "Track booking"}
          </Link>
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setSelectedTime(null);
              setReference(null);
              setErrorMsg(null);
            }}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            {ar ? "حجز موعد آخر" : "Book another"}
          </button>
        </div>
      </div>
    );
  }

  const STEP_LABELS = ar
    ? ["التاريخ", "الوقت", "بياناتك", "التأكيد"]
    : ["Date", "Time", "Your info", "Confirm"];

  function validatePatient(): string | null {
    if (!name.trim() || name.trim().split(/\s+/).length < 2) {
      return ar ? "أدخل الاسم كاملاً (اسمان على الأقل)" : "Enter your full name";
    }
    const clean = phone.replace(/[\s\-()]/g, "");
    if (!INLINE_SA_PHONE_RE.test(clean)) {
      return ar ? "رقم جوال سعودي غير صالح (مثال: 05XXXXXXXX)" : "Invalid Saudi mobile number";
    }
    if (nationalId.trim() && !INLINE_SA_NID_RE.test(nationalId.trim())) {
      return ar ? "رقم هوية غير صالح (10 أرقام يبدأ بـ 1 أو 2)" : "Invalid national ID";
    }
    if (!gender) return ar ? "اختر الجنس" : "Select gender";
    return null;
  }

  async function handleSubmit() {
    setErrorMsg(null);
    const err = validatePatient();
    if (err) {
      setErrorMsg(err);
      setStep(3);
      return;
    }
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    const res = await submitBooking({
      patient_name: name.trim(),
      patient_phone: phone.trim(),
      appointment_date: selectedDate,
      appointment_time: selectedTime,
      reason: reason.trim() || undefined,
      national_id: nationalId.trim() || null,
      gender: gender ?? undefined,
      doctor_id: doctorId,
      reminder_24h: reminder24h,
      reminder_2h: reminder2h,
    });
    setSubmitting(false);
    if (res.ok) {
      setReference(res.reference);
      setStep(5);
    } else {
      setErrorMsg(res.message);
    }
  }

  return (
    <div
      id="book"
      ref={widgetRef}
      className={`rounded-2xl border border-border bg-card p-5 scroll-mt-24 transition-shadow ${highlight ? "ring-2 ring-primary ring-offset-2" : ""}`}
    >
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        {ar ? "احجز الآن" : "Book now"}
      </h3>

      {/* Mini stepper */}
      <ol className="mb-4 flex items-center gap-1.5 text-[11px] font-medium">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as InlineStep;
          const active = n === step;
          const done = n < step;
          return (
            <li key={label} className="flex items-center gap-1 flex-1">
              <button
                type="button"
                disabled={n >= step}
                onClick={() => setStep(n)}
                className={`flex items-center gap-1 rounded-full px-2 py-1 transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-white/20 text-[10px]">
                  {done ? "✓" : n}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Step 1 — Date */}
      {step === 1 && (
        <div>
          <div className="mb-2 text-xs text-muted-foreground">
            {ar ? "اختر اليوم المناسب" : "Pick a day"}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {dates.map((iso) => {
              const active = iso === selectedDate;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDate(iso)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/50"
                  }`}
                >
                  {formatDateLabel(iso, lang)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold hover:opacity-90"
          >
            {ar ? "التالي" : "Next"} <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      )}

      {/* Step 2 — Time */}
      {step === 2 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {ar ? "الأوقات المتاحة" : "Available times"} — {formatDateLabel(selectedDate, lang)}
            </span>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-primary hover:underline"
            >
              {ar ? "تغيير اليوم" : "Change day"}
            </button>
          </div>
          {availLoading ? (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-lg" />
              ))}
            </div>
          ) : times.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground mb-3">
              {ar
                ? "لا توجد مواعيد في هذا اليوم — جرّب يومًا آخر."
                : "No available times — try another day."}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {times.map((t) => {
                const active = t === selectedTime;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setSelectedTime(t);
                      setStep(3);
                    }}
                    className={`rounded-lg border px-2 py-2 text-center text-xs font-medium transition flex items-center justify-center gap-1 ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary hover:bg-primary/5"
                    }`}
                  >
                    <Clock className="h-3 w-3" /> {t}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Patient info */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground mb-1">
            {formatDateLabel(selectedDate, lang)} — {selectedTime}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              {ar ? "الاسم الكامل" : "Full name"} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={ar ? "الاسم الثلاثي" : "Your full name"}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              {ar ? "رقم الجوال" : "Mobile"} *
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="05XXXXXXXX"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              {ar ? "رقم الهوية / الإقامة (اختياري)" : "National ID (optional)"}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="1XXXXXXXXX"
              dir="ltr"
              maxLength={10}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">{ar ? "الجنس" : "Gender"} *</label>
            <div className="grid grid-cols-2 gap-2">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    gender === g
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/50"
                  }`}
                >
                  {ar ? (g === "male" ? "ذكر" : "أنثى") : g === "male" ? "Male" : "Female"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              {ar ? "سبب الزيارة (اختياري)" : "Reason (optional)"}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              maxLength={500}
            />
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              const err = validatePatient();
              if (err) {
                setErrorMsg(err);
                return;
              }
              setErrorMsg(null);
              setStep(4);
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold hover:opacity-90"
          >
            {ar ? "مراجعة الحجز" : "Review booking"}{" "}
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      )}

      {/* Step 4 — Review + confirm */}
      {step === 4 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1.5 text-sm">
            <Row label={ar ? "الطبيب" : "Doctor"} value={doctorName} />
            <Row label={ar ? "التاريخ" : "Date"} value={formatDateLabel(selectedDate, lang)} />
            <Row label={ar ? "الوقت" : "Time"} value={selectedTime ?? "—"} />
            <Row label={ar ? "الاسم" : "Name"} value={name} />
            <Row label={ar ? "الجوال" : "Phone"} value={phone} />
            {reason && <Row label={ar ? "السبب" : "Reason"} value={reason} />}
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={reminder24h}
                onChange={(e) => setReminder24h(e.target.checked)}
                className="rounded"
              />
              {ar ? "تذكيري قبل 24 ساعة" : "Remind me 24h before"}
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={reminder2h}
                onChange={(e) => setReminder2h(e.target.checked)}
                className="rounded"
              />
              {ar ? "تذكيري قبل ساعتين" : "Remind me 2h before"}
            </label>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />{" "}
                {ar ? "جارٍ التأكيد..." : "Confirming..."}
              </>
            ) : (
              <>
                {ar ? "تأكيد الحجز" : "Confirm booking"}{" "}
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </>
            )}
          </button>

          <p className="text-[11px] text-muted-foreground text-center">
            {ar
              ? "بالتأكيد فإنك توافق على تعليمات وسياسة الحجز."
              : "By confirming you agree to the booking policy."}
          </p>
        </div>
      )}

      {/* Escape hatch to full wizard */}
      {step < 4 && (
        <div className="mt-3 text-center">
          <Link
            to="/book"
            search={{ doctor: doctorId } as never}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            {ar ? "فتح النموذج الكامل ↗" : "Open full form ↗"}
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-end">{value}</span>
    </div>
  );
}

function DoctorDetail() {
  const { slug } = Route.useParams();
  const { lang } = useI18n();
  const { data: d } = useSuspenseQuery(doctorQuery(slug));
  const name = lang === "ar" ? d.name_ar : d.name_en || d.name_ar;
  const jobTitle = lang === "ar" ? d.title_ar : d.title_en;
  const bio = lang === "ar" ? d.bio_ar : d.bio_en;
  const specName = d.specialties
    ? lang === "ar"
      ? d.specialties.name_ar
      : d.specialties.name_en || d.specialties.name_ar
    : null;
  const branchName = d.branches
    ? lang === "ar"
      ? d.branches.name_ar
      : d.branches.name_en || d.branches.name_ar
    : null;
  const bookingEnabled = d.booking_enabled !== false;
  const ar = lang === "ar";
  const genderLabel = d.gender === "male" ? "ذكر" : d.gender === "female" ? "أنثى" : null;

  // Merge primary photo + gallery photos, dedupe, keep order.
  const gallery = Array.from(
    new Set([d.photo_url, ...(d.photos ?? [])].filter((u): u is string => !!u)),
  );
  const hasPhoto = gallery.length > 0;

  // Descriptive alt text: doctor + title + specialty.
  const photoAlt = [lang === "ar" ? `صورة ${name}` : `Photo of ${name}`, jobTitle, specName]
    .filter(Boolean)
    .join(" — ");
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("");
  const noPhotoLabel =
    lang === "ar" ? "لا تتوفر صورة لهذا الطبيب" : "No photo available for this doctor";

  return (
    <div>
      <section className="hero-gradient-deep text-white py-14">
        <div className="container-app">
          <nav className="text-xs text-white/80 mb-4">
            <Link to="/" className="hover:underline">
              الرئيسية
            </Link>
            <span className="mx-2">/</span>
            <Link to="/doctors" className="hover:underline">
              الأطباء
            </Link>
            <span className="mx-2">/</span>
            <span className="text-white">{name}</span>
          </nav>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div
              className="h-32 w-32 rounded-2xl bg-white/15 grid place-items-center overflow-hidden shrink-0 ring-4 ring-white/20"
              role={hasPhoto ? undefined : "img"}
              aria-label={hasPhoto ? undefined : noPhotoLabel}
              title={hasPhoto ? undefined : noPhotoLabel}
            >
              {hasPhoto ? (
                <ProgressiveImage
                  src={gallery[0]}
                  alt={photoAlt}
                  className="h-full w-full"
                  imgClassName="h-full w-full object-cover"
                  loading="eager"
                  fetchPriority="high"
                  spinnerLight
                  widths={[128, 256, 384]}
                  sizes="128px"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-white/90">
                  <User className="h-10 w-10" aria-hidden />
                  <span className="text-2xl font-bold leading-none">
                    {initials || name.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-extrabold">{name}</h1>
              {jobTitle && <div className="mt-1 text-white/85">{jobTitle}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {specName && d.specialties && (
                  <Link
                    to="/specialties/$slug"
                    params={{ slug: d.specialties.slug }}
                    className="inline-flex items-center rounded-full bg-white/15 border border-white/25 px-3 py-1 text-xs text-white hover:bg-white/25"
                  >
                    {specName}
                  </Link>
                )}
                {d.years_experience != null && d.years_experience > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/25 px-3 py-1 text-xs">
                    <Award className="h-3 w-3" /> {d.years_experience}+ سنوات خبرة
                  </span>
                )}
                {genderLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/25 px-3 py-1 text-xs">
                    <User className="h-3 w-3" /> {genderLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {bookingEnabled && (
              <Link
                to="/book"
                search={{ doctor: d.id } as never}
                className="inline-flex items-center gap-2 rounded-lg bg-white text-primary px-5 py-3 text-sm font-bold hover:bg-white/90"
              >
                احجز موعداً <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </Link>
            )}
            <a
              href={`tel:${SITE.phone}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 border border-white/25 px-5 py-3 text-sm font-bold hover:bg-white/20"
            >
              <Phone className="h-4 w-4" /> {SITE.phoneDisplay}
            </a>
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="container-app grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            <Tabs defaultValue="about" className="w-full">
              <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 bg-muted/60 p-1">
                <TabsTrigger value="about" className="gap-2">
                  <FileText className="h-4 w-4" /> نبذة
                </TabsTrigger>
                <TabsTrigger value="expertise" className="gap-2">
                  <Stethoscope className="h-4 w-4" /> تخصصات وخبرات
                </TabsTrigger>
                <TabsTrigger value="branches" className="gap-2">
                  <Building2 className="h-4 w-4" /> فروع
                </TabsTrigger>
                <TabsTrigger value="ratings" className="gap-2">
                  <MessageSquare className="h-4 w-4" /> تقييمات
                </TabsTrigger>
                <TabsTrigger value="policies" className="gap-2">
                  <Info className="h-4 w-4" /> سياسات
                </TabsTrigger>
              </TabsList>

              <TabsContent value="about" className="mt-6 space-y-8">
                <div>
                  <h2 className="text-xl font-bold mb-3">نبذة</h2>
                  {bio ? (
                    <p className="text-muted-foreground leading-8 whitespace-pre-line">{bio}</p>
                  ) : (
                    <EmptyState
                      icon={<FileText className="h-6 w-6" />}
                      text={
                        ar
                          ? "لا توجد نبذة متاحة لهذا الطبيب حالياً."
                          : "No biography available yet."
                      }
                    />
                  )}
                </div>
                {gallery.length > 1 && (
                  <DoctorGallery photos={gallery} name={name} alt={photoAlt} lang={lang} />
                )}
              </TabsContent>

              <TabsContent value="expertise" className="mt-6 space-y-8">
                <ExpertiseTab
                  ar={ar}
                  specName={specName}
                  specSlug={d.specialties?.slug ?? null}
                  yearsExperience={d.years_experience}
                  languages={d.languages}
                  education={ar ? d.education_ar : d.education_en}
                  experience={ar ? d.experience_ar : d.experience_en}
                />
              </TabsContent>

              <TabsContent value="branches" className="mt-6">
                <DoctorBranchesTab
                  doctorId={d.id}
                  fallbackBranchId={d.branch_id}
                  ar={ar}
                  lang={lang}
                />
              </TabsContent>

              <TabsContent value="ratings" className="mt-6">
                <DoctorRatings doctorId={d.id} lang={lang} />
              </TabsContent>

              <TabsContent value="policies" className="mt-6">
                <BookingPolicy lang={lang} />
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-6">
            <InlineBookingWidget
              doctorId={d.id}
              bookingEnabled={bookingEnabled}
              doctorName={name}
            />

            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-bold mb-3">معلومات</h3>
              {specName && (
                <div className="text-sm mb-2">
                  <span className="text-muted-foreground">التخصص: </span>
                  <span className="font-medium">{specName}</span>
                </div>
              )}
              {branchName && (
                <div className="text-sm mb-2">
                  <span className="text-muted-foreground">الفرع: </span>
                  <span className="font-medium">{branchName}</span>
                </div>
              )}
              {d.languages && d.languages.length > 0 && (
                <div className="text-sm flex items-start gap-2 mb-2">
                  <Languages className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span>{d.languages.join("، ")}</span>
                </div>
              )}
              <div className="text-sm flex items-start gap-2 mb-2">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>{lang === "ar" ? SITE.addressAr : SITE.addressEn}</span>
              </div>
              <div className="text-sm flex items-start gap-2">
                <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <a href={`tel:${SITE.phone}`} className="hover:text-primary">
                  {SITE.phoneDisplay}
                </a>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function ExpertiseTab({
  ar,
  specName,
  specSlug,
  yearsExperience,
  languages,
  education,
  experience,
}: {
  ar: boolean;
  specName: string | null;
  specSlug: string | null;
  yearsExperience: number | null;
  languages: string[] | null;
  education: string | null;
  experience: string | null;
}) {
  const hasAny =
    !!specName ||
    !!education ||
    !!experience ||
    (yearsExperience != null && yearsExperience > 0) ||
    (languages && languages.length > 0);

  if (!hasAny) {
    return (
      <EmptyState
        icon={<Stethoscope className="h-6 w-6" />}
        text={ar ? "لم تُضف تفاصيل التخصص والخبرة بعد." : "No expertise details added yet."}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {specName && (
          <InfoCard
            icon={<Stethoscope className="h-5 w-5" />}
            label={ar ? "التخصص" : "Specialty"}
            value={
              specSlug ? (
                <Link
                  to="/specialties/$slug"
                  params={{ slug: specSlug }}
                  className="text-primary hover:underline"
                >
                  {specName}
                </Link>
              ) : (
                specName
              )
            }
          />
        )}
        {yearsExperience != null && yearsExperience > 0 && (
          <InfoCard
            icon={<Award className="h-5 w-5" />}
            label={ar ? "سنوات الخبرة" : "Years of experience"}
            value={`${yearsExperience}+ ${ar ? "سنة" : "years"}`}
          />
        )}
        {languages && languages.length > 0 && (
          <InfoCard
            icon={<Languages className="h-5 w-5" />}
            label={ar ? "اللغات" : "Languages"}
            value={languages.join(ar ? "، " : ", ")}
          />
        )}
      </div>

      {education && (
        <div>
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />{" "}
            {ar ? "المؤهلات العلمية" : "Education"}
          </h3>
          <p className="text-muted-foreground leading-8 whitespace-pre-line">{education}</p>
        </div>
      )}

      {experience && (
        <div>
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />{" "}
            {ar ? "الخبرات المهنية" : "Professional experience"}
          </h3>
          <p className="text-muted-foreground leading-8 whitespace-pre-line">{experience}</p>
        </div>
      )}
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <div className="text-sm font-semibold break-words">{value}</div>
      </div>
    </div>
  );
}

type DoctorBranchRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
  city_ar: string | null;
  city_en: string | null;
  address_ar: string | null;
  address_en: string | null;
  phone: string | null;
  is_primary: boolean;
};

function DoctorBranchesTab({
  doctorId,
  fallbackBranchId,
  ar,
  lang,
}: {
  doctorId: string;
  fallbackBranchId: string | null;
  ar: boolean;
  lang: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["doctor-branches", doctorId],
    queryFn: async (): Promise<DoctorBranchRow[]> => {
      const { data, error } = await supabase
        .from("doctor_branches")
        .select(
          "is_primary, branches:branch_id(id, slug, name_ar, name_en, city_ar, city_en, address_ar, address_en, phone, is_active)",
        )
        .eq("doctor_id", doctorId);
      if (error) throw error;
      const rows = ((data ?? []) as any[])
        .map((r) => {
          const b = r.branches;
          if (!b || b.is_active === false) return null;
          return {
            id: b.id,
            slug: b.slug,
            name_ar: b.name_ar,
            name_en: b.name_en,
            city_ar: b.city_ar,
            city_en: b.city_en,
            address_ar: b.address_ar,
            address_en: b.address_en,
            phone: b.phone,
            is_primary: !!r.is_primary,
          } as DoctorBranchRow;
        })
        .filter(Boolean) as DoctorBranchRow[];

      if (rows.length === 0 && fallbackBranchId) {
        const { data: b } = await supabase
          .from("branches")
          .select("id, slug, name_ar, name_en, city_ar, city_en, address_ar, address_en, phone")
          .eq("id", fallbackBranchId)
          .eq("is_active", true)
          .maybeSingle();
        if (b) rows.push({ ...(b as any), is_primary: true });
      }
      // Primary first, then by name.
      rows.sort((a, b) =>
        a.is_primary === b.is_primary
          ? a.name_ar.localeCompare(b.name_ar, "ar")
          : a.is_primary
            ? -1
            : 1,
      );
      return rows;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<Building2 className="h-6 w-6" />}
        text={ar ? "تعذّر تحميل الفروع، حاول لاحقاً." : "Failed to load branches."}
      />
    );
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-6 w-6" />}
        text={
          ar ? "لا توجد فروع مرتبطة بهذا الطبيب حالياً." : "No branches linked to this doctor yet."
        }
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((b) => {
        const bName = lang === "ar" ? b.name_ar : b.name_en || b.name_ar;
        const bCity = lang === "ar" ? b.city_ar : b.city_en || b.city_ar;
        const bAddr = lang === "ar" ? b.address_ar : b.address_en || b.address_ar;
        return (
          <div key={b.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold">{bName}</div>
                  {bCity && <div className="text-xs text-muted-foreground">{bCity}</div>}
                </div>
              </div>
              {b.is_primary && (
                <span className="text-[10px] font-semibold rounded-full bg-primary/10 text-primary px-2 py-0.5">
                  {ar ? "الفرع الرئيسي" : "Primary"}
                </span>
              )}
            </div>
            {bAddr && (
              <div className="mt-2 text-sm text-muted-foreground flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{bAddr}</span>
              </div>
            )}
            {b.phone && (
              <div className="mt-1.5 text-sm text-muted-foreground flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0" />
                <a href={`tel:${b.phone}`} className="hover:text-primary">
                  {b.phone}
                </a>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/branches/$slug"
                params={{ slug: b.slug }}
                search={{ service: undefined }}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary transition"
              >
                {ar ? "تفاصيل الفرع" : "Branch details"}
              </Link>
              <Link
                to="/book"
                search={{ doctor: doctorId, branch: b.id } as never}
                className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition"
              >
                {ar ? "احجز في هذا الفرع" : "Book at this branch"}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BookingPolicy({ lang }: { lang: string }) {
  const ar = lang === "ar";
  const prep = ar
    ? [
        "احضر قبل الموعد بـ 15 دقيقة لإكمال الاستقبال.",
        "أحضر الهوية الوطنية أو الإقامة وبطاقة التأمين إن وُجدت.",
        "أحضر التقارير والأشعة والتحاليل السابقة ذات العلاقة.",
        "دوّن قائمة بالأدوية الحالية والحساسية إن وُجدت.",
        "لبعض الفحوصات (كالتحاليل والأشعة) قد يُطلب الصيام — سيتم إبلاغك مسبقًا.",
      ]
    : [
        "Arrive 15 minutes early to complete reception.",
        "Bring your National ID / Iqama and insurance card if any.",
        "Bring previous reports, scans, and lab results if related.",
        "Prepare a list of current medications and allergies.",
        "Some tests (labs/imaging) may require fasting — you will be informed in advance.",
      ];
  const policy = ar
    ? [
        "يمكن تعديل الموعد أو إلغاؤه مجانًا قبل الموعد بـ 3 ساعات على الأقل.",
        "التأخر أكثر من 15 دقيقة قد يُلغي الحجز تلقائيًا ويتطلب إعادة جدولته.",
        "عدم الحضور دون إشعار مسبق قد يؤثر على أولوية الحجوزات المستقبلية.",
        "لتعديل الموعد اتصل بنا أو استخدم رابط التأكيد المرسل عبر الرسائل النصية.",
      ]
    : [
        "You can reschedule or cancel free of charge up to 3 hours before the appointment.",
        "Arriving more than 15 minutes late may cancel the booking automatically.",
        "No-shows without prior notice may affect priority on future bookings.",
        "To modify your appointment, call us or use the confirmation link sent by SMS.",
      ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Info className="h-5 w-5 text-primary" />
        <h3 className="font-bold">{ar ? "قبل تأكيد الحجز" : "Before you confirm"}</h3>
      </div>

      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          {ar ? "تعليمات التحضير للموعد" : "Appointment preparation"}
        </div>
        <ul className="space-y-1.5 text-sm text-muted-foreground leading-6 list-disc ps-5">
          {prep.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
          <XCircle className="h-4 w-4 text-primary" />
          {ar ? "سياسة الإلغاء والتعديل" : "Cancellation & modification policy"}
        </div>
        <ul className="space-y-1.5 text-sm text-muted-foreground leading-6 list-disc ps-5">
          {policy.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {ar
          ? "بالمتابعة إلى الحجز فإنك توافق على التعليمات والسياسة أعلاه."
          : "By continuing to book, you agree to the instructions and policy above."}
      </p>
    </div>
  );
}

type RatingRow = {
  id: string;
  rating: number;
  comment: string | null;
  patient_name: string | null;
  created_at: string;
  staff_reply: string | null;
  staff_reply_at: string | null;
};
type SummaryRow = { average: number | null; count: number };

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
          }
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

function DoctorRatings({ doctorId, lang }: { doctorId: string; lang: string }) {
  const ar = lang === "ar";
  const summary = useQuery({
    queryKey: ["doctor-rating-summary", doctorId],
    queryFn: async (): Promise<SummaryRow> => {
      const { data, error } = await supabase.rpc("get_public_doctor_rating_summary", {
        _doctor_id: doctorId,
      });
      if (error) throw error;
      const row = (data as any[])?.[0];
      return { average: row?.average ?? null, count: Number(row?.count ?? 0) };
    },
    staleTime: 60_000,
  });
  const list = useQuery({
    queryKey: ["doctor-ratings", doctorId],
    queryFn: async (): Promise<RatingRow[]> => {
      const { data, error } = await supabase.rpc("list_public_doctor_ratings", {
        _doctor_id: doctorId,
        _limit: 20,
      });
      if (error) throw error;
      return (data as RatingRow[]) ?? [];
    },
    staleTime: 60_000,
  });

  const [showAll, setShowAll] = useState(false);
  const items = list.data ?? [];
  const shown = showAll ? items : items.slice(0, 5);
  const count = summary.data?.count ?? 0;
  const avg = summary.data?.average ?? 0;
  const locale = ar ? "ar-SA" : "en-US";

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        {ar ? "تقييمات المرضى" : "Patient reviews"}
      </h2>

      <div className="rounded-2xl border border-border bg-card p-6 mb-4">
        {summary.isLoading ? (
          <div className="text-sm text-muted-foreground">
            {ar ? "جاري التحميل..." : "Loading..."}
          </div>
        ) : count === 0 ? (
          <div className="text-sm text-muted-foreground">
            {ar ? "لا توجد تقييمات لهذا الطبيب بعد." : "No reviews for this doctor yet."}
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <div className="text-center">
              <div className="text-4xl font-extrabold text-primary leading-none">
                {Number(avg).toLocaleString(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{ar ? "من ٥" : "out of 5"}</div>
            </div>
            <div>
              <Stars value={Number(avg)} size={20} />
              <div className="mt-1 text-sm text-muted-foreground">
                {ar
                  ? `بناءً على ${count.toLocaleString(locale)} مراجعة`
                  : `Based on ${count.toLocaleString(locale)} reviews`}
              </div>
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="space-y-3">
          {shown.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold">
                    {(r.patient_name ?? "?").charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">
                      {r.patient_name || (ar ? "مريض" : "Patient")}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(locale, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                </div>
                <Stars value={r.rating} />
              </div>
              {r.comment && (
                <p className="text-sm text-muted-foreground leading-7 whitespace-pre-line">
                  {r.comment}
                </p>
              )}
              {r.staff_reply && (
                <div className="mt-3 rounded-lg bg-muted/50 border border-border p-3">
                  <div className="text-xs font-semibold text-primary mb-1">
                    {ar ? "رد المجمع" : "Clinic reply"}
                  </div>
                  <p className="text-sm text-muted-foreground leading-6 whitespace-pre-line">
                    {r.staff_reply}
                  </p>
                </div>
              )}
            </div>
          ))}
          {items.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-sm font-medium text-primary hover:underline"
            >
              {showAll
                ? ar
                  ? "عرض أقل"
                  : "Show less"
                : ar
                  ? `عرض جميع المراجعات (${items.length})`
                  : `Show all reviews (${items.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Module-level cache of image URLs known to be fully loaded or successfully
// prefetched during this session. Prevents redundant preload fetches when the
// user re-navigates to a photo they've already seen. Bounded to avoid unbounded
// memory growth on very large galleries — oldest entries are evicted first.
const IMAGE_READY_CACHE = new Set<string>();
const IMAGE_READY_LIMIT = 200;
function isImageReady(src: string): boolean {
  return IMAGE_READY_CACHE.has(src);
}
function markImageReady(src: string): void {
  if (IMAGE_READY_CACHE.has(src)) return;
  if (IMAGE_READY_CACHE.size >= IMAGE_READY_LIMIT) {
    const oldest = IMAGE_READY_CACHE.values().next().value;
    if (oldest) IMAGE_READY_CACHE.delete(oldest);
  }
  IMAGE_READY_CACHE.add(src);
}

function DoctorGallery({
  photos,
  name,
  alt,
  lang,
}: {
  photos: string[];
  name: string;
  alt: string;
  lang: string;
}) {
  const ar = lang === "ar";
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  // Delay the spinner ~180ms so cached images never flash it.
  useEffect(() => {
    if (!lightboxLoading) {
      setShowSpinner(false);
      return;
    }
    const t = window.setTimeout(() => setShowSpinner(true), 180);
    return () => window.clearTimeout(t);
  }, [lightboxLoading, active]);

  const total = photos.length;
  const go = (dir: 1 | -1) => setActive((i) => (i + dir + total) % total);
  const titleId = useId();
  const descId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  // Wheel/trackpad nav: accumulate scroll delta and gate with a cooldown so a
  // single flick doesn't skip many photos. Prefer horizontal delta when present.
  const wheelAccumRef = useRef(0);
  const wheelCooldownRef = useRef(0);
  // Holds the AbortController for the currently-inflight neighbor prefetches
  // so a fast swipe/drag can cancel them the instant a new gesture starts,
  // before `active` even changes.
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const abortInflightPrefetch = () => {
    prefetchAbortRef.current?.abort();
    prefetchAbortRef.current = null;
  };

  const openerRef = useRef<HTMLButtonElement>(null);
  const caption = `${alt} — ${ar ? "صورة" : "Photo"} ${active + 1} ${ar ? "من" : "of"} ${total}`;

  // Eagerly warm a photo URL into the HTTP cache. Used by keyboard nav so
  // holding an arrow key keeps the pipeline one step ahead of `active`.
  const warmPhoto = (src: string | undefined) => {
    if (!src || isImageReady(src)) return;
    fetch(src, {
      cache: "force-cache",
      credentials: "omit",
      mode: "no-cors",
      priority: "low",
    } as RequestInit)
      .then(() => markImageReady(src))
      .catch(() => {
        /* ignore */
      });
  };

  // Keyboard: Esc closes, Arrow keys navigate (respect RTL), Home/End jump.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (total <= 1) return;
      const prevKey = ar ? "ArrowRight" : "ArrowLeft";
      const nextKey = ar ? "ArrowLeft" : "ArrowRight";
      if (e.key === prevKey) {
        e.preventDefault();
        // Warm one step past the destination so rapid key repeats stay ahead
        // of the render. The main prefetch effect handles the immediate neighbor.
        warmPhoto(photos[(active - 2 + total * 2) % total]);
        go(-1);
      } else if (e.key === nextKey) {
        e.preventDefault();
        warmPhoto(photos[(active + 2) % total]);
        go(1);
      } else if (e.key === "Home") {
        e.preventDefault();
        warmPhoto(photos[1 % total]);
        setActive(0);
      } else if (e.key === "End") {
        e.preventDefault();
        warmPhoto(photos[(total - 2 + total) % total]);
        setActive(total - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while lightbox is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog and return it on close.
    closeBtnRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus();
    };
  }, [open, total, ar, active, photos]);

  // Prefetch neighboring images while the lightbox is open so navigation
  // between photos feels instant. Uses fetch() with an AbortController so
  // rapid navigation cancels in-flight warm-ups instead of piling up.
  // Skips images already marked ready in the module-level cache.
  useEffect(() => {
    if (!open || total <= 1) return;
    const controller = new AbortController();
    prefetchAbortRef.current = controller;
    const neighbors = Array.from(
      new Set([photos[(active + 1) % total], photos[(active - 1 + total) % total]]),
    ).filter((src): src is string => Boolean(src) && src !== photos[active] && !isImageReady(src));

    neighbors.forEach((src) => {
      // `force-cache` populates the HTTP cache so the subsequent <img>
      // render is a cache hit. On success we mark the URL ready so future
      // navigations skip the fetch entirely.
      fetch(src, {
        signal: controller.signal,
        cache: "force-cache",
        credentials: "omit",
        mode: "no-cors",
        priority: "low",
      } as RequestInit)
        .then(() => markImageReady(src))
        .catch(() => {
          /* aborted or offline — safe to ignore */
        });
    });

    return () => {
      controller.abort();
      if (prefetchAbortRef.current === controller) {
        prefetchAbortRef.current = null;
      }
    };
  }, [open, active, total, photos]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-3">{ar ? "معرض الصور" : "Gallery"}</h2>

      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full overflow-hidden rounded-2xl border border-border bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={ar ? `عرض الصورة بالحجم الكامل — ${alt}` : `View full size — ${alt}`}
      >
        <ProgressiveImage
          src={photos[active]}
          alt={`${alt} (${active + 1}/${total})`}
          className="aspect-[16/10] w-full"
          imgClassName="h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
          widths={[480, 768, 1024, 1440]}
          sizes="(min-width: 768px) 66vw, 100vw"
        />
      </button>

      <div
        className="mt-3 grid grid-cols-5 gap-2"
        role="listbox"
        aria-label={ar ? "الصور المصغّرة" : "Photo thumbnails"}
      >
        {photos.map((src, i) => (
          <button
            key={src + i}
            type="button"
            role="option"
            onClick={() => setActive(i)}
            className={`aspect-square overflow-hidden rounded-lg border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              i === active ? "border-primary" : "border-transparent hover:border-primary/40"
            }`}
            aria-label={`${ar ? "عرض الصورة" : "View photo"} ${i + 1} ${ar ? "من" : "of"} ${total} — ${name}`}
            aria-selected={i === active}
            aria-current={i === active ? "true" : undefined}
          >
            <ProgressiveImage
              src={src}
              alt=""
              ariaHidden
              className="h-full w-full"
              imgClassName="h-full w-full object-cover"
              loading="lazy"
              widths={[128, 192, 256]}
              sizes="(min-width: 768px) 130px, 20vw"
            />
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onClick={() => setOpen(false)}
        >
          <h3 id={titleId} className="sr-only">
            {ar ? `معرض صور ${name}` : `${name} photo gallery`}
          </h3>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={ar ? "إغلاق العارض (Esc)" : "Close viewer (Esc)"}
          >
            <XCircle className="h-6 w-6" aria-hidden />
          </button>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                className="absolute start-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={ar ? "الصورة السابقة" : "Previous photo"}
                aria-controls={descId}
              >
                <ArrowLeft className="h-6 w-6 rtl:rotate-180" aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                className="absolute end-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={ar ? "الصورة التالية" : "Next photo"}
                aria-controls={descId}
              >
                <ArrowLeft className="h-6 w-6 rotate-180 rtl:rotate-0" aria-hidden />
              </button>
            </>
          )}

          <figure
            id={descId}
            className="flex flex-col items-center gap-3 touch-pan-y select-none cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              const t = e.touches[0];
              swipeStartRef.current = { x: t.clientX, y: t.clientY };
              // A new swipe may head to a different neighbor than we're
              // currently warming — cancel in-flight prefetches immediately.
              abortInflightPrefetch();
            }}

            onTouchEnd={(e) => {
              const start = swipeStartRef.current;
              swipeStartRef.current = null;
              if (!start || total <= 1) return;
              const t = e.changedTouches[0];
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              // Horizontal swipe only: |dx| > 50 and dominant over vertical.
              if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
              // RTL: swiping right advances to "next" (mirrored).
              const forward = ar ? dx > 0 : dx < 0;
              go(forward ? 1 : -1);
            }}
            onPointerDown={(e) => {
              // Touch is handled by onTouchStart/End; only track mouse/pen drag here.
              if (e.pointerType === "touch") return;
              swipeStartRef.current = { x: e.clientX, y: e.clientY };
              // Cancel neighbor prefetches: the drag may go either direction.
              abortInflightPrefetch();
              try {
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
              } catch {
                /* no-op */
              }
            }}

            onPointerUp={(e) => {
              if (e.pointerType === "touch") return;
              const start = swipeStartRef.current;
              swipeStartRef.current = null;
              try {
                (e.currentTarget as Element).releasePointerCapture(e.pointerId);
              } catch {
                /* no-op */
              }
              if (!start || total <= 1) return;
              const dx = e.clientX - start.x;
              const dy = e.clientY - start.y;
              if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
              const forward = ar ? dx > 0 : dx < 0;
              go(forward ? 1 : -1);
            }}
            onPointerCancel={() => {
              swipeStartRef.current = null;
            }}
            onWheel={(e) => {
              if (total <= 1) return;
              // Prefer horizontal wheel/trackpad motion; fall back to vertical.
              const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
              if (raw === 0) return;
              const now = Date.now();
              // Reset accumulator if the user paused (new gesture).
              if (now - wheelCooldownRef.current > 400) wheelAccumRef.current = 0;
              wheelAccumRef.current += raw;
              const THRESHOLD = 80;
              if (Math.abs(wheelAccumRef.current) < THRESHOLD) return;
              // Cooldown to avoid a single flick advancing multiple photos.
              if (now - wheelCooldownRef.current < 350) return;
              wheelCooldownRef.current = now;
              const dir = wheelAccumRef.current > 0 ? 1 : -1;
              wheelAccumRef.current = 0;
              // RTL: horizontal scroll right advances to "next" (mirrored).
              const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
              const forward = isHorizontal && ar ? dir < 0 : dir > 0;
              go(forward ? 1 : -1);
            }}
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="relative">
              <ProgressiveImage
                src={photos[active]}
                alt={caption}
                className="max-h-[80vh] max-w-[92vw]"
                imgClassName="max-h-[80vh] max-w-[92vw] object-contain rounded-lg"
                loading="eager"
                fetchPriority="high"
                spinnerLight
                widths={[768, 1024, 1440, 1920]}
                sizes="92vw"
                onLoadingChange={(loading) => {
                  setLightboxLoading(loading);
                  if (!loading) markImageReady(photos[active]);
                }}
              />
              {showSpinner && (
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  role="status"
                  aria-live="polite"
                  aria-label={ar ? "جارٍ تحميل الصورة" : "Loading image"}
                >
                  <Loader2
                    className="h-10 w-10 animate-spin text-white/90 drop-shadow"
                    aria-hidden
                  />
                </div>
              )}
            </div>

            <figcaption className="text-white/90 text-sm text-center max-w-[92vw]">
              <span className="block">{alt}</span>
              <span className="block text-white/70 text-xs mt-1">
                {ar
                  ? `صورة ${active + 1} من ${total} — استخدم الأسهم للتنقل و Esc للإغلاق`
                  : `Photo ${active + 1} of ${total} — use arrow keys to navigate, Esc to close`}
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

/**
 * Progressive image with a skeleton shimmer that fades away once the
 * image has loaded. Uses native lazy loading + async decoding by default.
 */
/**
 * Rewrites a Supabase Storage public object URL to the on-the-fly render
 * endpoint with a width query. Returns the original URL for any other host
 * so external images still work (browser will just ignore the srcset entry).
 */
function withWidth(src: string, width: number): string {
  try {
    const u = new URL(
      src,
      typeof window !== "undefined" ? window.location.href : "http://localhost",
    );
    if (u.pathname.includes("/storage/v1/object/public/")) {
      u.pathname = u.pathname.replace(
        "/storage/v1/object/public/",
        "/storage/v1/render/image/public/",
      );
    }
    if (u.pathname.includes("/storage/v1/render/image/public/")) {
      u.searchParams.set("width", String(width));
      u.searchParams.set("quality", "80");
      return u.toString();
    }
  } catch {
    /* ignore malformed URL */
  }
  return src;
}

function buildSrcSet(src: string, widths: number[]): string | undefined {
  const rewritten = widths.map((w) => `${withWidth(src, w)} ${w}w`);
  // Only emit srcset when at least one entry actually differs from the src
  // (i.e. the URL supports transformation) — otherwise skip to avoid
  // repeating the same URL at every descriptor.
  const usable = widths.some((w) => withWidth(src, w) !== src);
  return usable ? rewritten.join(", ") : undefined;
}

function ProgressiveImage({
  src,
  alt,
  className = "",
  imgClassName = "",
  loading = "lazy",
  fetchPriority,
  ariaHidden,
  spinnerLight,
  widths,
  sizes,
  onLoadingChange,
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  ariaHidden?: boolean;
  spinnerLight?: boolean;
  /** Candidate widths in px. When provided, an srcSet is built. */
  widths?: number[];
  /** CSS `sizes` attribute — required for `widths` to be effective. */
  sizes?: string;
  /** Notifies parent whenever loading state flips (true = still loading). */
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Reset when the src changes.
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  const isLoading = !loaded && !failed;
  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  const srcSet = widths && widths.length ? buildSrcSet(src, widths) : undefined;

  return (
    <div
      className={`relative overflow-hidden bg-muted ${className}`}
      aria-busy={isLoading || undefined}
    >
      {isLoading && (
        <div
          className={`absolute inset-0 ${
            spinnerLight ? "skeleton-shimmer-light" : "skeleton-shimmer"
          }`}
          aria-hidden="true"
          role="presentation"
        />
      )}
      <img
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={ariaHidden ? "" : alt}
        aria-hidden={ariaHidden || undefined}
        role={ariaHidden ? "presentation" : undefined}
        loading={loading}
        decoding="async"
        // React types accept the camelCase prop; DOM lowercases at render.
        {...(fetchPriority ? { fetchpriority: fetchPriority } : {})}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`${imgClassName} transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
