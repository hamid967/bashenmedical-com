/**
 * V3 Rollback — health signals + one-click rollback for V3 feature flags.
 *
 * Reads error rates from `api_permission_errors` (route-scoped) and
 * `ai_stream_events` (AI-scoped), compares last 15 minutes to a 24h
 * baseline, and returns a per-flag recommendation. Manual rollback flips
 * the flag off, busts the in-instance cache (for platform flags that cache),
 * and records an entry in `audit_logs`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertConsoleAccess as assertAdmin } from "@/lib/admin/_guard";
import { V3_FLAGS, type V3FlagDef } from "./flags.functions";

/** Signal definition per flag. `skip` = no automatic signal available. */
type FlagSignal =
  | { kind: "skip"; reason: string }
  | { kind: "routes"; routes: string[] } // api_permission_errors route LIKE patterns
  | { kind: "ai"; surfaces: Array<"public" | "portal" | "admin"> };

const SIGNALS: Record<string, FlagSignal> = {
  "v3.res.simplified_wizard": { kind: "routes", routes: ["/api/public/book/%"] },
  "v3.res.smart_reschedule": {
    kind: "routes",
    routes: ["/api/public/book/reschedule%", "/api/public/reservations/%"],
  },
  "v3.res.waitlist_auto_promote": { kind: "routes", routes: ["/api/public/waitlist/%"] },
  "v3.res.ai_triage": { kind: "ai", surfaces: ["public", "portal"] },
  "v3.res.nphies_realtime": { kind: "routes", routes: ["/api/public/insurance/%"] },
  "v3.res.whatsapp_business": {
    kind: "routes",
    routes: ["/api/public/hooks/whatsapp%", "/api/public/notify/whatsapp%"],
  },
  "v3.portal.timeline": { kind: "skip", reason: "لا توجد إشارة خطأ مباشرة" },
  "v3.portal.wallet_pass": { kind: "skip", reason: "ميزة عميل — لا توجد إشارة خطأ سيرفر" },
  "v3.portal.offline": { kind: "skip", reason: "يعمل دون اتصال" },
  "v3.admin.customizable_widgets": { kind: "skip", reason: "UI فقط" },
  "v3.admin.command_palette_v3": { kind: "skip", reason: "UI فقط" },
  "v3.platform.rate_limit_unified": { kind: "routes", routes: ["/api/public/%"] },
  "v3.platform.ab_testing": { kind: "skip", reason: "بدون إشارة خطأ مخصّصة بعد" },
  "v3.platform.audit_full": { kind: "skip", reason: "بدون إشارة خطأ مخصّصة بعد" },
};

export const ROLLBACK_THRESHOLDS = {
  /** Ratio observed/baseline to recommend rollback. */
  rollbackRatio: 5,
  /** Ratio observed/baseline to warn. */
  warnRatio: 3,
  /** Minimum errors/hour observed to trigger any recommendation. */
  minObservedPerHour: 20,
  /** For AI surfaces: minimum share of failed streams to trigger. */
  aiMinFailureRate: 0.2,
  /** For AI surfaces: minimum sample size in the recent window. */
  aiMinSample: 20,
  /** Recent window (minutes). */
  windowMinutes: 15,
  /** Baseline window (hours). */
  baselineHours: 24,
} as const;

export type Severity = "ok" | "warn" | "rollback" | "unknown";

export type FlagHealth = {
  key: string;
  title: string;
  pillar: V3FlagDef["pillar"];
  enabled: boolean;
  severity: Severity;
  /** Human summary in Arabic. */
  reason: string;
  observed_per_hour: number | null;
  baseline_per_hour: number | null;
  ratio: number | null;
  sample_size: number;
};

export type V3RollbackHealth = {
  window_minutes: number;
  generated_at: string;
  flags: FlagHealth[];
  summary: { ok: number; warn: number; rollback: number; unknown: number };
};

async function computeRouteHealth(
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    from: (table: string) => {
      select: (cols: string) => {
        gte: (col: string, v: string) => {
          lt: (col: string, v: string) => {
            in: (col: string, vals: number[]) => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  },
  routes: string[],
): Promise<{ observed_per_hour: number; baseline_per_hour: number; sample: number }> {
  // Use RPC when available; fall back to a raw count via `from(...)` filter
  // built to match the route LIKE patterns. Keep it simple: run two counts.
  const now = Date.now();
  const recentStart = new Date(now - ROLLBACK_THRESHOLDS.windowMinutes * 60_000).toISOString();
  const baselineStart = new Date(
    now - ROLLBACK_THRESHOLDS.baselineHours * 3_600_000,
  ).toISOString();
  const recentEnd = new Date(now).toISOString();

  const [recent, baseline] = await Promise.all([
    countErrorsInWindow(supabase, routes, recentStart, recentEnd),
    countErrorsInWindow(supabase, routes, baselineStart, recentStart),
  ]);

  const observedPerHour = (recent / ROLLBACK_THRESHOLDS.windowMinutes) * 60;
  // baseline window = full baselineHours minus the recent window (already excluded).
  const baselineWindowHours =
    ROLLBACK_THRESHOLDS.baselineHours - ROLLBACK_THRESHOLDS.windowMinutes / 60;
  const baselinePerHour = baseline / Math.max(baselineWindowHours, 0.01);

  return {
    observed_per_hour: Number(observedPerHour.toFixed(2)),
    baseline_per_hour: Number(baselinePerHour.toFixed(2)),
    sample: recent,
  };
}

async function countErrorsInWindow(
  supabase: {
    from: (table: string) => {
      select: (cols: string, opts?: { count?: string; head?: boolean }) => unknown;
    };
  },
  routes: string[],
  startIso: string,
  endIso: string,
): Promise<number> {
  // Build one OR filter across route LIKE patterns.
  const orExpr = routes.map((r) => `route.like.${r}`).join(",");
  const q = (
    supabase.from("api_permission_errors") as unknown as {
      select: (
        c: string,
        o: { count: "exact"; head: true },
      ) => {
        gte: (col: string, v: string) => {
          lt: (col: string, v: string) => {
            or: (expr: string) => Promise<{ count: number | null; error: unknown }>;
          };
        };
      };
    }
  )
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", startIso)
    .lt("occurred_at", endIso)
    .or(orExpr);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

async function computeAiHealth(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        gte: (col: string, v: string) => {
          in: (col: string, vals: string[]) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  },
  surfaces: Array<"public" | "portal" | "admin">,
): Promise<{ observed_per_hour: number; baseline_per_hour: number; sample: number; failRate: number }> {
  const now = Date.now();
  const recentStart = new Date(now - ROLLBACK_THRESHOLDS.windowMinutes * 60_000).toISOString();

  const { data, error } = (await supabase
    .from("ai_stream_events")
    .select("completed,aborted,error_status")
    .gte("created_at", recentStart)
    .in("surface", surfaces)) as {
    data: Array<{ completed: boolean; aborted: boolean; error_status: number | null }> | null;
    error: unknown;
  };
  if (error || !data) {
    return { observed_per_hour: 0, baseline_per_hour: 0, sample: 0, failRate: 0 };
  }
  const total = data.length;
  const failed = data.filter(
    (r) => r.aborted || r.error_status !== null || r.completed === false,
  ).length;
  const failRate = total > 0 ? failed / total : 0;
  const observedPerHour = (failed / ROLLBACK_THRESHOLDS.windowMinutes) * 60;
  return {
    observed_per_hour: Number(observedPerHour.toFixed(2)),
    baseline_per_hour: 0, // AI signal uses failRate, not ratio
    sample: total,
    failRate,
  };
}

function classifyRoute(
  observed_per_hour: number,
  baseline_per_hour: number,
): { severity: Severity; ratio: number | null; reason: string } {
  if (observed_per_hour < ROLLBACK_THRESHOLDS.minObservedPerHour) {
    return {
      severity: "ok",
      ratio: baseline_per_hour > 0 ? Number((observed_per_hour / baseline_per_hour).toFixed(2)) : null,
      reason: "المعدل ضمن الطبيعي.",
    };
  }
  if (baseline_per_hour <= 0) {
    // No baseline yet: warn if observed is very high, otherwise ok.
    return observed_per_hour >= ROLLBACK_THRESHOLDS.minObservedPerHour * 2
      ? { severity: "warn", ratio: null, reason: "طفرة أخطاء بدون خط أساس." }
      : { severity: "ok", ratio: null, reason: "لا يوجد خط أساس بعد." };
  }
  const ratio = observed_per_hour / baseline_per_hour;
  if (ratio >= ROLLBACK_THRESHOLDS.rollbackRatio) {
    return {
      severity: "rollback",
      ratio: Number(ratio.toFixed(2)),
      reason: `الأخطاء ${ratio.toFixed(1)}× ضعف المعتاد — يوصى بالتراجع.`,
    };
  }
  if (ratio >= ROLLBACK_THRESHOLDS.warnRatio) {
    return {
      severity: "warn",
      ratio: Number(ratio.toFixed(2)),
      reason: `ارتفاع ملحوظ (${ratio.toFixed(1)}×) — مراقبة.`,
    };
  }
  return {
    severity: "ok",
    ratio: Number(ratio.toFixed(2)),
    reason: "المعدل مقبول.",
  };
}

function classifyAi(sample: number, failRate: number): { severity: Severity; reason: string } {
  if (sample < ROLLBACK_THRESHOLDS.aiMinSample) {
    return { severity: "ok", reason: `عيّنة صغيرة (${sample}).` };
  }
  if (failRate >= ROLLBACK_THRESHOLDS.aiMinFailureRate * 2) {
    return {
      severity: "rollback",
      reason: `${(failRate * 100).toFixed(0)}٪ من التدفقات فشلت — يوصى بالتراجع.`,
    };
  }
  if (failRate >= ROLLBACK_THRESHOLDS.aiMinFailureRate) {
    return {
      severity: "warn",
      reason: `${(failRate * 100).toFixed(0)}٪ فشل — مراقبة.`,
    };
  }
  return { severity: "ok", reason: "أداء طبيعي." };
}

/** Core health computation shared by admin UI + cron watchdog. */
export async function computeV3Health(
  supabase: unknown,
  flagsState: Array<{ key: string; enabled: boolean }>,
): Promise<V3RollbackHealth> {
  const enabledMap = new Map(flagsState.map((f) => [f.key, f.enabled]));
  const results: FlagHealth[] = [];

  for (const def of V3_FLAGS) {
    const enabled = enabledMap.get(def.key) ?? false;
    const signal = SIGNALS[def.key] ?? { kind: "skip", reason: "غير مربوط" };
    const base: Omit<FlagHealth, "severity" | "reason"> = {
      key: def.key,
      title: def.title,
      pillar: def.pillar,
      enabled,
      observed_per_hour: null,
      baseline_per_hour: null,
      ratio: null,
      sample_size: 0,
    };

    if (!enabled || signal.kind === "skip") {
      results.push({
        ...base,
        severity: enabled ? "unknown" : "ok",
        reason: enabled
          ? signal.kind === "skip"
            ? signal.reason
            : "غير مفعّل"
          : "معطّل",
      });
      continue;
    }

    if (signal.kind === "routes") {
      const h = await computeRouteHealth(
        supabase as Parameters<typeof computeRouteHealth>[0],
        signal.routes,
      );
      const cls = classifyRoute(h.observed_per_hour, h.baseline_per_hour);
      results.push({
        ...base,
        observed_per_hour: h.observed_per_hour,
        baseline_per_hour: h.baseline_per_hour,
        ratio: cls.ratio,
        sample_size: h.sample,
        severity: cls.severity,
        reason: cls.reason,
      });
    } else if (signal.kind === "ai") {
      const h = await computeAiHealth(
        supabase as Parameters<typeof computeAiHealth>[0],
        signal.surfaces,
      );
      const cls = classifyAi(h.sample, h.failRate);
      results.push({
        ...base,
        observed_per_hour: h.observed_per_hour,
        sample_size: h.sample,
        severity: cls.severity,
        reason: cls.reason,
      });
    }
  }

  const summary = { ok: 0, warn: 0, rollback: 0, unknown: 0 };
  for (const r of results) summary[r.severity]++;

  return {
    window_minutes: ROLLBACK_THRESHOLDS.windowMinutes,
    generated_at: new Date().toISOString(),
    flags: results,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public server functions

export const getV3RollbackHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<V3RollbackHealth> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("ai_feature_flags")
      .select("key, enabled")
      .in(
        "key",
        V3_FLAGS.map((f) => f.key),
      );
    if (error) throw new Error(error.message);
    return computeV3Health(
      context.supabase,
      (data ?? []) as Array<{ key: string; enabled: boolean }>,
    );
  });

const RollbackInput = z.object({
  key: z.string().min(3).max(80),
  reason: z.string().max(500).optional(),
});

export const rollbackV3Flag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RollbackInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const def = V3_FLAGS.find((f) => f.key === data.key);
    if (!def) throw new Error("مفتاح غير معروف");

    // Read current state for audit.
    const { data: before } = await context.supabase
      .from("ai_feature_flags")
      .select("key, enabled, notes")
      .eq("key", data.key)
      .maybeSingle();

    const { error: upsertErr } = await context.supabase.from("ai_feature_flags").upsert(
      {
        key: data.key,
        enabled: false,
        notes: data.reason ? `[rollback] ${data.reason}` : "[rollback]",
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (upsertErr) throw new Error(upsertErr.message);

    // Bust in-instance cache for cached platform flags.
    if (data.key === "v3.platform.rate_limit_unified") {
      const { bustRateLimitFlagCache } = await import("./rate-limit-unified.server");
      bustRateLimitFlagCache();
    }

    // Audit.
    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId,
      action: "v3_rollback",
      entity_type: "v3_flag",
      entity_id: data.key,
      before_data: before ?? null,
      after_data: { enabled: false },
      metadata: {
        pillar: def.pillar,
        phase: def.phase,
        reason: data.reason ?? null,
        triggered_by: "manual",
      },
    });

    return { ok: true };
  });
