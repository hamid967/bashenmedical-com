/**
 * KpiCard — Expanded KPI card with:
 *  - Big value + label + optional icon
 *  - Delta vs previous period (green/red pill, positiveIsGood aware)
 *  - Mini sparkline (recharts area) — hidden gracefully when empty
 *  - Loading skeleton, error, and empty states
 *  - Optional drill-down link (rendered only if provided)
 */
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowDownRight, ArrowUpRight, ArrowRight, AlertTriangle, Minus } from "lucide-react";
import type { ComponentType } from "react";

export type KpiCardProps = {
  label: string;
  value: number | string;
  previous?: number;
  deltaPct?: number;
  deltaAbs?: number;
  positiveIsGood?: boolean;
  sparkline?: { day: string; count: number }[];
  icon?: ComponentType<{ className?: string }>;
  drillTo?: string | null;
  hint?: string;
  highlight?: boolean;
  /** Palette overrides (Deep Ocean by default). */
  colors?: { bg: string; panel: string; panel2: string; accent: string; glow: string };
};

const DEFAULT_COLORS = {
  bg: "#081628",
  panel: "#0c2340",
  panel2: "#1a4a6e",
  accent: "#2d8a9e",
  glow: "#5cbdb9",
};

function fmt(n: number | string) {
  if (typeof n === "string") return n;
  return new Intl.NumberFormat("ar-EG").format(n);
}

export function KpiCard({
  label,
  value,
  previous,
  deltaPct,
  deltaAbs,
  positiveIsGood = true,
  sparkline,
  icon: Icon,
  drillTo,
  hint,
  highlight = false,
  colors = DEFAULT_COLORS,
}: KpiCardProps) {
  const hasDelta = typeof deltaPct === "number" && (previous ?? 0) > 0;
  const isUp = (deltaPct ?? 0) > 0;
  const isFlat = (deltaPct ?? 0) === 0;
  const good = isFlat ? null : positiveIsGood ? isUp : !isUp;

  const deltaBg =
    good === null
      ? "rgba(148,163,184,0.15)"
      : good
        ? "rgba(34,197,94,0.15)"
        : "rgba(239,68,68,0.15)";
  const deltaColor = good === null ? "#94a3b8" : good ? "#4ade80" : "#f87171";

  const Wrapper: any = drillTo ? Link : "div";
  const wrapperProps: any = drillTo
    ? { to: drillTo, className: "group block" }
    : { className: "block" };

  return (
    <Wrapper
      {...wrapperProps}
      style={{
        background: highlight ? colors.glow : colors.panel,
        border: `1px solid ${highlight ? colors.glow : colors.panel2}`,
        color: highlight ? colors.panel : "#e0e7ff",
      }}
      className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-transform ${
        drillTo ? "hover:-translate-y-0.5 hover:shadow-lg" : ""
      }`}
    >
      {/* Header row: label + optional icon */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p
            className="text-[10px] sm:text-[11px] font-bold tracking-widest uppercase truncate"
            style={{ color: highlight ? colors.panel : colors.glow, opacity: 0.8 }}
          >
            {label}
          </p>
        </div>
        {Icon && (
          <span
            className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg"
            style={{
              background: highlight ? `${colors.panel}22` : `${colors.accent}33`,
              color: highlight ? colors.panel : colors.glow,
            }}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Value + delta */}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div
            className="text-2xl sm:text-3xl font-extrabold leading-none tabular-nums"
            style={{ color: highlight ? colors.panel : "#ffffff" }}
          >
            {fmt(value)}
          </div>
          {hint && (
            <p
              className="mt-1 text-[10px] sm:text-xs truncate"
              style={{ color: highlight ? colors.panel : colors.glow, opacity: 0.75 }}
            >
              {hint}
            </p>
          )}
        </div>
        {hasDelta && (
          <span
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold tabular-nums"
            style={{ background: deltaBg, color: deltaColor }}
            title={`السابق: ${fmt(previous ?? 0)} • الفرق: ${(deltaAbs ?? 0) >= 0 ? "+" : ""}${fmt(deltaAbs ?? 0)}`}
          >
            {isFlat ? (
              <Minus className="h-3 w-3" />
            ) : isUp ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(deltaPct!)}%
          </span>
        )}
      </div>

      {/* Sparkline */}
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 h-10 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id={`kpi-spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={highlight ? colors.panel : colors.glow}
                    stopOpacity={0.6}
                  />
                  <stop
                    offset="100%"
                    stopColor={highlight ? colors.panel : colors.glow}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Tooltip
                cursor={{ stroke: colors.glow, strokeOpacity: 0.3 }}
                contentStyle={{
                  background: colors.panel,
                  border: `1px solid ${colors.panel2}`,
                  borderRadius: 8,
                  fontSize: 11,
                  padding: "4px 8px",
                }}
                labelStyle={{ color: colors.glow, fontWeight: 700 }}
                itemStyle={{ color: "#e0e7ff" }}
                formatter={(v: number) => [fmt(v), "عدد"]}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={highlight ? colors.panel : colors.glow}
                strokeWidth={2}
                fill={`url(#kpi-spark-${label})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Drill-down affordance */}
      {drillTo && (
        <div
          className="mt-3 inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold opacity-70 group-hover:opacity-100 transition-opacity"
          style={{ color: highlight ? colors.panel : colors.glow }}
        >
          فتح <ArrowRight className="h-3 w-3 rtl:rotate-180" />
        </div>
      )}
    </Wrapper>
  );
}

/* ─── State variants ─── */

export function KpiCardSkeleton({ colors = DEFAULT_COLORS }: { colors?: typeof DEFAULT_COLORS }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 sm:p-5"
      style={{ background: colors.panel, border: `1px solid ${colors.panel2}` }}
    >
      <div
        className="h-3 w-24 rounded-full mb-4 animate-pulse"
        style={{ background: `${colors.panel2}` }}
      />
      <div
        className="h-8 w-20 rounded-md mb-3 animate-pulse"
        style={{ background: `${colors.panel2}` }}
      />
      <div
        className="h-10 w-full rounded-lg animate-pulse"
        style={{ background: `${colors.panel2}80` }}
      />
    </div>
  );
}

export function KpiCardError({
  onRetry,
  colors = DEFAULT_COLORS,
}: {
  onRetry?: () => void;
  colors?: typeof DEFAULT_COLORS;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 sm:p-5 flex flex-col items-start gap-2"
      style={{
        background: colors.panel,
        border: "1px solid rgba(239,68,68,0.35)",
        color: "#e0e7ff",
      }}
    >
      <span
        className="inline-flex items-center gap-1.5 text-xs font-bold"
        style={{ color: "#f87171" }}
      >
        <AlertTriangle className="h-4 w-4" />
        تعذّر تحميل البيانات
      </span>
      <p className="text-[11px] opacity-75">حدث خطأ أثناء جلب المقياس.</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-[11px] font-semibold rounded-md px-2 py-1"
          style={{ background: `${colors.accent}44`, color: colors.glow }}
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
