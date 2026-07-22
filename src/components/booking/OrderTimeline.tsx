/**
 * OrderTimeline — Unified timeline for all order kinds
 * (appointment / pharmacy / second_opinion / home_care).
 */
import { useTranslation } from "react-i18next";
import { useI18n } from "@/lib/i18n";

export type OrderKind = "appointment" | "pharmacy" | "second_opinion" | "home_care";
type StepState = "done" | "current" | "pending" | "cancelled";
type Step = { key: string; label: string; date: string | null; state: StepState };

type FlowStep = { key: string; reachedAt: string[] };
type Flow = {
  steps: FlowStep[];
  terminalStates: string[];
  cancelledStates: string[];
  abortedStates?: string[];
};

const FLOWS: Record<OrderKind, Flow> = {
  appointment: {
    steps: [
      { key: "received", reachedAt: ["new", "confirmed", "completed", "no_show"] },
      { key: "confirmed", reachedAt: ["confirmed", "completed", "no_show"] },
      { key: "visit", reachedAt: ["completed", "no_show"] },
      { key: "completed", reachedAt: ["completed"] },
    ],
    terminalStates: ["completed"],
    cancelledStates: ["cancelled", "canceled"],
    abortedStates: ["no_show"],
  },
  pharmacy: {
    steps: [
      { key: "received", reachedAt: ["new", "processing", "ready", "delivered", "completed"] },
      { key: "processing", reachedAt: ["processing", "ready", "delivered", "completed"] },
      { key: "ready", reachedAt: ["ready", "delivered", "completed"] },
      { key: "delivered", reachedAt: ["delivered", "completed"] },
    ],
    terminalStates: ["delivered", "completed"],
    cancelledStates: ["cancelled", "canceled", "rejected"],
  },
  second_opinion: {
    steps: [
      { key: "received", reachedAt: ["new", "in_review", "answered", "closed", "completed"] },
      { key: "in_review", reachedAt: ["in_review", "answered", "closed", "completed"] },
      { key: "answered", reachedAt: ["answered", "closed", "completed"] },
      { key: "closed", reachedAt: ["closed", "completed"] },
    ],
    terminalStates: ["closed", "completed", "answered"],
    cancelledStates: ["cancelled", "canceled", "rejected"],
  },
  home_care: {
    steps: [
      { key: "received", reachedAt: ["new", "confirmed", "in_progress", "completed"] },
      { key: "confirmed", reachedAt: ["confirmed", "in_progress", "completed"] },
      { key: "in_progress", reachedAt: ["in_progress", "completed"] },
      { key: "completed", reachedAt: ["completed"] },
    ],
    terminalStates: ["completed"],
    cancelledStates: ["cancelled", "canceled", "rejected"],
  },
};

function fmt(iso: string | null | undefined, lang: "ar" | "en") {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function OrderTimeline({
  kind,
  status,
  createdAt,
  scheduledAt,
}: {
  kind: OrderKind;
  status: string;
  createdAt: string;
  scheduledAt?: string | null;
}) {
  const { lang } = useI18n();
  const { t } = useTranslation("booking");
  const flow = FLOWS[kind];

  const dateForStep = (key: string): string | null => {
    if (key === "received") return fmt(createdAt, lang);
    if (key === "visit" || key === "in_progress") return fmt(scheduledAt ?? null, lang);
    return null;
  };

  const steps: Step[] = (() => {
    if (flow.cancelledStates.includes(status)) {
      return [
        {
          key: "received",
          label: t("timeline.received"),
          date: fmt(createdAt, lang),
          state: "done",
        },
        { key: "cancelled", label: t("timeline.cancelled"), date: null, state: "cancelled" },
      ];
    }

    const isTerminal = flow.terminalStates.includes(status);
    const isAborted = flow.abortedStates?.includes(status) ?? false;

    let reachedIdx = 0;
    for (let i = 0; i < flow.steps.length; i++) {
      if (flow.steps[i].reachedAt.includes(status)) reachedIdx = i;
    }

    return flow.steps.map((s, i) => {
      let state: StepState;
      if (isTerminal) state = "done";
      else if (isAborted && i === flow.steps.length - 1) state = "cancelled";
      else if (i < reachedIdx) state = "done";
      else if (i === reachedIdx) state = i === 0 ? "done" : "current";
      else state = "pending";
      if (i === 0 && state !== "cancelled") state = "done";

      return { key: s.key, label: t(`timeline.${kind}.${s.key}`), date: dateForStep(s.key), state };
    });
  })();

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 text-sm font-semibold">{t("timeline.title")}</div>
      <ol className="relative">
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          const dot =
            s.state === "done"
              ? "bg-green-500 border-green-500 text-white"
              : s.state === "current"
                ? "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20"
                : s.state === "cancelled"
                  ? "bg-destructive border-destructive text-destructive-foreground"
                  : "bg-background border-border text-muted-foreground";
          const line =
            s.state === "done"
              ? "bg-green-500"
              : s.state === "cancelled"
                ? "bg-destructive"
                : "bg-border";
          return (
            <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
              {!isLast && (
                <span
                  className={`absolute top-8 bottom-0 w-0.5 ${line}`}
                  style={{ insetInlineStart: "0.9375rem" }}
                  aria-hidden
                />
              )}
              <div
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${dot}`}
              >
                {s.state === "done" ? "✓" : s.state === "cancelled" ? "✕" : i + 1}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div
                  className={`text-sm font-semibold ${s.state === "pending" ? "text-muted-foreground" : ""}`}
                >
                  {s.label}
                </div>
                {s.date && <div className="mt-0.5 text-xs text-muted-foreground">{s.date}</div>}
                {s.state === "current" && (
                  <div className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {t("timeline.current")}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
