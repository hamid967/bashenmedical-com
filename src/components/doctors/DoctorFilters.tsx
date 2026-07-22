/**
 * DoctorFilters — specialty/branch/gender/language filter groups wired to the
 * shared DoctorSearchContext. Reference data (specialties/branches/languages)
 * is passed in so the caller controls fetching.
 */
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { FilterGroup } from "./FilterGroup";
import { CheckItem } from "./CheckItem";
import { LANG_LABELS } from "./types";
import { useDoctorSearch } from "./DoctorSearchContext";

export type SpecialtyOption = { id: string; name_ar: string; name_en: string };
export type BranchOption = { id: string; name_ar: string; name_en: string };

type Props = {
  specialties: SpecialtyOption[];
  branches: BranchOption[];
  languages: string[];
  /** Live counts per option — from useFilterCounts(doctors). */
  counts?: import("./useFilterCounts").FilterCounts;
  /** Show/hide individual sections. */
  show?: {
    specialty?: boolean;
    branch?: boolean;
    gender?: boolean;
    language?: boolean;
    clearButton?: boolean;
  };
};

export function DoctorFilters({ specialties, branches, languages, counts, show }: Props) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const {
    specialty: selSpec,
    branch: selBranch,
    gender: selGender,
    language: selLangs,
    activeCount,
    toggleSpecialty,
    toggleBranch,
    setGender,
    toggleLanguage,
    clearAll,
  } = useDoctorSearch();

  const flags = {
    specialty: true,
    branch: true,
    gender: true,
    language: true,
    clearButton: true,
    ...show,
  };

  return (
    <div className="space-y-6">
      {flags.clearButton && activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <X className="h-3.5 w-3.5" />
          {ar ? `مسح كل الفلاتر (${activeCount})` : `Clear filters (${activeCount})`}
        </button>
      )}

      {flags.specialty && specialties.length > 0 && (
        <FilterGroup title={ar ? "التخصص" : "Specialty"}>
          {specialties.map((s) => (
            <CheckItem
              key={s.id}
              checked={selSpec.includes(s.id)}
              onChange={() => toggleSpecialty(s.id)}
              label={ar ? s.name_ar : s.name_en}
              count={counts?.specialty[s.id] ?? (counts ? 0 : undefined)}
            />
          ))}
        </FilterGroup>
      )}

      {flags.branch && branches.length > 0 && (
        <FilterGroup title={ar ? "الفرع" : "Branch"}>
          {branches.map((b) => (
            <CheckItem
              key={b.id}
              checked={selBranch.includes(b.id)}
              onChange={() => toggleBranch(b.id)}
              label={ar ? b.name_ar : b.name_en}
              count={counts?.branch[b.id] ?? (counts ? 0 : undefined)}
            />
          ))}
        </FilterGroup>
      )}

      {flags.gender && (
        <FilterGroup title={ar ? "الجنس" : "Gender"}>
          {(["male", "female"] as const).map((g) => (
            <CheckItem
              key={g}
              checked={selGender === g}
              onChange={(v) => setGender(v ? g : "")}
              label={g === "male" ? (ar ? "طبيب" : "Male") : ar ? "طبيبة" : "Female"}
              count={counts?.gender[g]}
            />
          ))}
        </FilterGroup>
      )}

      {flags.language && languages.length > 0 && (
        <FilterGroup title={ar ? "اللغة" : "Language"}>
          {languages.map((l) => (
            <CheckItem
              key={l}
              checked={selLangs.includes(l)}
              onChange={() => toggleLanguage(l)}
              label={LANG_LABELS[l]?.[lang] ?? l}
              count={counts?.language[l] ?? (counts ? 0 : undefined)}
            />
          ))}
          {selLangs.length > 1 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {ar
                ? "يتم عرض الأطباء الذين يتحدثون كل اللغات المختارة."
                : "Showing doctors who speak all selected languages."}
            </p>
          )}
        </FilterGroup>
      )}
    </div>
  );
}
