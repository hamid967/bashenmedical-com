/**
 * Insurance selection + eligibility check for the /book wizard.
 * Renders in StepPatient. Fetches active providers, calls
 * /api/public/insurance/verify on demand, and writes the estimate back
 * onto State.patient so StepReview and the submit payload can use it.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck, ShieldAlert, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { InsuranceEstimate, PayerType, State } from "./types";

type Provider = { id: string; name_ar: string; name_en: string };

async function fetchProviders(): Promise<Provider[]> {
  const { data, error } = await supabase
    .from("insurance_providers")
    .select("id, name_ar, name_en")
    .eq("active", true)
    .order("name_ar");
  if (error) return [];
  return (data ?? []) as Provider[];
}

async function verifyInsurance(input: {
  doctor_id: string;
  provider_id: string;
  policy_number?: string;
  member_id?: string;
}): Promise<InsuranceEstimate> {
  const res = await fetch("/api/public/insurance/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as
    | (InsuranceEstimate & { ok?: boolean })
    | null;
  if (!body || body.ok === false) return null;
  return body;
}

export function InsuranceSection({
  lang,
  doctorId,
  value,
  onChange,
}: {
  lang: "ar" | "en";
  doctorId: string | null;
  value: State["patient"];
  onChange: (p: Partial<State["patient"]>) => void;
}) {
  const { t } = useTranslation("booking");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: ["insurance-providers"],
    queryFn: fetchProviders,
    staleTime: 5 * 60 * 1000,
  });

  // Any change to provider/policy/member invalidates a previous estimate.
  useEffect(() => {
    if (value.insuranceEstimate) onChange({ insuranceEstimate: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.insuranceProviderId, value.insurancePolicyNumber, value.insuranceMemberId]);

  async function handleVerify() {
    if (!doctorId || !value.insuranceProviderId) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const est = await verifyInsurance({
        doctor_id: doctorId,
        provider_id: value.insuranceProviderId,
        policy_number: value.insurancePolicyNumber || undefined,
        member_id: value.insuranceMemberId || undefined,
      });
      if (!est) {
        setVerifyError(t("insurance.verifyFailed"));
        return;
      }
      onChange({ insuranceEstimate: est });
    } catch {
      setVerifyError(t("insurance.network"));
    } finally {
      setVerifying(false);
    }
  }

  const est = value.insuranceEstimate;
  const canVerify =
    !!doctorId && !!value.insuranceProviderId && !verifying;

  return (
    <div className="sm:col-span-2 rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <Wallet className="h-4 w-4 text-primary" />
        {t("insurance.title")}
      </div>

      {/* Payer type toggle */}
      <div
        role="radiogroup"
        aria-label={t("insurance.title")}
        className="grid grid-cols-2 gap-2"
      >
        {(["self", "insurance"] as PayerType[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value.payerType === p}
            onClick={() =>
              onChange({
                payerType: p,
                ...(p === "self"
                  ? {
                      insuranceProviderId: null,
                      insurancePolicyNumber: "",
                      insuranceMemberId: "",
                      insuranceEstimate: null,
                    }
                  : {}),
              })
            }
            className={`rounded-lg border-2 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              value.payerType === p
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:border-primary/50"
            }`}
          >
            {t(`insurance.${p}`)}
          </button>
        ))}
      </div>

      {value.payerType === "insurance" && (
        <div className="space-y-3 pt-1">
          <label className="block">
            <span className="text-xs font-semibold mb-1.5 block">
              {t("insurance.provider")}
              <span className="text-destructive"> *</span>
            </span>
            <select
              value={value.insuranceProviderId ?? ""}
              onChange={(e) =>
                onChange({ insuranceProviderId: e.target.value || null })
              }
              disabled={loadingProviders}
              className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">{t("insurance.selectProvider")}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {lang === "ar" ? p.name_ar : p.name_en}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold mb-1.5 block">
                {t("insurance.policyNumber")}
              </span>
              <input
                value={value.insurancePolicyNumber}
                onChange={(e) =>
                  onChange({
                    insurancePolicyNumber: e.target.value.slice(0, 64),
                  })
                }
                dir="ltr"
                placeholder="POL-XXXXX"
                className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold mb-1.5 block">
                {t("insurance.memberId")}
              </span>
              <input
                value={value.insuranceMemberId}
                onChange={(e) =>
                  onChange({
                    insuranceMemberId: e.target.value.slice(0, 64),
                  })
                }
                dir="ltr"
                placeholder="MEM-XXXXX"
                className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={!canVerify}
            onClick={handleVerify}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-primary/90"
          >
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("insurance.verifying")}
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                {t("insurance.verifyCta")}
              </>
            )}
          </button>

          {verifyError && (
            <div className="text-xs text-destructive flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              {verifyError}
            </div>
          )}

          {est && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                est.eligible
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                {est.eligible ? (
                  <ShieldCheck className="h-4 w-4" />
                ) : (
                  <ShieldAlert className="h-4 w-4" />
                )}
                {est.eligible ? t("insurance.eligible") : t("insurance.notEligible")}
              </div>
              {est.message && (
                <div className="text-xs opacity-90">{est.message}</div>
              )}
              {est.eligible && (est.estimated_cost != null || est.patient_share != null) && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {est.consultation_fee != null && (
                    <>
                      <dt className="opacity-70">{t("insurance.fee")}</dt>
                      <dd className="font-mono">{est.consultation_fee} SAR</dd>
                    </>
                  )}
                  {est.coverage_percent != null && (
                    <>
                      <dt className="opacity-70">{t("insurance.coverage")}</dt>
                      <dd className="font-mono">{est.coverage_percent}%</dd>
                    </>
                  )}
                  {est.patient_share != null && (
                    <>
                      <dt className="opacity-70">{t("insurance.patientShare")}</dt>
                      <dd className="font-mono font-semibold">
                        {est.patient_share} SAR
                      </dd>
                    </>
                  )}
                </dl>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
