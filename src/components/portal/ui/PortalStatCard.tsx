import { type ReactNode } from "react";
import { PortalCard } from "./PortalCard";

type Tone = "primary" | "success" | "warning" | "error" | "muted";

const toneStyle: Record<Tone, { icon: string; ring: string }> = {
  primary: { icon: "text-[color:var(--portal-primary)]", ring: "bg-[color:var(--portal-primary-50)]" },
  success: { icon: "text-[color:var(--portal-success)]", ring: "bg-[color:var(--portal-success-50)]" },
  warning: { icon: "text-[color:var(--portal-warning)]", ring: "bg-[color:var(--portal-warning-50)]" },
  error: { icon: "text-[color:var(--portal-error)]", ring: "bg-[color:var(--portal-error-50)]" },
  muted: { icon: "text-[color:var(--portal-ink-2)]", ring: "bg-[color:var(--portal-surface-3)]" },
};

export function PortalStatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  trend,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  trend?: { value: string; direction: "up" | "down" | "flat" };
}) {
  const s = toneStyle[tone];
  return (
    <PortalCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[color:var(--portal-ink-3)]">
            {label}
          </div>
          <div className="mt-2 text-[26px] md:text-[28px] font-bold text-[color:var(--portal-ink)] leading-none tracking-tight">
            {value}
          </div>
          {hint && (
            <div className="mt-1.5 text-[12.5px] text-[color:var(--portal-ink-2)]">{hint}</div>
          )}
          {trend && (
            <div
              className={
                "mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold " +
                (trend.direction === "up"
                  ? "text-[color:var(--portal-success)]"
                  : trend.direction === "down"
                    ? "text-[color:var(--portal-error)]"
                    : "text-[color:var(--portal-ink-3)]")
              }
            >
              <span aria-hidden>
                {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "→"}
              </span>
              {trend.value}
            </div>
          )}
        </div>
        {icon && (
          <div className={`shrink-0 h-11 w-11 rounded-2xl grid place-items-center ${s.ring} ${s.icon}`}>
            {icon}
          </div>
        )}
      </div>
    </PortalCard>
  );
}
