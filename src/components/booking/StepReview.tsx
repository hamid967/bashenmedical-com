import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SubmitErrorBanner } from "@/components/SubmitErrorBanner";
import { StepShell } from "./StepShell";
import { formatArDate, type State } from "./types";

export function StepReview({
  lang, state, branches, specialties, doctors, errorMsg, submitting, onSubmit, patientValid, onEditPatient,
}: {
  lang: "ar" | "en"; state: State; branches: any[]; specialties: any[]; doctors: any[];
  errorMsg: string | null; submitting: boolean; onSubmit: () => void;
  patientValid: boolean; onEditPatient: () => void;
}) {
  const { t } = useTranslation("booking");
  const branch = branches.find((b) => b.id === state.branchId);
  const spec   = specialties.find((s) => s.id === state.specialtyId);
  const doc    = doctors.find((d: any) => d.id === state.doctorId);
  const rows = [
    { label: t("review.branch"), value: branch ? (lang === "ar" ? branch.name_ar : branch.name_en) : "—" },
    { label: t("review.specialty"), value: spec ? (lang === "ar" ? spec.name_ar : spec.name_en) : "—" },
    { label: t("review.doctor"), value: doc ? (lang === "ar" ? doc.name_ar : doc.name_en) : "—" },
    { label: t("review.date"), value: formatArDate(state.date, lang) },
    { label: t("review.time"), value: state.time ?? "—" },
    { label: t("review.name"), value: state.patient.name },
    { label: t("review.phone"), value: state.patient.phone },
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

        {!patientValid && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
            <span>{t("review.incomplete")}</span>
            <Button variant="outline" size="sm" onClick={onEditPatient}>
              {t("review.edit")}
            </Button>
          </div>
        )}

        {errorMsg && <div className="mt-4"><SubmitErrorBanner kind="unknown" message={errorMsg}/></div>}

        <Button
          onClick={onSubmit}
          disabled={submitting || !patientValid}
          className="w-full mt-6 gap-2 h-12 text-base"
        >
          {submitting
            ? <><Loader2 className="h-4 w-4 animate-spin"/> {t("review.submitting")}</>
            : <><CheckCircle2 className="h-5 w-5"/> {t("review.confirm")}</>}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">{t("review.terms")}</p>
      </div>
    </StepShell>
  );
}
