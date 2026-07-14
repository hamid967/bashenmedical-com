import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import {
  Search,
  CheckCircle2,
  Clock3,
  XCircle,
  AlertCircle,
  CalendarDays,
  Stethoscope,
  User,
  Loader2,
  ArrowRight,
  Download,
  WifiOff,
  ServerCrash,
  ShieldAlert,
  RefreshCw,
  SearchX,
} from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { downloadBookingConfirmationPdf } from "@/lib/booking-pdf";
import { bmcOgImageMeta } from "@/lib/og-meta";

type LookupErrorKind = "validation" | "not_found" | "network" | "timeout" | "server" | "unknown";
type LookupError = { kind: LookupErrorKind; message: string };

const ERROR_META: Record<
  LookupErrorKind,
  { title: string; icon: React.ReactNode; hint: string; canRetry: boolean }
> = {
  validation: {
    title: "بيانات غير صالحة",
    icon: <ShieldAlert className="h-10 w-10 text-destructive" />,
    hint: "تأكّد من صيغة رقم الطلب (BAA- ثم 8 خانات) وأنّ آخر 4 أرقام من الجوال مكوّنة من أربع خانات رقمية.",
    canRetry: false,
  },
  not_found: {
    title: "لم نعثر على طلب مطابق",
    icon: <SearchX className="h-10 w-10 text-amber-600" />,
    hint: "راجع رقم الطلب في رسالة التأكيد وتأكّد أنّ آخر 4 أرقام تعود لنفس الجوال المستخدم عند الحجز.",
    canRetry: true,
  },
  network: {
    title: "لا يوجد اتصال",
    icon: <WifiOff className="h-10 w-10 text-destructive" />,
    hint: "تحقّق من اتصال الإنترنت ثم أعد المحاولة.",
    canRetry: true,
  },
  timeout: {
    title: "انتهت مهلة الاتصال",
    icon: <Clock3 className="h-10 w-10 text-destructive" />,
    hint: "استغرقت العملية وقتًا أطول من المعتاد. حاول مرة أخرى.",
    canRetry: true,
  },
  server: {
    title: "خطأ مؤقت في الخادم",
    icon: <ServerCrash className="h-10 w-10 text-destructive" />,
    hint: "نعمل على حل المشكلة — يُرجى المحاولة بعد قليل أو التواصل مع الاستقبال.",
    canRetry: true,
  },
  unknown: {
    title: "حدث خطأ غير متوقع",
    icon: <AlertCircle className="h-10 w-10 text-destructive" />,
    hint: "أعد المحاولة، وإن استمرّت المشكلة تواصل مع فريقنا.",
    canRetry: true,
  },
};

export const Route = createFileRoute("/track")({
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
    phone4: typeof search.phone4 === "string" ? search.phone4 : undefined,
  }),
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "تتبع رقم طلبك | مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "تتبع حالة طلب حجزك في مجمع باعشن الطبي عبر رقم الطلب (BAA-XXXXXXXX) وآخر 4 أرقام من جوالك.",
      },
      { property: "og:title", content: "تتبع طلب الحجز — مجمع باعشن الطبي" },
      { property: "og:description", content: "تعرّف على حالة موعدك بسرعة." },
      { property: "og:url", content: "https://bashenmedical.com/track" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/track" }],
  }),
  component: TrackPage,
});

const schema = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^BAA-[0-9A-F]{8}$/, "رقم الطلب يجب أن يكون بصيغة BAA-XXXXXXXX"),
  phone_last4: z.string().trim().regex(/^\d{4}$/, "أدخل آخر 4 أرقام من جوالك"),
});

type Appointment = {
  reference: string;
  status: string;
  appointment_date: string;
  appointment_time: string;
  patient_name: string;
  doctor_name_ar: string | null;
  specialty_name_ar: string | null;
  created_at: string;
  cancelled_at: string | null;
};

const STATUS: Record<
  string,
  { label: string; cls: string; icon: React.ReactNode; note: string }
> = {
  new: {
    label: "قيد المراجعة",
    cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    icon: <Clock3 className="h-8 w-8" />,
    note: "استلمنا طلبك — سيقوم فريق الاستقبال بتأكيده وسنُعلمك بأي مستجدات.",
  },
  confirmed: {
    label: "مؤكّد",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    icon: <CheckCircle2 className="h-8 w-8" />,
    note: "تم تأكيد موعدك. يُرجى الحضور قبل الوقت المحدد بـ15 دقيقة.",
  },
  completed: {
    label: "مكتمل",
    cls: "bg-primary/15 text-primary border-primary/30",
    icon: <CheckCircle2 className="h-8 w-8" />,
    note: "تمت الزيارة بنجاح. شكرًا لثقتك بنا — يسعدنا تقييمك للخدمة.",
  },
  cancelled: {
    label: "ملغى",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    icon: <XCircle className="h-8 w-8" />,
    note: "تم إلغاء هذا الموعد. يمكنك حجز موعد جديد في أي وقت.",
  },
  no_show: {
    label: "لم يتم الحضور",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    icon: <AlertCircle className="h-8 w-8" />,
    note: "لم يتم تسجيل حضورك للموعد. يمكنك إعادة الحجز في أي وقت.",
  },
};

function formatArabicDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("ar-SA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function TrackPage() {
  const { ref: initialRef, phone4: initialPhone4 } = Route.useSearch();
  const [reference, setReference] = useState(initialRef ?? "");
  const [phone4, setPhone4] = useState(initialPhone4 ?? "");
  const [loading, setLoading] = useState(false);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<LookupError | null>(null);
  const lastQueryRef = useRef<{ reference: string; phone_last4: string } | null>(null);
  const autoRanRef = useRef(false);
  const [autoSearching, setAutoSearching] = useState(false);
  const [autoFailed, setAutoFailed] = useState(false);

  async function runLookup(payload: { reference: string; phone_last4: string }): Promise<boolean> {
    setLoading(true);
    setError(null);
    setAppointment(null);
    const toastId = toast.loading("جاري البحث عن حالة طلبك...");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      let res: Response;
      try {
        res = await fetch("/api/public/book/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (err) {
        const isAbort =
          (err instanceof DOMException && err.name === "AbortError") ||
          (err as { name?: string } | null)?.name === "AbortError";
        const kind: LookupErrorKind = isAbort ? "timeout" : "network";
        const msg = ERROR_META[kind].title;
        setError({ kind, message: msg });
        toast.error(msg, { id: toastId });
        return false;
      }

      let body: { ok?: boolean; appointment?: Appointment; message?: string } = {};
      try {
        body = await res.json();
      } catch {
        const kind: LookupErrorKind = res.status >= 500 ? "server" : "unknown";
        setError({ kind, message: ERROR_META[kind].title });
        toast.error(ERROR_META[kind].title, { id: toastId });
        return false;
      }

      if (res.ok && body.ok && body.appointment) {
        setAppointment(body.appointment);
        toast.success("تم العثور على طلبك", { id: toastId });
        return true;
      }

      const kind: LookupErrorKind =
        res.status === 404
          ? "not_found"
          : res.status === 400
            ? "validation"
            : res.status >= 500
              ? "server"
              : "unknown";
      const message = body.message?.trim() || ERROR_META[kind].title;
      setError({ kind, message });
      toast.error(message, { id: toastId });
      return false;
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setAutoFailed(false);

    const parsed = schema.safeParse({ reference, phone_last4: phone4 });
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "بيانات غير صالحة";
      setAppointment(null);
      setError({ kind: "validation", message: msg });
      toast.error(msg);
      return;
    }

    lastQueryRef.current = parsed.data;
    await runLookup(parsed.data);
  }

  function onRetry() {
    if (loading) return;
    const last = lastQueryRef.current;
    if (last) void runLookup(last);
  }

  // Auto-lookup on mount when both ?ref & ?phone4 arrive from the wizard's
  // "متابعة إلى حجوزاتي" button — user shouldn't re-type what we already know.
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!initialRef || !initialPhone4) return;
    autoRanRef.current = true;
    const parsed = schema.safeParse({ reference: initialRef, phone_last4: initialPhone4 });
    if (!parsed.success) {
      setAutoFailed(true);
      setError({ kind: "validation", message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة في الرابط" });
      return;
    }
    lastQueryRef.current = parsed.data;
    setAutoSearching(true);
    setAutoFailed(false);
    void runLookup(parsed.data).then((found) => {
      setAutoSearching(false);
      if (!found) setAutoFailed(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRef, initialPhone4]);

  const status = appointment ? STATUS[appointment.status] ?? STATUS.new : null;
  const errorMeta = error ? ERROR_META[error.kind] : null;

  return (
    <>
      <PageHero
        eyebrow="خدمة إلكترونية"
        title="تتبّع طلب حجزك"
        subtitle="أدخل رقم الطلب الذي وصلك بعد الحجز (BAA-XXXXXXXX) وآخر 4 أرقام من جوالك لعرض حالة موعدك."
      />

      <section className="container-app py-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <form
          onSubmit={onSubmit}
          noValidate
          aria-busy={loading}
          className="rounded-2xl border border-border bg-card p-6 space-y-4 h-fit"
          aria-label="نموذج تتبع طلب الحجز"
        >
          <fieldset disabled={loading} className="space-y-4 border-0 p-0 m-0 disabled:opacity-70">
          <div>
            <label htmlFor="tr-ref" className="mb-1 block text-xs font-semibold">
              رقم الطلب
            </label>
            <input
              id="tr-ref"
              required
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder="BAA-XXXXXXXX"
              dir="ltr"
              maxLength={12}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-mono tracking-wider"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              أرسلناه لك برسالة تأكيد بعد الحجز.
            </p>
          </div>

          <div>
            <label htmlFor="tr-phone" className="mb-1 block text-xs font-semibold">
              آخر 4 أرقام من جوالك
            </label>
            <input
              id="tr-phone"
              required
              value={phone4}
              onChange={(e) => setPhone4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              dir="ltr"
              inputMode="numeric"
              maxLength={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-mono tracking-wider"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              للتحقق من هويتك — لن نستخدمها لأي غرض آخر.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "جاري البحث..." : "عرض حالة الطلب"}
          </button>
          </fieldset>

          <p className="text-xs text-muted-foreground text-center pt-2">

            هل نسيت رقم الطلب؟{" "}
            <Link to="/lookup" className="text-primary font-semibold hover:underline">
              ابحث برقم الجوال بدلاً من ذلك
            </Link>
          </p>
        </form>

        <div className="space-y-4">
          {autoSearching && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3 text-sm text-primary"
            >
              <Loader2 className="h-5 w-5 animate-spin shrink-0" />
              <div>
                <div className="font-semibold">جاري فتح طلبك تلقائيًا…</div>
                <div className="text-xs text-primary/80 mt-0.5">
                  نبحث عن الطلب <span className="font-mono">{initialRef}</span> باستخدام آخر 4 أرقام من جوالك.
                </div>
              </div>
            </div>
          )}
          {autoFailed && !autoSearching && error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 flex items-start gap-3 text-sm"
            >
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-700 dark:text-amber-300">
                  تعذّر فتح الطلب تلقائيًا من الرابط
                </div>
                <p className="text-xs text-foreground/80 mt-1 leading-5">
                  {error.message} — يمكنك تعديل البيانات في النموذج ثم الضغط على «عرض حالة الطلب».
                </p>
              </div>
            </div>
          )}

          {loading && !appointment && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-border bg-card p-8"
            >
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                جاري البحث عن حالة طلبك...
              </div>
              <div className="mt-6 space-y-3 animate-pulse">
                <div className="h-16 rounded-xl bg-muted" />
                <div className="h-24 rounded-xl bg-muted" />
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-4 w-2/3 rounded bg-muted" />
              </div>
            </div>
          )}

          {!loading && !appointment && !error && (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground h-full grid place-items-center">
              <div>
                <Search className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                أدخل رقم الطلب لعرض حالة موعدك هنا.
              </div>
            </div>
          )}

          {!loading && error && !appointment && errorMeta && (
            <div
              role="alert"
              aria-live="assertive"
              className={`rounded-2xl border-2 p-8 text-center ${
                error.kind === "not_found"
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <div className="mx-auto mb-3 grid place-items-center">{errorMeta.icon}</div>
              <p
                className={`text-base font-bold ${
                  error.kind === "not_found" ? "text-amber-700 dark:text-amber-300" : "text-destructive"
                }`}
              >
                {errorMeta.title}
              </p>
              <p className="mt-2 text-sm text-foreground/80 leading-6">{error.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">{errorMeta.hint}</p>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {errorMeta.canRetry && lastQueryRef.current && (
                  <button
                    type="button"
                    onClick={onRetry}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    إعادة المحاولة
                  </button>
                )}
                {error.kind === "not_found" && (
                  <Link
                    to="/lookup"
                    className="inline-flex items-center gap-1.5 rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    <Search className="h-3.5 w-3.5" />
                    البحث برقم الجوال
                  </Link>
                )}
                <Link
                  to="/contact"
                  className="inline-flex items-center rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted"
                >
                  تواصل مع الاستقبال
                </Link>
              </div>
            </div>
          )}


          {appointment && status && (
            <div className="space-y-4">
              <div className={`rounded-2xl border-2 p-6 ${status.cls}`}>
                <div className="flex items-center gap-4">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-background/60">
                    {status.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs opacity-80">حالة الطلب</div>
                    <div className="text-2xl font-black">{status.label}</div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6">{status.note}</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-muted-foreground">رقم الطلب</div>
                    <div className="text-lg font-mono font-black tracking-wider">
                      {appointment.reference}
                    </div>
                  </div>
                </div>

                <dl className="grid gap-2 text-sm">
                  <DetailRow
                    icon={<User className="h-4 w-4" />}
                    label="المريض"
                    value={appointment.patient_name}
                  />
                  <DetailRow
                    icon={<CalendarDays className="h-4 w-4" />}
                    label="التاريخ"
                    value={formatArabicDate(appointment.appointment_date)}
                  />
                  <DetailRow
                    icon={<Clock3 className="h-4 w-4" />}
                    label="الوقت"
                    value={appointment.appointment_time?.slice(0, 5)}
                    mono
                  />
                  <DetailRow
                    icon={<Stethoscope className="h-4 w-4" />}
                    label="التخصص"
                    value={appointment.specialty_name_ar ?? "—"}
                  />
                  <DetailRow
                    icon={<User className="h-4 w-4" />}
                    label="الطبيب"
                    value={appointment.doctor_name_ar ?? "—"}
                  />
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadBookingConfirmationPdf({
                        reference: appointment.reference,
                        patient_name: appointment.patient_name,
                        appointment_date: appointment.appointment_date,
                        appointment_time: appointment.appointment_time,
                        doctor_name: appointment.doctor_name_ar ?? undefined,
                        specialty: appointment.specialty_name_ar ?? undefined,
                        status: status.label,
                        note: status.note,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Download className="h-3.5 w-3.5" />
                    تحميل تأكيد الحجز PDF
                  </button>
                  <Link
                    to="/book"
                    className="inline-flex items-center gap-1.5 rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    حجز موعد جديد
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    to="/contact"
                    className="inline-flex items-center rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    تواصل مع الاستقبال
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-1.5 last:border-none">
      <dt className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd
        className={`text-sm font-semibold text-end ${mono ? "font-mono" : ""}`}
        dir={mono ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
