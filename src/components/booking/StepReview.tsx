import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SubmitErrorBanner } from "@/components/SubmitErrorBanner";
import type { BookingSubmitKind } from "@/lib/booking-submit";
import { StepShell } from "./StepShell";
import { formatArDate, type State } from "./types";

export function StepReview({
  lang,
  state,
  branches,
  specialties,
  doctors,
  errorMsg,
  errorKind = "unknown",
  submitting,
  onSubmit,
  patientValid,
  onEditPatient,
}: {
  lang: "ar" | "en";
  state: State;
  branches: any[];
  specialties: any[];
  doctors: any[];
  errorMsg: string | null;
  errorKind?: Exclude<BookingSubmitKind, "success">;
  submitting: boolean;
  onSubmit: () => void;
  patientValid: boolean;
  onEditPatient: () => void;
}) {
  const { t } = useTranslation("booking");
  const branch = branches.find((b) => b.id === state.branchId);
  const spec = specialties.find((s) => s.id === state.specialtyId);
  const doc = doctors.find((d: any) => d.id === state.doctorId);
  const est = state.patient.insuranceEstimate;
  const isInsurance = state.patient.payerType === "insurance";
  const rows = [
    {
      label: t("review.branch"),
      value: branch ? (lang === "ar" ? branch.name_ar : branch.name_en) : "—",
    },
    {
      label: t("review.specialty"),
      value: spec ? (lang === "ar" ? spec.name_ar : spec.name_en) : "—",
    },
    { label: t("review.doctor"), value: doc ? (lang === "ar" ? doc.name_ar : doc.name_en) : "—" },
    { label: t("review.date"), value: formatArDate(state.date, lang) },
    { label: t("review.time"), value: state.time ?? "—" },
    { label: t("review.name"), value: state.patient.name },
    { label: t("review.phone"), value: state.patient.phone },
    { label: t("insurance.paymentMethod"), value: t(`insurance.${state.patient.payerType}`) },
  ];
  return (
    <StepShell lang={lang} title={t("review.title")}>
      <div className="max-w-xl mx-auto">
        <dl className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-3 p-3 text-sm">
              <dt className="text-muted-foreground col-span-1">{r.label}</dt>
              <dd className="col-span-2 font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>

        {isInsurance && est && est.eligible && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="font-semibold mb-2 flex items-center gap-2">
              <span>{t("insurance.costBreakdown")}</span>
            </div>
            <dl className="space-y-1.5">
              {est.consultation_fee != null && (
                <div className="flex items-center justify-between">
                  <dt className="text-emerald-800">{t("insurance.fee")}</dt>
                  <dd className="font-mono">{est.consultation_fee} SAR</dd>
                </div>
              )}
              {est.coverage_percent != null && (
                <div className="flex items-center justify-between">
                  <dt className="text-emerald-800">{t("insurance.coverage")}</dt>
                  <dd className="font-mono">{est.coverage_percent}%</dd>
                </div>
              )}
              {est.covered_amount != null && (
                <div className="flex items-center justify-between">
                  <dt className="text-emerald-800">{t("insurance.coveredAmount")}</dt>
                  <dd className="font-mono">−{est.covered_amount} SAR</dd>
                </div>
              )}
              {est.patient_share != null && (
                <div className="flex items-center justify-between border-t border-emerald-200 pt-1.5 mt-1.5">
                  <dt className="font-semibold">{t("insurance.patientShare")}</dt>
                  <dd className="font-mono font-bold text-base">{est.patient_share} SAR</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {!patientValid && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{t("review.incomplete")}</span>
            <Button variant="outline" size="sm" onClick={onEditPatient}>
              {t("review.edit")}
            </Button>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4">
            <SubmitErrorBanner kind={errorKind} message={errorMsg} />
          </div>
        )}

        <Button
          onClick={onSubmit}
          disabled={submitting || !patientValid}
          className="w-full mt-6 gap-2 h-12 text-base"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {t("review.submitting")}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5" /> {t("review.confirm")}
            </>
          )}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">{t("review.terms")}</p>
      </div>
    </StepShell>
  );
}
