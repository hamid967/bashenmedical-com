/**
 * Public route — /insurance/verify
 *
 * Dedicated NPHIES eligibility checker (Arabic-first). Lets a patient
 * verify insurance coverage for a specific doctor before starting a
 * booking. It's the same NPHIES adapter path used inside /book, but
 * exposed as a standalone screen with a clear data flow:
 *
 *   UI (this page)
 *     → POST /api/public/insurance/verify
 *       → src/lib/nphies/adapter.server.ts → checkEligibility()
 *         → driver: mock | sandbox | live (env NPHIES_MODE)
 *         → audit row in public.nphies_requests
 *       ← { eligible, coverage_percent, consultation_fee, patient_share, ... }
 *     ← rendered breakdown card
 *
 * No PHI is persisted from this page; the audit row lives in the API
 * layer and only contains what the adapter chooses to log.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, Wallet, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Provider = { id: string; name_ar: string; name_en: string };

type EligibilityResponse = {
  ok: boolean;
  eligible?: boolean;
  reason?: string;
  message?: string;
  coverage_percent?: number | null;
  consultation_fee?: number | null;
  covered_amount?: number | null;
  patient_share?: number | null;
  source?: "mock" | "sandbox" | "live";
};

async function fetchProviders(): Promise<Provider[]> {
  const { data, error } = await supabase
    .from("insurance_providers")
    .select("id, name_ar, name_en")
    .eq("active", true)
    .order("name_ar");
  if (error) return [];
  return (data ?? []) as Provider[];
}

async function fetchDoctors() {
  const { data, error } = await supabase
    .from("doctors")
    .select("id, name_ar, name_en, is_active")
    .eq("is_active", true)
    .order("name_ar");
  if (error) return [];
  return data as Array<{ id: string; name_ar: string; name_en: string }>;
}

export const Route = createFileRoute("/insurance/verify")({
  head: () => ({
    meta: [
      { title: "التحقق من تغطية التأمين (NPHIES) — باعشن الطبي" },
      {
        name: "description",
        content:
          "تحقّق من أهلية تأمينك الصحي وتقدير التكلفة قبل الحجز عبر منصة NPHIES.",
      },
      { property: "og:title", content: "التحقق من تغطية التأمين (NPHIES) — باعشن الطبي" },
      {
        property: "og:description",
        content:
          "تحقّق من أهلية تأمينك الصحي وتقدير التكلفة قبل الحجز عبر منصة NPHIES.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: InsuranceVerifyPage,
});

function InsuranceVerifyPage() {
  const [doctorId, setDoctorId] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");
  const [policy, setPolicy] = useState("");
  const [memberId, setMemberId] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EligibilityResponse | null>(null);

  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: ["insurance-providers-standalone"],
    queryFn: fetchProviders,
    staleTime: 5 * 60 * 1000,
  });
  const { data: doctors = [], isLoading: loadingDoctors } = useQuery({
    queryKey: ["doctors-standalone-insurance"],
    queryFn: fetchDoctors,
    staleTime: 5 * 60 * 1000,
  });

  const canSubmit = useMemo(
    () => !!doctorId && !!providerId && !loading,
    [doctorId, providerId, loading],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/public/insurance/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctor_id: doctorId,
          provider_id: providerId,
          policy_number: policy || undefined,
          member_id: memberId || undefined,
          patient_national_id: nationalId || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as EligibilityResponse | null;
      if (!body || body.ok === false) {
        setError(
          (body as { message?: string } | null)?.message ??
            "تعذّر التحقق من الأهلية حاليًا. حاول مجددًا.",
        );
        return;
      }
      setResult(body);
    } catch {
      setError("خطأ في الشبكة. حاول مجددًا.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-7 w-7 text-primary" />
            التحقق من تغطية التأمين
          </h1>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            العودة للرئيسية
          </Link>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          تحقق من أهلية تأمينك الصحي وتقدير حصتك من التكلفة قبل الحجز. النتائج
          تصدر عبر منصة <span className="font-semibold">NPHIES</span> ولن تُحفظ
          بياناتك الشخصية على هذه الصفحة.
        </p>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border bg-card p-5 sm:p-6 space-y-4 shadow-sm"
        >
          <label className="block">
            <span className="text-xs font-semibold mb-1.5 block">
              الطبيب <span className="text-destructive">*</span>
            </span>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              disabled={loadingDoctors}
              required
              className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">اختر الطبيب…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_ar || d.name_en}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold mb-1.5 block">
              جهة التأمين <span className="text-destructive">*</span>
            </span>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              disabled={loadingProviders}
              required
              className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">اختر جهة التأمين…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_ar || p.name_en}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold mb-1.5 block">رقم البوليصة</span>
              <input
                value={policy}
                onChange={(e) => setPolicy(e.target.value.slice(0, 64))}
                dir="ltr"
                placeholder="POL-XXXXX"
                className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold mb-1.5 block">رقم العضوية</span>
              <input
                value={memberId}
                onChange={(e) => setMemberId(e.target.value.slice(0, 64))}
                dir="ltr"
                placeholder="MEM-XXXXX"
                className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold mb-1.5 block">
              رقم الهوية / الإقامة (اختياري)
            </span>
            <input
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value.slice(0, 32))}
              dir="ltr"
              inputMode="numeric"
              placeholder="1XXXXXXXXX"
              className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ التحقق…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                التحقق من الأهلية
              </>
            )}
          </button>

          {error && (
            <div className="text-xs text-destructive flex items-center gap-1">
              <ShieldAlert className="h-4 w-4" />
              {error}
            </div>
          )}
        </form>

        {result && (
          <div
            className={`rounded-2xl border-2 p-5 sm:p-6 space-y-3 ${
              result.eligible
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-amber-500/40 bg-amber-500/5"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {result.eligible ? (
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-amber-600" />
              )}
              {result.eligible ? "التأمين مؤهل" : "الأهلية غير مؤكدة"}
            </div>
            {result.message && (
              <p className="text-sm text-muted-foreground">{result.message}</p>
            )}
            {result.eligible && (
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <Stat label="التغطية" value={fmtPct(result.coverage_percent)} />
                <Stat label="الرسوم" value={fmtSar(result.consultation_fee)} />
                <Stat label="المُغطّى" value={fmtSar(result.covered_amount)} />
                <Stat label="حصتك" value={fmtSar(result.patient_share)} highlight />
              </dl>
            )}
            <div className="pt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>المصدر: {sourceLabel(result.source)}</span>
              {result.reason && <span>· السبب: {result.reason}</span>}
            </div>
            {result.eligible && (
              <div className="pt-2">
                <Link
                  to="/book"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
                >
                  تابع الحجز الآن
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-background/60 border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-bold ${highlight ? "text-primary" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function fmtSar(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Number(v).toLocaleString("ar-SA")} ر.س`;
}
function fmtPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Number(v).toLocaleString("ar-SA")}%`;
}
function sourceLabel(s: EligibilityResponse["source"]) {
  if (s === "live") return "NPHIES (حي)";
  if (s === "sandbox") return "NPHIES (تجريبي)";
  return "تقدير داخلي";
}
