import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CalendarPlus, CheckCircle2, Loader2, Copy, Download } from "lucide-react";
import { downloadBookingConfirmationPdf } from "@/lib/booking-pdf";
import { submitBooking, type BookingSubmitKind } from "@/lib/booking-submit";
import { SubmitErrorBanner } from "@/components/SubmitErrorBanner";

/**
 * Compact booking form embedded on excellence center detail pages.
 * Validates strictly client-side with Zod, then POSTs to
 * /api/public/book/create which re-validates + inserts into `appointments`.
 * DB triggers enqueue the patient's confirmation (in-app / push / SMS).
 */

const NAME_MIN = 2;
const NAME_MAX = 120;
const PHONE_MIN = 6;
const PHONE_MAX = 32;
const REASON_MAX = 400;
const PHONE_RE = /^[+0-9\s\-()]+$/;
// Saudi mobile validation: after stripping spaces/dashes/parens, accepts
// +9665XXXXXXXX, 009665XXXXXXXX, or local 05XXXXXXXX.
const SA_MOBILE_RE = /^(?:\+?966|00966|0)?5\d{8}$/;

const schema = z.object({
  patient_name: z
    .string()
    .trim()
    .min(NAME_MIN, "الاسم قصير جدًا (حرفان على الأقل)")
    .max(NAME_MAX, "الاسم طويل جدًا")
    .regex(/^[\p{L}\s'’.-]+$/u, "الاسم يحتوي على رموز غير مسموحة"),
  patient_phone: z
    .string()
    .trim()
    .min(PHONE_MIN, "رقم الهاتف قصير جدًا")
    .max(PHONE_MAX, "رقم الهاتف طويل جدًا")
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
    }, "لا يمكن اختيار تاريخ في الماضي")
    .refine((v) => {
      const d = new Date(v + "T00:00:00").getTime();
      const max = Date.now() + 1000 * 60 * 60 * 24 * 120;
      return d <= max;
    }, "التاريخ خارج فترة الحجز المتاحة (٤ أشهر)"),
  appointment_time: z.string().regex(/^\d{2}:\d{2}$/, "الوقت غير صالح"),
  reason: z
    .string()
    .trim()
    .max(REASON_MAX, `السبب طويل جدًا (${REASON_MAX} حرفًا كحد أقصى)`)
    .optional()
    .or(z.literal("")),
});

type FormState = {
  patient_name: string;
  patient_phone: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  reason: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

type Confirmation = {
  reference: string | null;
  centerName: string;
  service: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
};

const EMPTY: FormState = {
  patient_name: "",
  patient_phone: "",
  service: "",
  appointment_date: "",
  appointment_time: "",
  reason: "",
};

function formatArabicDate(iso: string): string {
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

export function CenterBookingForm({
  centerName,
  services,
}: {
  centerName: string;
  services: string[];
}) {
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<{
    kind: Exclude<BookingSubmitKind, "success">;
    message: string;
  } | null>(null);
  const lastPayloadRef = useRef<FormState | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function validateField(k: keyof FormState, value: string): string | undefined {
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
      // If the field already shows an error, re-validate live so it clears when fixed.
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

  async function doSubmit(data: FormState) {
    setSubmitting(true);
    setSubmitError(null);
    const toastId = toast.loading("جاري إرسال طلب الحجز...");
    try {
      const reason = [`[${centerName}]`, `الخدمة: ${data.service}`, data.reason?.trim()]
        .filter(Boolean)
        .join(" — ");
      const result = await submitBooking({
        patient_name: data.patient_name,
        patient_phone: data.patient_phone,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time,
        reason,
      });
      if (!result.ok) {
        setSubmitError({ kind: result.kind, message: result.message });
        toast.error(result.message, { id: toastId });
        return;
      }
      setConfirmation({
        reference: result.reference,
        centerName,
        service: data.service,
        patient_name: data.patient_name,
        patient_phone: data.patient_phone,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time,
      });
      setForm(EMPTY);
      setErrors({});
      lastPayloadRef.current = null;
      toast.success("تم استلام طلبك، سنرسل تأكيدًا برسالة قريبًا", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined;
        if (key && !fe[key]) fe[key] = issue.message;
      }
      setErrors(fe);
      const count = Object.keys(fe).length;
      const summary =
        count > 1
          ? `يرجى تصحيح ${count} حقول قبل الإرسال — راجع الرسائل الحمراء أسفل كل حقل.`
          : (parsed.error.issues[0]?.message ?? "يرجى مراجعة الحقول");
      setSubmitError({ kind: "validation", message: summary });
      toast.error(summary);
      // Focus the first invalid field for a11y.
      const firstKey = Object.keys(fe)[0] as keyof FormState | undefined;
      if (firstKey) {
        const el = document.getElementById(
          `ff-${firstKey === "patient_name" ? "name" : firstKey === "patient_phone" ? "phone" : firstKey === "appointment_date" ? "date" : firstKey === "appointment_time" ? "time" : firstKey}`,
        );
        el?.focus();
      }
      return;
    }

    lastPayloadRef.current = { ...parsed.data, reason: parsed.data.reason ?? "" };
    await doSubmit(lastPayloadRef.current);
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
            <h3 className="text-lg font-bold">تم استلام طلب الحجز بنجاح</h3>
            <p className="text-xs text-muted-foreground">
              سيصلك تأكيد نهائي عبر رسالة SMS خلال دقائق.
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
            سيصلك رقم الطلب في رسالة التأكيد على جوالك خلال دقائق. يمكنك بعدها تحميل تأكيد الحجز من
            صفحة <span className="font-semibold">"تتبّع طلبك"</span>.
          </div>
        )}

        <dl className="mt-4 grid gap-2 text-sm">
          <Row label="المركز" value={confirmation.centerName} />
          <Row label="الخدمة" value={confirmation.service} />
          <Row label="الاسم" value={confirmation.patient_name} />
          <Row label="الجوال" value={confirmation.patient_phone} />
          <Row label="التاريخ المتوقّع" value={formatArabicDate(confirmation.appointment_date)} />
          <Row label="الوقت المتوقّع" value={confirmation.appointment_time} />
        </dl>

        <p className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          ملاحظة: قد يتواصل معك المركز لتأكيد التوقيت النهائي حسب توفر الطبيب.
        </p>

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
                centerName: confirmation.centerName,
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
            حجز موعد آخر
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
      aria-label={`نموذج حجز موعد في ${centerName}`}
    >
      <div>
        <h3 className="text-lg font-bold">احجز موعدك في {centerName}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          أدخل بياناتك وسنرسل تأكيدًا للموعد على جوالك.
        </p>
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
        <Field label="الاسم الكامل" error={errors.patient_name} htmlFor="ff-name">
          <input
            id="ff-name"
            required
            value={form.patient_name}
            onChange={update("patient_name")}
            onBlur={onBlur("patient_name")}
            aria-invalid={!!errors.patient_name}
            aria-describedby={errors.patient_name ? "ff-name-err" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          />
        </Field>

        <Field
          label="رقم الجوال"
          error={errors.patient_phone}
          htmlFor="ff-phone"
          hint="مثال: 05XXXXXXXX"
        >
          <input
            id="ff-phone"
            required
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={form.patient_phone}
            onChange={update("patient_phone")}
            onBlur={onBlur("patient_phone")}
            aria-invalid={!!errors.patient_phone}
            aria-describedby={errors.patient_phone ? "ff-phone-err" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          />
        </Field>

        <Field label="نوع الخدمة" error={errors.service} htmlFor="ff-service">
          <select
            id="ff-service"
            required
            value={form.service}
            onChange={update("service")}
            onBlur={onBlur("service")}
            aria-invalid={!!errors.service}
            aria-describedby={errors.service ? "ff-service-err" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          >
            <option value="">— اختر الخدمة —</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="استشارة عامة">استشارة عامة</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="التاريخ" error={errors.appointment_date} htmlFor="ff-date">
            <input
              id="ff-date"
              required
              type="date"
              min={today}
              value={form.appointment_date}
              onChange={update("appointment_date")}
              onBlur={onBlur("appointment_date")}
              aria-invalid={!!errors.appointment_date}
              aria-describedby={errors.appointment_date ? "ff-date-err" : undefined}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
            />
          </Field>
          <Field label="الوقت" error={errors.appointment_time} htmlFor="ff-time">
            <input
              id="ff-time"
              required
              type="time"
              value={form.appointment_time}
              onChange={update("appointment_time")}
              onBlur={onBlur("appointment_time")}
              aria-invalid={!!errors.appointment_time}
              aria-describedby={errors.appointment_time ? "ff-time-err" : undefined}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
            />
          </Field>
        </div>

        <Field label="سبب الزيارة (اختياري)" error={errors.reason} htmlFor="ff-reason">
          <textarea
            id="ff-reason"
            rows={3}
            maxLength={REASON_MAX}
            value={form.reason}
            onChange={update("reason")}
            onBlur={onBlur("reason")}
            aria-invalid={!!errors.reason}
            aria-describedby={errors.reason ? "ff-reason-err" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm aria-[invalid=true]:border-destructive"
          />
        </Field>
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
        {submitting ? "جاري الإرسال..." : "إرسال طلب الحجز"}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-1.5 last:border-none last:pb-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-right">{value}</dd>
    </div>
  );
}
