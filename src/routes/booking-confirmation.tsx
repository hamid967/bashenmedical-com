import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Radio } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  Check,
  Calendar,
  Clock,
  User,
  Phone,
  Stethoscope,
  Building2,
  Search,
  CalendarPlus,
  Share2,
  FileText,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Printer,
  QrCode,
} from "lucide-react";
import { downloadIcs, whatsappShareUrl, googleCalendarUrl, type ShareBooking } from "@/lib/booking-share";
import { OrderTimeline } from "@/components/booking/OrderTimeline";
import { bmcOgImageMeta } from "@/lib/og-meta";

const searchSchema = z.object({
  ref: z.string().optional(),
  phone: z.string().optional(),
  branch: z.string().optional(),
  wa: z.string().optional(),
});

export const Route = createFileRoute("/booking-confirmation")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "تأكيد الحجز | مجمع باعشن الطبي" },
      { name: "description", content: "ملخص الحجز ورقم الحجز في مجمع باعشن الطبي." },
      { property: "og:title", content: "تأكيد الحجز — مجمع باعشن الطبي" },
      { property: "og:description", content: "استعرض تفاصيل موعدك ورقم الحجز." },
    ],
  }),
  component: BookingConfirmationPage,
});

type AppointmentSummary = {
  id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  reason: string | null;
  specialty_id: string | null;
  doctor_id: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  doctor_name_ar: string | null;
  doctor_name_en: string | null;
  created_at: string;
  reminder_24h: boolean | null;
  reminder_2h: boolean | null;
};

const WEEKDAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function statusLabel(s: string) {
  switch (s) {
    case "confirmed":
      return "مؤكد";
    case "completed":
      return "مكتمل";
    case "cancelled":
      return "ملغى";
    case "no_show":
      return "لم يحضر";
    default:
      return "قيد المراجعة";
  }
}

function statusColor(s: string) {
  switch (s) {
    case "confirmed":
      return "bg-green-500/10 text-green-700 border-green-500/30";
    case "completed":
      return "bg-blue-500/10 text-blue-700 border-blue-500/30";
    case "cancelled":
      return "bg-red-500/10 text-red-700 border-red-500/30";
    case "no_show":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    default:
      return "bg-primary/10 text-primary border-primary/30";
  }
}

function BookingConfirmationPage() {
  const { ref, phone, branch, wa } = Route.useSearch();
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [appt, setAppt] = useState<AppointmentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  // API returns refs like "BAA-XXXXXXXX" but lookup_appointment matches
  // raw hex from the appointment id. Strip prefix so both formats work.
  const normalizedRef = (ref ?? "").replace(/[^0-9a-fA-F]/g, "");

  const fetchAppt = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!normalizedRef || !phone) {
        setLoading(false);
        setError("يرجى إدخال رقم الحجز ورقم الجوال لعرض التفاصيل.");
        return;
      }
      if (opts.silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc("lookup_appointment", {
        _ref: normalizedRef,
        _phone: phone,
      });
      setLoading(false);
      setRefreshing(false);
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setError(t("lookup_not_found"));
        return;
      }
      const next = row as AppointmentSummary;
      setAppt((prev) => {
        if (prev && prevStatusRef.current && prev.status !== next.status) {
          toast.success(`تم تحديث حالة الحجز: ${statusLabel(next.status)}`);
        }
        prevStatusRef.current = next.status;
        return next;
      });
      setLastUpdated(new Date());
    },
    [normalizedRef, phone, t],
  );

  useEffect(() => {
    void fetchAppt();
  }, [fetchAppt]);

  // Realtime: subscribe to changes on this appointment's row and refetch.
  useEffect(() => {
    if (!appt?.id) return;
    const channel = supabase
      .channel(`appt-${appt.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments", filter: `id=eq.${appt.id}` },
        () => {
          void fetchAppt({ silent: true });
        },
      )
      .subscribe((status) => {
        setLiveConnected(status === "SUBSCRIBED");
      });
    return () => {
      supabase.removeChannel(channel);
      setLiveConnected(false);
    };
  }, [appt?.id, fetchAppt]);



  const share: ShareBooking | null = appt
    ? {
        ref: appt.id.slice(0, 8).toUpperCase(),
        patient_name: appt.patient_name,
        patient_phone: appt.patient_phone,
        appointment_date: appt.appointment_date,
        appointment_time: appt.appointment_time.slice(0, 5),
        doctor: lang === "ar" ? appt.doctor_name_ar ?? undefined : appt.doctor_name_en ?? undefined,
        specialty: lang === "ar" ? appt.specialty_name_ar ?? undefined : appt.specialty_name_en ?? undefined,
        reminder_24h: appt.reminder_24h,
        reminder_2h: appt.reminder_2h,
      }
    : null;

  // Auto-open WhatsApp exactly once when arriving from a fresh booking
  // (?wa=1). Guarded by a session flag so refresh doesn't re-trigger.
  const [waAutoOpened, setWaAutoOpened] = useState(false);
  useEffect(() => {
    if (waAutoOpened) return;
    if (wa !== "1" || !share) return;
    const key = `wa-opened-${share.ref}`;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(key)) {
      setWaAutoOpened(true);
      return;
    }
    window.sessionStorage.setItem(key, "1");
    setWaAutoOpened(true);
    // Small delay so the confirmation UI paints before the OS switches app.
    const id = window.setTimeout(() => {
      window.open(whatsappShareUrl(share), "_blank", "noopener,noreferrer");
    }, 600);
    return () => window.clearTimeout(id);
  }, [wa, share, waAutoOpened]);

  return (
    <div className="container-app py-12">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-3xl font-bold">{t("booking_success")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("booking_success_desc")}</p>
        </header>

        {loading && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">جارٍ تحميل تفاصيل الحجز…</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-3 text-sm text-destructive">{error}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link
                to="/lookup"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                <Search className="h-4 w-4" /> {t("track_booking")}
              </Link>
              <Link
                to="/book"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <CalendarPlus className="h-4 w-4" /> حجز جديد
              </Link>
            </div>
          </div>
        )}

        {!loading && appt && share && (
          <div className="space-y-4">
            <div className={`rounded-2xl border p-5 ${statusColor(appt.status)}`}>
              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  <Check className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-lg font-bold">{statusLabel(appt.status)}</div>
                    <div className="text-xs opacity-80">
                      <span className="opacity-70">{t("booking_ref")}: </span>
                      <span className="font-mono font-bold text-sm">BAA-{share.ref}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm opacity-90">
                    تم استلام حجزك وسنتواصل معك لتأكيد الموعد.
                  </p>
                </div>
              </div>
            </div>

            {/* Live status + manual refresh */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span
                  className={`inline-flex items-center gap-1 ${liveConnected ? "text-green-600" : "text-muted-foreground"}`}
                  title={liveConnected ? "متصل بالتحديث المباشر" : "غير متصل"}
                >
                  <Radio className={`h-3.5 w-3.5 ${liveConnected ? "animate-pulse" : ""}`} />
                  {liveConnected ? "تحديث مباشر" : "غير متصل"}
                </span>
                {lastUpdated && (
                  <span className="opacity-70">
                    · آخر تحديث {lastUpdated.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void fetchAppt({ silent: true })}
                disabled={refreshing}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                تحديث الحالة
              </button>
            </div>


            {/* Timeline of booking stages */}
            <OrderTimeline
              kind="appointment"
              status={appt.status}
              createdAt={appt.created_at}
              scheduledAt={`${appt.appointment_date}T${appt.appointment_time}`}
            />


            {/* QR + quick actions row */}
            <div className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row items-center gap-6 print:break-inside-avoid">
              <div className="shrink-0 grid place-items-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(
                    `${typeof window !== "undefined" ? window.location.origin : ""}/lookup?ref=${share.ref}&phone=${encodeURIComponent(appt.patient_phone)}`,
                  )}`}
                  alt="QR"
                  width={160}
                  height={160}
                  className="rounded-lg border border-border bg-white p-2"
                />
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <QrCode className="h-3 w-3" /> {lang === "ar" ? "امسح لعرض حجزك" : "Scan to view booking"}
                </span>
              </div>
              <div className="flex-1 min-w-0 text-sm text-muted-foreground leading-6 text-center sm:text-start">
                <p>
                  {lang === "ar"
                    ? "احتفظ برقم الحجز ورقم جوالك — يمكنك التتبع في أي وقت من صفحة (تتبع الحجز)."
                    : "Keep your booking ref and phone — you can track anytime from the Track page."}
                </p>
                <button
                  onClick={() => typeof window !== "undefined" && window.print()}
                  className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted print:hidden"
                >
                  <Printer className="h-4 w-4" />
                  {lang === "ar" ? "طباعة / حفظ PDF" : "Print / Save PDF"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-bold mb-4">ملخص الحجز</h2>
              <div className="grid gap-3 text-sm">
                {branch && (
                  <Row icon={<Building2 className="h-4 w-4" />} label="الفرع" value={branch} />
                )}
                {share.specialty && (
                  <Row
                    icon={<Stethoscope className="h-4 w-4" />}
                    label={t("nav_specialties")}
                    value={share.specialty}
                  />
                )}
                {share.doctor && (
                  <Row icon={<User className="h-4 w-4" />} label={t("nav_doctors")} value={share.doctor} />
                )}
                <Row
                  icon={<Calendar className="h-4 w-4" />}
                  label={t("date")}
                  value={`${appt.appointment_date} (${WEEKDAYS_AR[new Date(appt.appointment_date).getDay()]})`}
                />
                <Row
                  icon={<Clock className="h-4 w-4" />}
                  label={t("time")}
                  value={appt.appointment_time.slice(0, 5)}
                />
                <Row icon={<User className="h-4 w-4" />} label={t("name")} value={appt.patient_name} />
                <Row icon={<Phone className="h-4 w-4" />} label={t("phone")} value={appt.patient_phone} />
                {appt.reason && (
                  <Row icon={<FileText className="h-4 w-4" />} label={t("reason")} value={appt.reason} />
                )}
              </div>

              <div className="mt-6 space-y-3">
                {/* Primary WhatsApp confirmation CTA — sends the pre-filled
                    bilingual confirmation to the clinic on behalf of the
                    patient, so both sides have a record on WhatsApp. */}
                <a
                  href={whatsappShareUrl(share)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#25D366] px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#1FBA57] transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                  </svg>
                  <span className="text-start leading-tight">
                    أرسل تأكيد الحجز عبر واتساب
                    <span className="block text-[11px] font-normal opacity-90">
                      Send booking confirmation via WhatsApp
                    </span>
                  </span>
                </a>
                {waAutoOpened && (
                  <p className="text-xs text-center text-muted-foreground">
                    فُتح واتساب تلقائيًا في نافذة جديدة. لو لم يظهر، اضغط الزر أعلاه.
                    <span className="block text-[11px] opacity-80">
                      WhatsApp opened in a new tab. If it didn't appear, tap the button above.
                    </span>
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <a
                    href={googleCalendarUrl(share)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                    title="فتح في Google Calendar"
                  >
                    <Calendar className="h-4 w-4" /> Google Calendar
                  </a>
                  <button
                    onClick={() => downloadIcs(share)}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                    title="ملف ICS يعمل مع Apple / Outlook / أي تقويم"
                  >
                    <Calendar className="h-4 w-4" /> ملف ICS
                  </button>
                  <a
                    href={whatsappShareUrl(share, { share: true })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                    title="مشاركة مع أي جهة اتصال"
                  >
                    <Share2 className="h-4 w-4" /> {t("share_whatsapp")}
                  </a>
                </div>
              </div>
            </div>

            {(appt.status === "new" || appt.status === "confirmed") && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="text-sm font-bold mb-1">إدارة الحجز</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  يمكنك تعديل موعدك أو إلغاؤه في أي وقت — سنستخدم رقم الحجز ورقم جوالك للتحقق.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/lookup"
                    search={{ ref: share.ref, phone: appt.patient_phone, action: "reschedule" }}
                    className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
                  >
                    <CalendarPlus className="h-4 w-4" /> تعديل الموعد
                  </Link>
                  <Link
                    to="/lookup"
                    search={{ ref: share.ref, phone: appt.patient_phone, action: "cancel" }}
                    className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"
                  >
                    <AlertCircle className="h-4 w-4" /> إلغاء الحجز
                  </Link>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Link
                to="/lookup"
                search={{ ref: share.ref, phone: appt.patient_phone }}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                <Search className="h-4 w-4" /> {t("track_booking")}
              </Link>
              <Link
                to="/book"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <CalendarPlus className="h-4 w-4" /> حجز جديد
              </Link>
              <Link
                to="/"
                className="inline-flex items-center gap-1 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("nav_home")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}
