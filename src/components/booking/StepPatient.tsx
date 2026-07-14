import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StepShell } from "./StepShell";
import { Field } from "./Field";
import { NAME_MAX, PHONE_MAX, REASON_MAX, type PatientErrors, type State } from "./types";

export function StepPatient({ lang, value, errors, onChange }: { lang: "ar" | "en"; value: State["patient"]; errors: PatientErrors; onChange: (p: Partial<State["patient"]>) => void }) {
  const { t } = useTranslation("booking");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const mark = (k: string) => setTouched((tt) => (tt[k] ? tt : { ...tt, [k]: true }));
  const show = (k: keyof PatientErrors) => (touched[k] ? errors[k] : undefined);
  const allValid = Object.keys(errors).length === 0;

  return (
    <StepShell lang={lang} title={t("patient.title")}>
      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto">
        <Field label={t("patient.fullName")} required error={show("name")}>
          <input
            value={value.name}
            onChange={(e) => { onChange({ name: e.target.value.slice(0, NAME_MAX) }); mark("name"); }}
            onBlur={() => mark("name")}
            aria-invalid={!!show("name")}
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
            aria-invalid={!!show("phone")}
            className={`input ${show("phone") ? "input-error" : ""}`}
            placeholder="05XXXXXXXX"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>
        <Field label={t("patient.nationalIdOptional")} error={show("nationalId")}>
          <input
            value={value.nationalId}
            onChange={(e) => { onChange({ nationalId: e.target.value.replace(/\D/g, "").slice(0, 10) }); mark("nationalId"); }}
            onBlur={() => mark("nationalId")}
            aria-invalid={!!show("nationalId")}
            className={`input ${show("nationalId") ? "input-error" : ""}`}
            placeholder="1XXXXXXXXX / 2XXXXXXXXX"
            dir="ltr"
            inputMode="numeric"
            maxLength={10}
          />
        </Field>
        <Field label={t("patient.gender")} required error={touched.gender ? errors.gender : undefined}>
          <div className="grid grid-cols-2 gap-2">
            {(["male", "female"] as const).map((g) => (
              <button key={g} type="button"
                onClick={() => { onChange({ gender: g }); mark("gender"); }}
                className={`rounded-lg border-2 py-2 text-sm font-medium transition ${
                  value.gender === g ? "border-primary bg-primary/5 text-primary" : "border-border bg-card hover:border-primary/50"
                }`}
              >
                {t(`patient.${g}`)}
              </button>
            ))}
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("patient.reasonOptional")} error={show("reason")}>
            <textarea
              value={value.reason}
              onChange={(e) => onChange({ reason: e.target.value.slice(0, REASON_MAX) })}
              onBlur={() => mark("reason")}
              aria-invalid={!!show("reason")}
              className={`input min-h-[80px] ${show("reason") ? "input-error" : ""}`}
              placeholder={t("patient.reasonPlaceholder")}
            />
            <div className="text-[11px] text-muted-foreground mt-1 text-end">{value.reason.length}/{REASON_MAX}</div>
          </Field>
        </div>
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
          <div className="sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
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
