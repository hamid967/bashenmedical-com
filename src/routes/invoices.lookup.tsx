/**
 * استعلام الفاتورة — /invoices/lookup
 *
 * Public page: enter phone → receive 6-digit OTP → enter invoice number →
 * view status + download PDF. Reuses the shared phone-OTP endpoints:
 *   POST /api/public/reservations/otp/send
 *   POST /api/public/reservations/otp/verify
 *   POST /api/public/invoices/lookup
 *
 * Session token lives 30 min and is kept in sessionStorage only.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Phone,
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Download,
  FileText,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/invoices/lookup")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "استعلام الفاتورة | مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "استعلم عن فاتورتك برقم مرجعي مع تحقق سريع عبر رمز OTP، وشاهد حالة السداد وحمّل الوثيقة.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LookupPage,
});

const SESSION_KEY = "bmc-inv-session";

const STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: "مدفوعة", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pending: { label: "قيد السداد", color: "bg-amber-100 text-amber-700 border-amber-200" },
  unpaid: { label: "غير مسددة", color: "bg-amber-100 text-amber-700 border-amber-200" },
  overdue: { label: "متأخرة السداد", color: "bg-red-100 text-red-700 border-red-200" },
  cancelled: { label: "ملغاة", color: "bg-gray-100 text-gray-700 border-gray-200" },
  refunded: { label: "مستردة", color: "bg-blue-100 text-blue-700 border-blue-200" },
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  total: number;
  currency: string;
  status: string;
  issued_at: string;
  paid_at: string | null;
  notes: string | null;
  patient_name: string | null;
  pdf_url: string | null;
  pdf_expires_in: number | null;
};

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function LookupPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "lookup">("phone");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Restore session after hydration
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { token: string; expires_at: string; masked?: string };
      if (new Date(s.expires_at).getTime() > Date.now()) {
        setSessionToken(s.token);
        setPhoneMasked(s.masked ?? "");
        setStep("lookup");
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function reset() {
    sessionStorage.removeItem(SESSION_KEY);
    setSessionToken(null);
    setPhone("");
    setCode("");
    setInvoiceNumber("");
    setInvoice(null);
    setDevCode(null);
    setPhoneMasked("");
    setErrorMsg(null);
    setOkMsg(null);
    setStep("phone");
  }

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setErrorMsg(null);
    setOkMsg(null);
    setBusy(true);
    try {
      const r = await apiPost<{
        ok: boolean;
        message?: string;
        phone_masked?: string;
        dev_code?: string;
      }>("/api/public/reservations/otp/send", { phone });
      if (!r.ok) {
        setErrorMsg(r.message ?? "تعذّر إرسال الرمز.");
        return;
      }
      setPhoneMasked(r.phone_masked ?? phone);
      setDevCode(r.dev_code ?? null);
      setOkMsg("أرسلنا رمز تحقق إلى جوالك.");
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setErrorMsg(null);
    setOkMsg(null);
    setBusy(true);
    try {
      const r = await apiPost<{
        ok: boolean;
        message?: string;
        session_token?: string;
        session_expires_at?: string;
      }>("/api/public/reservations/otp/verify", { phone, code });
      if (!r.ok || !r.session_token) {
        setErrorMsg(r.message ?? "الرمز غير صحيح.");
        return;
      }
      setSessionToken(r.session_token);
      try {
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            token: r.session_token,
            expires_at: r.session_expires_at,
            masked: phoneMasked,
          }),
        );
      } catch {
        /* ignore */
      }
      setStep("lookup");
    } finally {
      setBusy(false);
    }
  }

  async function lookupInvoice(e?: React.FormEvent) {
    e?.preventDefault();
    setErrorMsg(null);
    setOkMsg(null);
    setInvoice(null);
    if (!sessionToken) {
      reset();
      return;
    }
    setBusy(true);
    try {
      const r = await apiPost<{
        ok: boolean;
        message?: string;
        invoice?: Invoice;
      }>("/api/public/invoices/lookup", {
        session_token: sessionToken,
        invoice_number: invoiceNumber.trim(),
      });
      if (!r.ok || !r.invoice) {
        if (r.message?.includes("انتهت الجلسة")) reset();
        setErrorMsg(r.message ?? "لم نجد الفاتورة.");
        return;
      }
      setInvoice(r.invoice);
    } finally {
      setBusy(false);
    }
  }

  const st = invoice
    ? (STATUS[invoice.status] ?? {
        label: invoice.status,
        color: "bg-gray-100 text-gray-700 border-gray-200",
      })
    : null;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-b from-background via-background to-muted/40"
    >
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <header className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4" />
            العودة للرئيسية
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">استعلام الفاتورة</h1>
          <p className="mt-2 text-muted-foreground">
            أدخل رقم جوالك للتحقق، ثم أدخل رقم الفاتورة لعرض الحالة وتحميل الوثيقة.
          </p>
        </header>

        {errorMsg && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {okMsg && !errorMsg && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{okMsg}</span>
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {step === "phone" && (
            <form onSubmit={sendOtp} className="space-y-4">
              <div>
                <Label htmlFor="phone" className="mb-2 flex items-center gap-2">
                  <Phone className="h-4 w-4" /> رقم الجوال
                </Label>
                <Input
                  id="phone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="05XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  dir="ltr"
                  className="text-left"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  سنرسل رمز تحقق مكوّن من 6 أرقام.
                </p>
              </div>
              <Button type="submit" disabled={busy || !phone} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال رمز التحقق"}
              </Button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                أرسلنا الرمز إلى{" "}
                <span dir="ltr" className="font-mono">
                  {phoneMasked}
                </span>
                .
              </div>
              {devCode && (
                <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                  رمز التطوير: <span className="font-mono">{devCode}</span>
                </div>
              )}
              <div>
                <Label htmlFor="code" className="mb-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> رمز التحقق
                </Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="\d{6}"
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  dir="ltr"
                  className="text-center text-lg tracking-[0.5em]"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || code.length !== 6} className="flex-1">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحقّق"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep("phone");
                    setCode("");
                  }}
                >
                  تغيير الرقم
                </Button>
              </div>
            </form>
          )}

          {step === "lookup" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3 text-sm">
                <div>
                  تم التحقق للجوال{" "}
                  <span dir="ltr" className="font-mono">
                    {phoneMasked}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <LogOut className="h-4 w-4 ml-1" /> تسجيل خروج
                </Button>
              </div>

              <form onSubmit={lookupInvoice} className="space-y-3">
                <Label htmlFor="inv" className="flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> الرقم المرجعي للفاتورة
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="inv"
                    placeholder="مثال: INV-2026-000123"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    required
                    dir="ltr"
                    className="text-left font-mono"
                  />
                  <Button type="submit" disabled={busy || !invoiceNumber.trim()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "استعلم"}
                  </Button>
                </div>
              </form>

              {invoice && st && (
                <article className="rounded-xl border border-border bg-background p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.color}`}
                        >
                          {st.label}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {invoice.invoice_number ?? invoice.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-2 text-2xl font-bold">
                        {invoice.total.toLocaleString("ar-SA")} {invoice.currency}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        صدرت في {formatDate(invoice.issued_at)}
                        {invoice.paid_at && ` • دُفعت في ${formatDate(invoice.paid_at)}`}
                      </div>
                      {invoice.patient_name && (
                        <div className="mt-2 text-sm">
                          <span className="text-muted-foreground">المريض: </span>
                          {invoice.patient_name}
                        </div>
                      )}
                      {invoice.notes && (
                        <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">
                          {invoice.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {invoice.pdf_url ? (
                        <a
                          href={invoice.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                        >
                          <Download className="h-4 w-4" />
                          تحميل PDF
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                          <FileText className="h-4 w-4" />
                          لا توجد وثيقة مرفقة
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => lookupInvoice()}
                        className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <RefreshCw className="h-3 w-3" /> تحديث الرابط
                      </button>
                    </div>
                  </div>
                </article>
              )}
            </div>
          )}
        </section>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          للمساعدة، تواصل معنا عبر{" "}
          <Link to="/contact" className="underline hover:text-foreground">
            صفحة التواصل
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
