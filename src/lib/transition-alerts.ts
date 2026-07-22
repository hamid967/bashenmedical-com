export type AlertScope = "branch" | "actor" | "any";
export type AlertStatus = "active" | "inactive" | "archived" | "deceased" | "any";

export type AlertRule = {
  id: string;
  label?: string;
  scope: AlertScope;
  status: AlertStatus;
  threshold: number;
  enabled: boolean;
  is_shared?: boolean;
  user_id?: string;
  /** true when the current viewer owns the rule (may edit/delete). */
  is_owner?: boolean;
};

export const STATUS_LABEL: Record<AlertStatus, string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
  deceased: "متوفى",
  any: "أي حالة",
};

export const SCOPE_LABEL: Record<AlertScope, string> = {
  branch: "لكل فرع",
  actor: "لكل موظف",
  any: "الإجمالي",
};

export type Severity = "low" | "medium" | "high";

export type TriggeredAlert = {
  ruleId: string;
  scope: AlertScope;
  status: AlertStatus;
  threshold: number;
  subjectName: string;
  count: number;
  severity: Severity;
  ratio: number;
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
};

// Tailwind classes for badges/backgrounds per severity.
export const SEVERITY_STYLES: Record<
  Severity,
  { badge: string; ring: string; text: string; dot: string }
> = {
  low: {
    badge: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    ring: "border-amber-500/40 bg-amber-500/5",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  medium: {
    badge: "bg-orange-500/15 text-orange-700 border-orange-500/30",
    ring: "border-orange-500/40 bg-orange-500/5",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  high: {
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    ring: "border-destructive/40 bg-destructive/5",
    text: "text-destructive",
    dot: "bg-destructive",
  },
};

// Severity is derived from how far the count exceeds the threshold.
// < 1.5x → منخفض, 1.5x–2.5x → متوسط, ≥ 2.5x → مرتفع
export function computeSeverity(
  count: number,
  threshold: number,
): { severity: Severity; ratio: number } {
  const ratio = threshold > 0 ? count / threshold : 1;
  const severity: Severity = ratio >= 2.5 ? "high" : ratio >= 1.5 ? "medium" : "low";
  return { severity, ratio };
}

type EvalStats = {
  total: number;
  perTarget: { status: string; count: number }[];
  byBranch: { branch_id: string; branch_name: string; count: number }[];
  byActor: { actor_id: string; actor_name: string; count: number }[];
  byBranchStatus: { branch_id: string; branch_name: string; status: string; count: number }[];
  byActorStatus: { actor_id: string; actor_name: string; status: string; count: number }[];
};

function push(out: TriggeredAlert[], r: AlertRule, subjectName: string, count: number) {
  const { severity, ratio } = computeSeverity(count, r.threshold);
  out.push({
    ruleId: r.id,
    scope: r.scope,
    status: r.status,
    threshold: r.threshold,
    subjectName,
    count,
    severity,
    ratio,
  });
}

export function evaluateRules(rules: AlertRule[], stats: EvalStats): TriggeredAlert[] {
  const out: TriggeredAlert[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.scope === "any") {
      const count =
        r.status === "any"
          ? stats.total
          : (stats.perTarget.find((p) => p.status === r.status)?.count ?? 0);
      if (count >= r.threshold) push(out, r, "الإجمالي", count);
    } else if (r.scope === "branch") {
      if (r.status === "any") {
        for (const b of stats.byBranch)
          if (b.count >= r.threshold) push(out, r, b.branch_name, b.count);
      } else {
        for (const b of stats.byBranchStatus)
          if (b.status === r.status && b.count >= r.threshold) push(out, r, b.branch_name, b.count);
      }
    } else {
      if (r.status === "any") {
        for (const a of stats.byActor)
          if (a.count >= r.threshold) push(out, r, a.actor_name, a.count);
      } else {
        for (const a of stats.byActorStatus)
          if (a.status === r.status && a.count >= r.threshold) push(out, r, a.actor_name, a.count);
      }
    }
  }
  // Sort by severity (high → low), then by count desc.
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((x, y) => order[x.severity] - order[y.severity] || y.count - x.count);
}

// ---------- Timeline ----------

export type TimelineEventKind = "first-trigger" | "escalation" | "increment";

export type AlertTimelineEntry = {
  day: string;
  ruleId: string;
  ruleLabel?: string;
  scope: AlertScope;
  status: AlertStatus;
  threshold: number;
  subjectName: string;
  subjectId: string; // "__all__" for scope=any
  delta: number; // events on this day contributing to this subject
  cumulative: number;
  severity: Severity;
  ratio: number;
  kind: TimelineEventKind;
};

type TimelineStats = {
  daily: {
    day: string;
    total: number;
    active: number;
    inactive: number;
    archived: number;
    deceased: number;
  }[];
  dailyByBranchStatus: {
    day: string;
    branch_id: string;
    branch_name: string;
    status: string;
    count: number;
  }[];
  dailyByActorStatus: {
    day: string;
    actor_id: string;
    actor_name: string;
    status: string;
    count: number;
  }[];
};

const SEV_LEVEL: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

/**
 * Build a chronological log of when each enabled rule first triggered
 * (and every subsequent day it escalated or accumulated further) within
 * the period covered by `stats`.
 *
 * Cumulative counts run per (rule, subject) across the visible period.
 */
export function buildAlertTimeline(rules: AlertRule[], stats: TimelineStats): AlertTimelineEntry[] {
  const out: AlertTimelineEntry[] = [];

  // Collect ordered unique days from the daily series.
  const allDays = [...stats.daily].map((d) => d.day).sort();

  for (const r of rules) {
    if (!r.enabled) continue;

    // subjectId -> subjectName; deltas per day per subject
    const subjects = new Map<string, string>();
    const dayDeltas = new Map<string, Map<string, number>>(); // day -> (subjectId -> delta)

    const addDelta = (day: string, id: string, name: string, n: number) => {
      if (n <= 0) return;
      subjects.set(id, name);
      let m = dayDeltas.get(day);
      if (!m) {
        m = new Map();
        dayDeltas.set(day, m);
      }
      m.set(id, (m.get(id) ?? 0) + n);
    };

    if (r.scope === "any") {
      for (const d of stats.daily) {
        const n =
          r.status === "any" ? d.total : ((d as unknown as Record<string, number>)[r.status] ?? 0);
        addDelta(d.day, "__all__", "الإجمالي", n);
      }
    } else if (r.scope === "branch") {
      for (const b of stats.dailyByBranchStatus) {
        if (r.status !== "any" && b.status !== r.status) continue;
        addDelta(b.day, b.branch_id, b.branch_name, b.count);
      }
    } else {
      for (const a of stats.dailyByActorStatus) {
        if (r.status !== "any" && a.status !== r.status) continue;
        addDelta(a.day, a.actor_id, a.actor_name, a.count);
      }
    }

    // Walk days chronologically per subject, tracking cumulative + severity.
    const cum = new Map<string, number>();
    const lastSev = new Map<string, Severity | null>();
    for (const day of allDays) {
      const perSubject = dayDeltas.get(day);
      if (!perSubject) continue;
      for (const [id, delta] of perSubject) {
        const prev = cum.get(id) ?? 0;
        const next = prev + delta;
        cum.set(id, next);
        if (next < r.threshold) continue; // still below threshold — no timeline entry
        const { severity, ratio } = computeSeverity(next, r.threshold);
        const previousSev = lastSev.get(id) ?? null;
        let kind: TimelineEventKind;
        if (previousSev == null) kind = "first-trigger";
        else if (SEV_LEVEL[severity] > SEV_LEVEL[previousSev]) kind = "escalation";
        else kind = "increment";
        lastSev.set(id, severity);
        out.push({
          day,
          ruleId: r.id,
          ruleLabel: r.label,
          scope: r.scope,
          status: r.status,
          threshold: r.threshold,
          subjectName: subjects.get(id) ?? "—",
          subjectId: id,
          delta,
          cumulative: next,
          severity,
          ratio,
          kind,
        });
      }
    }
  }

  // Newest first.
  return out.sort((a, b) =>
    a.day < b.day ? 1 : a.day > b.day ? -1 : SEV_LEVEL[b.severity] - SEV_LEVEL[a.severity],
  );
}

export const TIMELINE_KIND_LABEL: Record<TimelineEventKind, string> = {
  "first-trigger": "أول تشغيل",
  escalation: "تصعيد",
  increment: "زيادة",
};
