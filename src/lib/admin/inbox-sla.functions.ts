/**
 * Phase 8 — Unified Inbox SLA analytics.
 *
 * Reads `inbox_items` + `inbox_events` for a date window and derives:
 *   - firstResponseMs: `created_at` → first non-`created` event
 *   - resolutionMs:    `created_at` → status change to a terminal state
 *     (completed / cancelled / appointment_created / archived)
 * Aggregates by channel / branch / status and returns breach counts against
 * priority-based SLA thresholds. Terminal states are computed from
 * `change_status` events (canonical), falling back to `updated_at` when the
 * item is currently terminal without a recorded transition.
 *
 * Staff-only via `assertInboxStaff`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  INBOX_CHANNELS,
  INBOX_PRIORITIES,
  INBOX_STATUSES,
  type InboxChannel,
  type InboxPriority,
  type InboxStatus,
  STAFF_ROLES,
  type StaffRole,
} from "./inbox.functions";

// -------------- SLA thresholds --------------
// Minutes to first response + minutes to resolution, per priority.
export const SLA_THRESHOLDS: Record<
  InboxPriority,
  { firstResponseMin: number; resolutionMin: number }
> = {
  urgent: { firstResponseMin: 15, resolutionMin: 4 * 60 },
  high: { firstResponseMin: 60, resolutionMin: 8 * 60 },
  normal: { firstResponseMin: 4 * 60, resolutionMin: 24 * 60 },
  low: { firstResponseMin: 8 * 60, resolutionMin: 72 * 60 },
};

const TERMINAL_STATUSES: readonly InboxStatus[] = [
  "completed",
  "cancelled",
  "appointment_created",
  "archived",
];
const isTerminal = (s: InboxStatus) => TERMINAL_STATUSES.includes(s);

// -------------- Auth --------------
async function assertInboxStaff(supabase: any, userId: string): Promise<StaffRole[]> {
  const checks = await Promise.all(
    STAFF_ROLES.map((r) => supabase.rpc("has_role", { _user_id: userId, _role: r })),
  );
  const held = STAFF_ROLES.filter((_, i) => checks[i]?.data === true);
  if (!held.length) throw new Error("ليست لديك صلاحية الوصول للصندوق الموحّد.");
  return held as StaffRole[];
}

// -------------- Types --------------
export type SlaBucket = {
  key: string;
  label: string;
  count: number;
  responded: number;
  resolved: number;
  avgFirstResponseMs: number | null;
  avgResolutionMs: number | null;
  breachedResponse: number;
  breachedResolution: number;
};

export type SlaBreach = {
  id: string;
  request_number: string;
  patient_name: string | null;
  channel: InboxChannel;
  branch_id: string | null;
  priority: InboxPriority;
  status: InboxStatus;
  created_at: string;
  ageMs: number;
  firstResponseMs: number | null;
  kind: "response" | "resolution";
  thresholdMin: number;
  overdueMs: number;
};

export type SlaOverview = {
  window: { from: string; to: string };
  totals: {
    items: number;
    responded: number;
    resolved: number;
    open: number;
    breachedResponse: number;
    breachedResolution: number;
    avgFirstResponseMs: number | null;
    avgResolutionMs: number | null;
  };
  byChannel: SlaBucket[];
  byBranch: SlaBucket[];
  byStatus: SlaBucket[];
  breaches: SlaBreach[];
  thresholds: typeof SLA_THRESHOLDS;
};

// -------------- Input --------------
const Input = z
  .object({
    from: z.string().optional(), // ISO date
    to: z.string().optional(),
    days: z.number().int().min(1).max(180).optional(),
  })
  .default({});

// -------------- Handler --------------
export const getInboxSlaOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<SlaOverview> => {
    await assertInboxStaff(context.supabase, context.userId);

    const now = new Date();
    const days = data.days ?? 30;
    const to = data.to ? new Date(data.to) : now;
    const from = data.from
      ? new Date(data.from)
      : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const sel = (s: string): string => s;
    type ItemRow = {
      id: string;
      request_number: string;
      patient_name: string | null;
      channel: InboxChannel;
      branch_id: string | null;
      priority: InboxPriority;
      status: InboxStatus;
      created_at: string;
      updated_at: string;
    };
    type EventRow = {
      item_id: string;
      action: string;
      to_value: any;
      created_at: string;
    };

    const { data: itemsRaw, error: itErr } = await context.supabase
      .from("inbox_items")
      .select(
        sel(
          "id, request_number, patient_name, channel, branch_id, priority, status, created_at, updated_at",
        ),
      )
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<ItemRow[]>();
    if (itErr) throw new Error(itErr.message);
    const items: ItemRow[] = itemsRaw ?? [];

    let events: EventRow[] = [];
    if (items.length) {
      const ids = items.map((i) => i.id);
      const { data: evRaw, error: evErr } = await context.supabase
        .from("inbox_events")
        .select(sel("item_id, action, to_value, created_at"))
        .in("item_id", ids)
        .order("created_at", { ascending: true })
        .limit(20000)
        .returns<EventRow[]>();
      if (evErr) throw new Error(evErr.message);
      events = evRaw ?? [];
    }

    // Group events by item
    const evByItem = new Map<string, EventRow[]>();
    for (const e of events) {
      const list = evByItem.get(e.item_id) ?? [];
      list.push(e);
      evByItem.set(e.item_id, list);
    }

    // Per-item metric derivation
    type Metric = {
      item: ItemRow;
      firstResponseMs: number | null;
      resolutionMs: number | null;
      overdueResponseMs: number;
      overdueResolutionMs: number;
    };
    const nowMs = now.getTime();
    const metrics: Metric[] = items.map((it) => {
      const createdMs = new Date(it.created_at).getTime();
      const evs = evByItem.get(it.id) ?? [];

      // first response = first event that is not `created` and not auto
      const firstRespEv = evs.find((e) => e.action && e.action !== "created");
      const firstResponseMs = firstRespEv
        ? new Date(firstRespEv.created_at).getTime() - createdMs
        : null;

      // resolution = first change_status event to a terminal status
      let resolutionMs: number | null = null;
      for (const e of evs) {
        if (e.action !== "change_status") continue;
        const nextStatus = e.to_value?.status ?? e.to_value;
        if (typeof nextStatus === "string" && isTerminal(nextStatus as InboxStatus)) {
          resolutionMs = new Date(e.created_at).getTime() - createdMs;
          break;
        }
      }
      // Fallback: item currently terminal but no matching change_status event
      if (resolutionMs === null && isTerminal(it.status)) {
        resolutionMs = new Date(it.updated_at).getTime() - createdMs;
      }

      const t = SLA_THRESHOLDS[it.priority];
      const respThresholdMs = t.firstResponseMin * 60 * 1000;
      const resolThresholdMs = t.resolutionMin * 60 * 1000;

      // Overdue for response: no response yet AND age > threshold; OR response arrived late
      const ageMs = nowMs - createdMs;
      const overdueResponseMs =
        firstResponseMs === null
          ? Math.max(0, ageMs - respThresholdMs)
          : Math.max(0, firstResponseMs - respThresholdMs);
      const overdueResolutionMs =
        resolutionMs === null
          ? Math.max(0, ageMs - resolThresholdMs)
          : Math.max(0, resolutionMs - resolThresholdMs);

      return { item: it, firstResponseMs, resolutionMs, overdueResponseMs, overdueResolutionMs };
    });

    // Aggregator factory
    const makeAgg = () => {
      const map = new Map<
        string,
        { count: number; resp: number[]; resol: number[]; bResp: number; bResol: number }
      >();
      const push = (key: string, m: Metric) => {
        const bucket = map.get(key) ?? { count: 0, resp: [], resol: [], bResp: 0, bResol: 0 };
        bucket.count++;
        if (m.firstResponseMs !== null) bucket.resp.push(m.firstResponseMs);
        if (m.resolutionMs !== null) bucket.resol.push(m.resolutionMs);
        if (m.overdueResponseMs > 0) bucket.bResp++;
        if (m.overdueResolutionMs > 0) bucket.bResol++;
        map.set(key, bucket);
      };
      return { map, push };
    };

    const byChannelAgg = makeAgg();
    const byBranchAgg = makeAgg();
    const byStatusAgg = makeAgg();
    for (const m of metrics) {
      byChannelAgg.push(m.item.channel, m);
      byBranchAgg.push(m.item.branch_id ?? "__none__", m);
      byStatusAgg.push(m.item.status, m);
    }

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const toBuckets = (
      agg: ReturnType<typeof makeAgg>,
      labelOf: (k: string) => string,
    ): SlaBucket[] =>
      Array.from(agg.map.entries())
        .map(([key, b]) => ({
          key,
          label: labelOf(key),
          count: b.count,
          responded: b.resp.length,
          resolved: b.resol.length,
          avgFirstResponseMs: avg(b.resp),
          avgResolutionMs: avg(b.resol),
          breachedResponse: b.bResp,
          breachedResolution: b.bResol,
        }))
        .sort((a, b) => b.count - a.count);

    const respAll = metrics.map((m) => m.firstResponseMs).filter((x): x is number => x !== null);
    const resolAll = metrics.map((m) => m.resolutionMs).filter((x): x is number => x !== null);

    // Breaches list (open + latent), sorted by overdue desc, capped
    const breaches: SlaBreach[] = [];
    for (const m of metrics) {
      const created = new Date(m.item.created_at).getTime();
      const ageMs = nowMs - created;
      const t = SLA_THRESHOLDS[m.item.priority];
      if (m.overdueResponseMs > 0 && m.firstResponseMs === null) {
        breaches.push({
          id: m.item.id,
          request_number: m.item.request_number,
          patient_name: m.item.patient_name,
          channel: m.item.channel,
          branch_id: m.item.branch_id,
          priority: m.item.priority,
          status: m.item.status,
          created_at: m.item.created_at,
          ageMs,
          firstResponseMs: m.firstResponseMs,
          kind: "response",
          thresholdMin: t.firstResponseMin,
          overdueMs: m.overdueResponseMs,
        });
      }
      if (m.overdueResolutionMs > 0 && m.resolutionMs === null) {
        breaches.push({
          id: m.item.id,
          request_number: m.item.request_number,
          patient_name: m.item.patient_name,
          channel: m.item.channel,
          branch_id: m.item.branch_id,
          priority: m.item.priority,
          status: m.item.status,
          created_at: m.item.created_at,
          ageMs,
          firstResponseMs: m.firstResponseMs,
          kind: "resolution",
          thresholdMin: t.resolutionMin,
          overdueMs: m.overdueResolutionMs,
        });
      }
    }
    breaches.sort((a, b) => b.overdueMs - a.overdueMs);

    // Resolve branch names for the branch buckets
    const branchIds = Array.from(byBranchAgg.map.keys()).filter((k) => k !== "__none__");
    const branchNames = new Map<string, string>();
    if (branchIds.length) {
      const { data: brs } = await context.supabase
        .from("branches")
        .select(sel("id, name_ar, name_en"))
        .in("id", branchIds)
        .returns<{ id: string; name_ar: string | null; name_en: string | null }[]>();
      for (const b of brs ?? []) branchNames.set(b.id, b.name_ar || b.name_en || b.id);
    }

    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        items: items.length,
        responded: respAll.length,
        resolved: resolAll.length,
        open: items.length - metrics.filter((m) => m.resolutionMs !== null).length,
        breachedResponse: metrics.filter((m) => m.overdueResponseMs > 0).length,
        breachedResolution: metrics.filter((m) => m.overdueResolutionMs > 0).length,
        avgFirstResponseMs: avg(respAll),
        avgResolutionMs: avg(resolAll),
      },
      byChannel: toBuckets(byChannelAgg, (k) => k),
      byBranch: toBuckets(byBranchAgg, (k) =>
        k === "__none__" ? "بدون فرع" : branchNames.get(k) ?? k.slice(0, 8),
      ),
      byStatus: toBuckets(byStatusAgg, (k) => k),
      breaches: breaches.slice(0, 100),
      thresholds: SLA_THRESHOLDS,
    };
  });

// eslint referenced for typed const array consumers
void INBOX_CHANNELS;
void INBOX_STATUSES;
void INBOX_PRIORITIES;
