import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { StepShell } from "./StepShell";
import { Field } from "./Field";
import { DependentPicker, type SelfOrDependent } from "./DependentPicker";
import { InsuranceSection } from "./InsuranceSection";
import { NAME_MAX, PHONE_MAX, REASON_MAX, type PatientErrors, type State } from "./types";

export function StepPatient({ lang, doctorId, value, errors, onChange }: { lang: "ar" | "en"; doctorId: string | null; value: State["patient"]; errors: PatientErrors; onChange: (p: Partial<State["patient"]>) => void }) {
  const { t } = useTranslation("booking");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const mark = (k: string) => setTouched((tt) => (tt[k] ? tt : { ...tt, [k]: true }));
  const show = (k: keyof PatientErrors) => (touched[k] ? errors[k] : undefined);
  const allValid = Object.keys(errors).length === 0;

  const genderLegendId = useId();
  const genderErrId = `${genderLegendId}-err`;
  const reasonCounterId = useId();
  const genderError = touched.gender ? errors.gender : undefined;

  function applyPicker(v: SelfOrDependent) {
    onChange({
      name: v.name || value.name,
      phone: v.phone || value.phone,
      nationalId: v.nationalId || value.nationalId,
      gender: v.gender ?? value.gender,
    });
    setTouched({ name: true, phone: true, gender: !!v.gender });
  }

  return (
    <StepShell lang={lang} title={t("patient.title")}>
      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto">
        <DependentPicker
          lang={lang}
          currentName={value.name}
          currentPhone={value.phone}
          onApply={applyPicker}
        />

        <Field label={t("patient.fullName")} required error={show("name")}>
          <input
            value={value.name}
            onChange={(e) => { onChange({ name: e.target.value.slice(0, NAME_MAX) }); mark("name"); }}
            onBlur={() => mark("name")}
            className={`input ${show("name") ? "input-error" : ""}`}
            placeholder={t("patient.fullNamePlaceholder")}
            autoComplete="name"
          />
        </Field>
        <Field label={t("patient.mobile")} required error={show("phone")}>
          <input
            value={value.phone}
            onChange={(e) => { onChange({ phone: e.target.value.slice(0, PHONE_MAX) }); mark("phone"); }}
            onBlur={() => mark("phone")}
            className={`input ${show("phone") ? "input-error" : ""}`}
            placeholder="05XXXXXXXX"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>
        <Field label={t("patient.emailOptional")} error={show("email")} hint={t("patient.emailHint")}>
          <input
            value={value.email}
            onChange={(e) => { onChange({ email: e.target.value.slice(0, 255) }); mark("email"); }}
            onBlur={() => mark("email")}
            className={`input ${show("email") ? "input-error" : ""}`}
            placeholder="name@example.com"
            dir="ltr"
            type="email"
            inputMode="email"
            autoComplete="email"
          />
        </Field>
        <Field label={t("patient.nationalIdOptional")} error={show("nationalId")}>
          <input
            value={value.nationalId}
            onChange={(e) => { onChange({ nationalId: e.target.value.replace(/\D/g, "").slice(0, 10) }); mark("nationalId"); }}
            onBlur={() => mark("nationalId")}
            className={`input ${show("nationalId") ? "input-error" : ""}`}
            placeholder="1XXXXXXXXX / 2XXXXXXXXX"
            dir="ltr"
            inputMode="numeric"
            maxLength={10}
          />
        </Field>
        <fieldset className="block">
          <legend id={genderLegendId} className="text-xs font-semibold mb-1.5">
            {t("patient.gender")}
            <span className="text-destructive" aria-hidden="true"> *</span>
            <span className="sr-only"> (required)</span>
          </legend>
          <div
            role="radiogroup"
            aria-labelledby={genderLegendId}
            aria-required="true"
            aria-invalid={!!genderError}
            aria-describedby={genderError ? genderErrId : undefined}
            className="grid grid-cols-2 gap-2"
          >
            {(["male", "female"] as const).map((g) => (
              <button key={g} type="button"
                role="radio"
                aria-checked={value.gender === g}
                onClick={() => { onChange({ gender: g }); mark("gender"); }}
                className={`rounded-lg border-2 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  value.gender === g ? "border-primary bg-primary/5 text-primary" : "border-border bg-card hover:border-primary/50"
                }`}
              >
                {t(`patient.${g}`)}
              </button>
            ))}
          </div>
          {genderError && (
            <div id={genderErrId} role="alert" className="mt-1 text-xs text-destructive">
              {genderError}
            </div>
          )}
        </fieldset>
        <div className="sm:col-span-2">
          <Field label={t("patient.reasonOptional")} error={show("reason")}>
            <textarea
              value={value.reason}
              onChange={(e) => onChange({ reason: e.target.value.slice(0, REASON_MAX) })}
              onBlur={() => mark("reason")}
              aria-describedby={reasonCounterId}
              className={`input min-h-[80px] ${show("reason") ? "input-error" : ""}`}
              placeholder={t("patient.reasonPlaceholder")}
            />
          </Field>
          <div
            id={reasonCounterId}
            className="text-[11px] text-muted-foreground mt-1 text-end"
            aria-live="polite"
          >
            {t("a11y.charsCount", "{{count}} من {{max}} حرف", { count: value.reason.length, max: REASON_MAX })}
          </div>
        </div>
        <InsuranceSection
          lang={lang}
          doctorId={doctorId}
          value={value}
          onChange={onChange}
        />

        <div className="sm:col-span-2 rounded-xl bg-muted/50 p-4 space-y-2">
          <div className="font-semibold text-sm">{t("patient.reminders")}</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.reminder24h} onChange={(e) => onChange({ reminder24h: e.target.checked })} className="accent-primary"/>
            {t("patient.before24h")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.reminder2h} onChange={(e) => onChange({ reminder2h: e.target.checked })} className="accent-primary"/>
            {t("patient.before2h")}
          </label>
        </div>

        {!allValid && Object.values(touched).some(Boolean) && (
          <div
            className="sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
            aria-live="assertive"
          >
            {t("patient.hasErrors")}
          </div>
        )}
      </div>
      <style>{`
        .input{width:100%;border:1px solid hsl(var(--border));background:hsl(var(--background));border-radius:.5rem;padding:.55rem .75rem;font-size:.875rem;transition:box-shadow .15s,border-color .15s}
        .input:focus{outline:none;box-shadow:0 0 0 2px hsl(var(--primary)/.4)}
        .input-error{border-color:hsl(var(--destructive));box-shadow:0 0 0 1px hsl(var(--destructive)/.3)}
      `}</style>
    </StepShell>
  );
}
