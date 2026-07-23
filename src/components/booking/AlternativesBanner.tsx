import { Clock, UserCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export type AlternativeSuggestion = {
  doctorId: string;
  doctorName: string;
  time: string;
  date: string;
};

/**
 * Shared UI for surfacing "your slot was taken / hold expired — here are
 * alternatives" both inside StepDoctor and StepTime. State (suggestion,
 * sameDoctorTimes, findingAlt) is owned by /book.
 */
export function AlternativesBanner({
  reason,
  findingAlt,
  sameDoctorTimes,
  suggestion,
  showSwitchDoctor,
  onPickSameDoctorTime,
  onAcceptSuggestion,
  onSwitchDoctor,
  onDismiss,
}: {
  /** "conflict" = SLOT_TAKEN, "expired" = HOLD_EXPIRED. */
  reason: "conflict" | "expired" | null;
  findingAlt: boolean;
  sameDoctorTimes: string[];
  suggestion: AlternativeSuggestion | null;
  /** Show a "choose another doctor" button that jumps to StepDoctor. */
  showSwitchDoctor?: boolean;
  onPickSameDoctorTime?: (time: string) => void;
  onAcceptSuggestion?: () => void;
  onSwitchDoctor?: () => void;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation("booking");
  const hasContent =
    reason !== null || findingAlt || suggestion !== null || sameDoctorTimes.length > 0;
  if (!hasContent) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 md:p-4 text-sm space-y-3"
    >
      {reason === "conflict" && (
        <div className="flex items-start gap-2">
          <Clock className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden />
          <div>
            <div className="font-bold text-destructive">{t("page.slotTaken")}</div>
            <p className="mt-0.5 text-xs text-destructive/90 leading-5">
              {t("page.conflictReason")}
            </p>
          </div>
        </div>
      )}
      {reason === "expired" && (
        <div className="flex items-start gap-2">
          <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
          <div>
            <div className="font-bold text-amber-700 dark:text-amber-300">
              {t("page.holdExpiredTitle", "انتهت مهلة الحجز المؤقت")}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground leading-5">
              {t(
                "page.holdExpiredHint",
                "اختر وقتًا آخر أو طبيبًا آخر — بقية بياناتك محفوظة.",
              )}
            </p>
          </div>
        </div>
      )}

      {findingAlt && !suggestion && sameDoctorTimes.length === 0 && (
        <div className="text-muted-foreground">{t("page.lookingAlt")}</div>
      )}

      {sameDoctorTimes.length > 0 && onPickSameDoctorTime && (
        <div>
          <div className="font-medium mb-1.5">{t("page.nearestSlotsSameDoctor")}</div>
          <div className="flex flex-wrap gap-2">
            {sameDoctorTimes.map((tm) => (
              <Button
                key={tm}
                size="sm"
                variant="secondary"
                onClick={() => onPickSameDoctorTime(tm)}
              >
                {tm}
              </Button>
            ))}
          </div>
        </div>
      )}

      {suggestion && onAcceptSuggestion && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between border-t border-destructive/20 pt-3">
          <div>
            <div className="font-medium">
              {t("page.altAvailable")} {suggestion.doctorName}
            </div>
            <div className="text-muted-foreground">
              {t("page.earliestSlot")}: {suggestion.time}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={onAcceptSuggestion}>
              {t("page.bookAlt")}
            </Button>
            {showSwitchDoctor && onSwitchDoctor && (
              <Button size="sm" variant="outline" onClick={onSwitchDoctor} className="gap-1">
                <UserCog className="h-3.5 w-3.5" aria-hidden />
                {t("page.switchDoctor", "اختر طبيبًا آخر")}
              </Button>
            )}
            {onDismiss && (
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                {t("page.dismiss")}
              </Button>
            )}
          </div>
        </div>
      )}

      {!findingAlt &&
        !suggestion &&
        sameDoctorTimes.length === 0 &&
        (reason === "conflict" || reason === "expired") && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground">{t("page.noAlternatives")}</div>
            {showSwitchDoctor && onSwitchDoctor && (
              <Button size="sm" variant="outline" onClick={onSwitchDoctor} className="gap-1">
                <UserCog className="h-3.5 w-3.5" aria-hidden />
                {t("page.switchDoctor", "اختر طبيبًا آخر")}
              </Button>
            )}
          </div>
        )}
    </div>
  );
}
