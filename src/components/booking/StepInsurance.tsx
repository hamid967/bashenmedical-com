/**
 * Dedicated insurance step in the /book wizard.
 *
 * Splitting insurance out of StepPatient gives the payer decision its own
 * validation gate: the wizard can't advance to review until the choice is
 * unambiguous (verified insurance OR explicit self-pay fallback). All UI
 * for provider selection, policy/member fields and eligibility verification
 * lives in InsuranceSection; this shell wraps it with a title, guidance,
 * and a validation summary keyed to `validateInsurance()` from ./types.
 */
import { useTranslation } from "react-i18next";
import { AlertCircle, ShieldCheck, Wallet } from "lucide-react";
import { StepShell } from "./StepShell";
import { InsuranceSection } from "./InsuranceSection";
import type { InsuranceErrors, State } from "./types";

export function StepInsurance({
  lang,
  doctorId,
  value,
  errors,
  showErrors,
  onChange,
}: {
  lang: "ar" | "en";
  doctorId: string | null;
  value: State["patient"];
  errors: InsuranceErrors;
  /** When false, error summary is suppressed (initial visit). Set true after the
   *  user tries to advance so validation feedback appears only when relevant. */
  showErrors: boolean;
  onChange: (p: Partial<State["patient"]>) => void;
}) {
  const { t } = useTranslation("booking");
  const errorEntries = Object.entries(errors) as [
    keyof InsuranceErrors,
    string,
  ][];
  const hasErrors = errorEntries.length > 0;

  return (
    <StepShell lang={lang} title={t("insurance.stepTitle")}>
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="text-sm text-muted-foreground flex items-start gap-2">
          <Wallet className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <span>{t("insurance.stepHint")}</span>
        </p>

        <InsuranceSection
          lang={lang}
          doctorId={doctorId}
          value={value}
          onChange={onChange}
        />

        {value.payerType === "self" && (
          <div
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-start gap-2"
            role="status"
            aria-live="polite"
          >
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t("insurance.selfPayNotice")}</span>
          </div>
        )}

        {showErrors && hasErrors && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive space-y-1"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4" />
              {t("insurance.errors.summary")}
            </div>
            <ul className="list-disc ps-5 space-y-0.5">
              {errorEntries.map(([k, msg]) => (
                <li key={k}>{t(msg, { defaultValue: msg })}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </StepShell>
  );
}
