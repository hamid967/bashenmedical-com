/**
 * DependentPicker — shown at StepPatient for signed-in users so they can
 * book on behalf of themselves or one of their registered dependents.
 * Silently renders nothing when the user is not signed in or has no
 * dependents; the wizard remains a plain form for guests.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type SelfOrDependent = {
  kind: "self" | "dependent";
  name: string;
  phone: string;
  nationalId: string;
  gender: "male" | "female" | null;
  dependentId?: string;
};

type Dependent = {
  id: string;
  full_name: string;
  relationship: string;
  national_id: string | null;
  phone: string | null;
  gender: string | null;
};

type Props = {
  lang: "ar" | "en";
  currentName: string;
  currentPhone: string;
  onApply: (v: SelfOrDependent) => void;
};

export function DependentPicker({ lang, currentName, currentPhone, onApply }: Props) {
  const { t } = useTranslation("booking");
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [selfProfile, setSelfProfile] = useState<{ full_name: string | null; phone: string | null; national_id: string | null; gender: string | null } | null>(null);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [selected, setSelected] = useState<string>("self");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) { setReady(true); return; }

      const [profRes, depsRes, patRes] = await Promise.all([
        supabase.from("profiles").select("full_name,phone").eq("id", uid).maybeSingle(),
        supabase.from("dependents")
          .select("id,full_name,relationship,national_id,phone,gender")
          .eq("guardian_user_id", uid)
          .order("full_name"),
        supabase.from("patients").select("national_id,gender,full_name_ar,phone").eq("profile_id", uid).maybeSingle(),
      ]);
      if (cancelled) return;
      setSelfProfile({
        full_name: patRes.data?.full_name_ar ?? profRes.data?.full_name ?? null,
        phone: patRes.data?.phone ?? profRes.data?.phone ?? null,
        national_id: patRes.data?.national_id ?? null,
        gender: patRes.data?.gender ?? null,
      });
      setDependents((depsRes.data ?? []) as Dependent[]);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!ready || !userId) return null;
  if (dependents.length === 0 && !selfProfile?.full_name) return null;

  function apply(next: string) {
    setSelected(next);
    if (next === "self") {
      onApply({
        kind: "self",
        name: selfProfile?.full_name ?? currentName,
        phone: selfProfile?.phone ?? currentPhone,
        nationalId: selfProfile?.national_id ?? "",
        gender: (selfProfile?.gender as "male" | "female" | null) ?? null,
      });
      return;
    }
    const d = dependents.find((x) => x.id === next);
    if (!d) return;
    onApply({
      kind: "dependent",
      name: d.full_name,
      phone: d.phone ?? selfProfile?.phone ?? currentPhone,
      nationalId: d.national_id ?? "",
      gender: (d.gender as "male" | "female" | null) ?? null,
      dependentId: d.id,
    });
  }

  return (
    <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
        <Users className="h-4 w-4" />
        {t("patient.bookingFor", "من هو المريض؟")}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => apply("self")}
          className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-start text-sm transition ${
            selected === "self" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"
          }`}
        >
          <UserCheck className="h-4 w-4 text-primary" />
          <div className="flex flex-col">
            <span className="font-medium">{t("patient.self", "لنفسي")}</span>
            {selfProfile?.full_name && (
              <span className="text-xs text-muted-foreground truncate">{selfProfile.full_name}</span>
            )}
          </div>
        </button>
        {dependents.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => apply(d.id)}
            className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-start text-sm transition ${
              selected === d.id ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"
            }`}
          >
            <Users className="h-4 w-4 text-primary" />
            <div className="flex flex-col min-w-0">
              <span className="font-medium truncate">{d.full_name}</span>
              <span className="text-xs text-muted-foreground truncate">
                {t(`patient.rel.${d.relationship}`, d.relationship)}
              </span>
            </div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {lang === "ar"
          ? "سيتم استخدام البيانات المحفوظة تلقائيًا — يمكنك تعديل أي حقل قبل التأكيد."
          : "Saved details will be filled in — you can edit any field before confirming."}
      </p>
    </div>
  );
}
