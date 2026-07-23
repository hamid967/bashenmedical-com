/**
 * Public appointment verification page.
 *
 * Reads only the PUBLIC reference number from the URL (?ref=BMC-...).
 * Requires the last 4 digits of the patient phone as a shared secret
 * before showing non-PII appointment details. No database id is ever
 * accepted or displayed.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";

const search = z.object({
  ref: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^BMC-\d{8}-[0-9A-Z]{4}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/verify")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "التحقق من الحجز — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "تحقّق من صحة موعدك بإدخال رقم الحجز العام وآخر 4 أرقام من رقم الجوّال.",
      },
      { property: "og:title", content: "التحقق من الحجز — مجمع باعشن الطبي" },
      {
        property: "og:description",
        content: "صفحة تحقق آمنة تعرض حالة الموعد دون أي بيانات شخصية حساسة.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: VerifyPage,
});

type VerifyResult = {
  reference: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  doctor: { name_ar: string | null; name_en: string | null };
  branch: { name_ar: string | null; name_en: string | null };
  specialty: { name_ar: string | null; name_en: string | null };
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new: { label: "جديد", cls: "bg-teal-100 text-teal-800" },
  confirmed: { label: "مؤكّد", cls: "bg-emerald-100 text-emerald-800" },
  checked_in: { label: "تم الحضور", cls: "bg-sky-100 text-sky-800" },
  in_progress: { label: "قيد الكشف", cls: "bg-indigo-100 text-indigo-800" },
  completed: { label: "مكتمل", cls: "bg-primary/15 text-primary" },
  cancelled: { label: "ملغى", cls: "bg-rose-100 text-rose-800" },
  no_show: { label: "لم يحضر", cls: "bg-amber-100 text-amber-800" },
};

function VerifyPage() {
  const { ref } = Route.useSearch();
  const [reference, setReference] = useState(ref ?? "");
  const [last4, setLast4] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (ref) setReference(ref);
  }, [ref]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!/^BMC-\d{8}-[0-9A-Z]{4}$/.test(reference.trim().toUpperCase())) {
      setError("رقم الحجز غير صالح — الصيغة BMC-YYYYMMDD-XXXX");
      return;
    }
    if (!/^\d{4}$/.test(last4.trim())) {
      setError("أدخل آخر 4 أرقام من رقم الجوّال");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/public/appointments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: reference.trim().toUpperCase(),
          phone_last4: last4.trim(),
        }),
      });
      const body = (await res.json()) as
        | { ok: true; appointment: VerifyResult }
        | { ok: false; message: string };
      if (!body.ok) {
        setError(body.message);
        return;
      }
      setResult(body.appointment);
    } catch {
      setError("تعذّر الاتصال، حاول مجدداً.");
    } finally {
      setLoading(false);
    }
  }

  const meta = result ? (STATUS_LABEL[result.status] ?? { label: result.status, cls: "bg-slate-100 text-slate-700" }) : null;

  return (
    <main className="min-h-screen bg-muted/30 py-10">
      <div className="container-app max-w-lg">
        <header className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-primary font-bold">
            <ShieldCheck className="h-5 w-5" /> التحقق من الحجز
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            صفحة عامة لا تعرض أي معرّف قاعدة بيانات أو بيانات شخصية.
          </p>
        </header>

        <form
          onSubmit={submit}
          className="rounded-2xl bg-white p-5 shadow-sm border space-y-4"
        >
          <div>
            <label className="text-sm font-semibold">رقم الحجز العام</label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder="BMC-YYYYMMDD-XXXX"
              dir="ltr"
              className="mt-1 font-mono"
              maxLength={20}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-sm font-semibold">آخر 4 أرقام من الجوّال</label>
            <Input
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              dir="ltr"
              inputMode="numeric"
              className="mt-1 font-mono"
              maxLength={4}
              autoComplete="off"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 flex items-start gap-2">
              <XCircle className="h-4 w-4 mt-0.5" /> <span>{error}</span>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "جارٍ التحقق…" : "تحقق الآن"}
          </Button>
        </form>

        {result && meta && (
          <section
            aria-live="polite"
            className="mt-5 rounded-2xl bg-white p-5 shadow-sm border"
          >
            <div className="flex items-center gap-2 text-emerald-700 font-bold">
              <CheckCircle2 className="h-5 w-5" /> تم التحقق من الحجز
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">رقم الحجز</dt>
                <dd className="font-mono font-bold" dir="ltr">
                  {result.reference}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">الحالة</dt>
                <dd>
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-4 w-4" /> التاريخ
                </dt>
                <dd className="font-semibold" dir="ltr">
                  {result.appointment_date}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" /> الوقت
                </dt>
                <dd className="font-semibold" dir="ltr">
                  {String(result.appointment_time).slice(0, 5)}
                </dd>
              </div>
              {result.doctor.name_ar && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">الطبيب</dt>
                  <dd className="font-semibold">{result.doctor.name_ar}</dd>
                </div>
              )}
              {result.specialty.name_ar && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">التخصص</dt>
                  <dd>{result.specialty.name_ar}</dd>
                </div>
              )}
              {result.branch.name_ar && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">الفرع</dt>
                  <dd>{result.branch.name_ar}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </div>
    </main>
  );
}
