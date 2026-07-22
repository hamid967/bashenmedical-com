import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CalendarPlus, CheckCircle2, Copy, Download, Loader2 } from "lucide-react";
import { downloadBookingConfirmationPdf } from "@/lib/booking-pdf";
import { submitBooking, type BookingSubmitKind } from "@/lib/booking-submit";
import { SubmitErrorBanner } from "@/components/SubmitErrorBanner";

/**
 * Generic service-request form used by advanced-service pages
 * (home-care, telemedicine, international-patients, etc.).
 *
 * Posts to /api/public/book/create — the same endpoint used by the main
 * booking flow. The `tag` prop is prefixed on `reason` so admins can
 * quickly filter by service type in the appointments queue.
 */

const NAME_MAX = 120;
const REASON_MAX = 400;
const PHONE_RE = /^[+0-9\s\-()]+$/;
const SA_MOBILE_RE = /^(?:\+?966|00966|0)?5\d{8}$/;

const schema = z.object({
  patient_name: z
    .string()
    .trim()
    .min(2, "الاسم قصير جدًا")
    .max(NAME_MAX, "الاسم طويل جدًا")
    .regex(/^[\p{L}\s'’.-]+$/u, "الاسم يحتوي على رموز غير مسموحة"),
  patient_phone: z
    .string()
    .trim()
    .min(6, "رقم الهاتف قصير جدًا")
    .max(32, "رقم الهاتف طويل جدًا")
    .regex(PHONE_RE, "الهاتف يحتوي على أحرف غير مسموحة")
    .refine(
      (v) => SA_MOBILE_RE.test(v.replace(/[\s\-()]/g, "")),
      "أدخل رقم جوال سعودي صحيح (05XXXXXXXX)",
    ),
  service: z.string().trim().min(1, "اختر نوع الخدمة"),
  appointment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صالح")
    .refine((v) => {
      const d = new Date(v + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d.getTime() >= today.getTime();
    }, "لا يمكن اختيار تاريخ في الماضي"),
  appointment_time: z.string().regex(/^\d{2}:\d{2}$/, "الوقت غير صالح"),
  extra: z.string().trim().max(REASON_MAX, `الحقل طويل جدًا`).optional().or(z.literal("")),
});

type FormState = {
  patient_name: string;
  patient_phone: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  extra: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = {
  patient_name: "",
  patient_phone: "",
  service: "",
  appointment_date: "",
  appointment_time: "",
  extra: "",
};

export function ServiceRequestForm({
  tag,
  title,
  subtitle,
  services,
  extraLabel,
  extraPlaceholder,
  extraRequired,
  refPrefix = "REQ",
  timeLabel = "الوقت المفضّل",
  dateLabel = "التاريخ المفضّل",
  submitLabel = "إرسال الطلب",
}: {
  tag: string;
  title: string;
  subtitle?: string;
  services: string[];
  extraLabel?: string;
  extraPlaceholder?: string;
  extraRequired?: boolean;
  refPrefix?: string;
  timeLabel?: string;
  dateLabel?: string;
  submitLabel?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<
    (FormState & { reference: string | null }) | null
  >(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<{
    kind: Exclude<BookingSubmitKind, "success">;
    message: string;
  } | null>(null);
  const lastPayloadRef = useRef<FormState | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function validateField(k: keyof FormState, value: string): string | undefined {
    if (k === "extra") {
      if (extraRequired && !value.trim()) return "هذا الحقل مطلوب";
      const r = schema.shape.extra.safeParse(value);
      return r.success ? undefined : r.error.issues[0]?.message;
    }
    const fieldSchema = (schema.shape as Record<string, z.ZodTypeAny>)[k];
    if (!fieldSchema) return undefined;
    const r = fieldSchema.safeParse(value);
    return r.success ? undefined : r.error.issues[0]?.message;
  }

  const update =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((s) => ({ ...s, [k]: value }));
      if (errors[k]) {
        const msg = validateField(k, value);
        setErrors((prev) => ({ ...prev, [k]: msg }));
      }
      if (submitError && submitError.kind === "validation") setSubmitError(null);
    };

  const onBlur = (k: keyof FormState) => () => {
    const msg = validateField(k, form[k]);
    setErrors((prev) => ({ ...prev, [k]: msg }));
  };

  async function doSubmit(d: FormState) {
    setSubmitting(true);
    setSubmitError(null);
    const toastId = toast.loading("جاري إرسال طلبك...");
    try {
      const reason = [`[${tag}]`, `الخدمة: ${d.service}`, d.extra?.trim()]
        .filter(Boolean)
        .join(" — ");
      const result = await submitBooking({
        patient_name: d.patient_name,
        patient_phone: d.patient_phone,
        appointment_date: d.appointment_date,
        appointment_time: d.appointment_time,
        reason,
      });
      if (!result.ok) {
        setSubmitError({ kind: result.kind, message: result.message });
        toast.error(result.message, { id: toastId });
        return;
      }
      setConfirmation({
        ...d,
        reference: result.reference,
      });
      setForm(EMPTY);
      setErrors({});
      lastPayloadRef.current = null;
      toast.success("تم استلام طلبك، سنتواصل معك للتأكيد قريبًا", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = schema.safeParse(form);
    const fe: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined;
        if (key && !fe[key]) fe[key] = issue.message;
      }
    }
    if (extraRequired && !form.extra.trim()) {
      fe.extra = "هذا الحقل مطلوب";
    }
    if (Object.keys(fe).length > 0) {
      setErrors(fe);
      const count = Object.keys(fe).length;
      const summary =
        count > 1
          ? `يرجى تصحيح ${count} حقول قبل الإرسال — راجع الرسائل الحمراء أسفل كل حقل.`
          : (Object.values(fe)[0] ?? "يرجى مراجعة الحقول");
      setSubmitError({ kind: "validation", message: summary });
      toast.error(summary);
      const firstKey = Object.keys(fe)[0] as keyof FormState | undefined;
      if (firstKey) {
        const idMap: Record<keyof FormState, string> = {
          patient_name: "srf-name",
          patient_phone: "srf-phone",
          service: "srf-service",
          appointment_date: "srf-date",
          appointment_time: "srf-time",
          extra: "srf-extra",
        };
        document.getElementById(idMap[firstKey])?.focus();
      }
      return;
    }

    const data = parsed.success ? parsed.data : form;
    const payload: FormState = {
      patient_name: data.patient_name ?? form.patient_name,
      patient_phone: data.patient_phone ?? form.patient_phone,
      service: data.service ?? form.service,
      appointment_date: data.appointment_date ?? form.appointment_date,
      appointment_time: data.appointment_time ?? form.appointment_time,
      extra: (data.extra ?? form.extra) || "",
    };
    lastPayloadRef.current = payload;
    await doSubmit(payload);
  }

  function onRetry() {
    if (submitting) return;
    const last = lastPayloadRef.current;
    if (last) void doSubmit(last);
  }

  if (confirmation) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-accent/5 p-6"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold">تم استلام طلبك بنجاح</h3>
            <p className="text-xs text-muted-foreground">
              سيتواصل معك فريقنا للتأكيد وترتيب التفاصيل.
            </p>
          </div>
        </div>
        {confirmation.reference ? (
          <div className="mt-5 rounded-xl border border-border bg-background/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">رقم الطلب</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(confirmation.reference!).then(
                    () => toast.success("تم نسخ رقم الطلب"),
                    () => toast.error("تعذّر النسخ"),
                  );
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Copy className="h-3 w-3" />
                نسخ
              </button>
            </div>
            <div className="mt-1 text-lg font-mono font-bold tracking-wider">
              {confirmation.reference}
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-background/60 p-4 text-xs text-muted-foreground">
            سيصلك رقم الطلب في رسالة التأكيد على جوالك خلال دقائق، وستتمكن حينها من تحميل تأكيد
            الحجز من صفحة <span className="font-semibold">"تتبّع طلبك"</span>.
          </div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={!confirmation.reference}
            title={confirmation.reference ? undefined : "سيتوفر التحميل بعد استلام رقم الطلب"}
            onClick={() => {
              if (!confirmation.reference) return;
              downloadBookingConfirmationPdf({
                reference: confirmation.reference,
                patient_name: confirmation.patient_name,
                patient_phone: confirmation.patient_phone,
                appointment_date: confirmation.appointment_date,
                appointment_time: confirmation.appointment_time,
                service: confirmation.service,
                centerName: tag,
              });
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            تحميل تأكيد الحجز PDF
          </button>
          <button
            type="button"
            onClick={() => setConfirmation(null)}
            className="inline-flex items-center justify-center rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            إرسال طلب آخر
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={submitting}
      className="rounded-2xl border border-border bg-card p-6 space-y-3"
      aria-label={title}
    >
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      {submitError && (
        <SubmitErrorBanner
          kind={submitError.kind}
          message={submitError.message}
          onRetry={onRetry}
          retrying={submitting}
        />
      )}

      <fieldset
        disabled={submitting}
        className="space-y-3 text-sm border-0 p-0 m-0 disabled:opacity-70"
      >
        <Field label="الاسم الكامل" error={errors.patient_name} htmlFor="srf-name">
          <input
            id="srf-name"
            required
            value={form.patient_name}
            onChange={update("patient_name")}
            onBlur={onBlur("patient_name")}
            aria-invalid={!!errors.patient_name}
            aria-describedby={errors.patient_name ? "srf-name-err" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          />
        </Field>

        <Field
          label="رقم الجوال"
          error={errors.patient_phone}
          htmlFor="srf-phone"
          hint="مثال: 05XXXXXXXX"
        >
          <input
            id="srf-phone"
            required
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={form.patient_phone}
            onChange={update("patient_phone")}
            onBlur={onBlur("patient_phone")}
            aria-invalid={!!errors.patient_phone}
            aria-describedby={errors.patient_phone ? "srf-phone-err" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          />
        </Field>

        <Field label="نوع الخدمة" error={errors.service} htmlFor="srf-service">
          <select
            id="srf-service"
            required
            value={form.service}
            onChange={update("service")}
            onBlur={onBlur("service")}
            aria-invalid={!!errors.service}
            aria-describedby={errors.service ? "srf-service-err" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          >
            <option value="">— اختر الخدمة —</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={dateLabel} error={errors.appointment_date} htmlFor="srf-date">
            <input
              id="srf-date"
              required
              type="date"
              min={today}
              value={form.appointment_date}
              onChange={update("appointment_date")}
              onBlur={onBlur("appointment_date")}
              aria-invalid={!!errors.appointment_date}
              aria-describedby={errors.appointment_date ? "srf-date-err" : undefined}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
            />
          </Field>
          <Field label={timeLabel} error={errors.appointment_time} htmlFor="srf-time">
            <input
              id="srf-time"
              required
              type="time"
              value={form.appointment_time}
              onChange={update("appointment_time")}
              onBlur={onBlur("appointment_time")}
              aria-invalid={!!errors.appointment_time}
              aria-describedby={errors.appointment_time ? "srf-time-err" : undefined}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
            />
          </Field>
        </div>

        {extraLabel && (
          <Field label={extraLabel} error={errors.extra} htmlFor="srf-extra">
            <textarea
              id="srf-extra"
              rows={3}
              maxLength={REASON_MAX}
              placeholder={extraPlaceholder}
              value={form.extra}
              onChange={update("extra")}
              onBlur={onBlur("extra")}
              aria-invalid={!!errors.extra}
              aria-describedby={errors.extra ? "srf-extra-err" : undefined}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
            />
          </Field>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarPlus className="h-4 w-4" />
        )}
        {submitting ? "جاري الإرسال..." : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  const errId = `${htmlFor}-err`;
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={errId} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
