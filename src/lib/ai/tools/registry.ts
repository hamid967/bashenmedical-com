/**
 * Baeshen AI Assistant — typed tool registry (Phase 10).
 *
 * Single source of truth for which tools each scope (visitor / patient /
 * staff) is allowed to see and invoke. The chat route consults this to
 * shape system prompts; the /api/ai/action route consults it to gate
 * execution. Adding a tool without updating this registry means it is
 * NOT callable — deny-by-default.
 *
 * Phase 10 policy:
 *   - visitor + patient: read-only navigation + patient mutations (existing
 *     cancel/reschedule) behind the `ai.assistant.mutations.enabled` flag
 *     and explicit user confirmation via the ```action fence.
 *   - staff: read-only ONLY. No mutating tools are enabled for staff scope
 *     until a signed-off security review lands. Staff callers to
 *     /api/ai/action are rejected regardless of the feature flag.
 */

export type AssistantScope = "guest" | "patient" | "staff";

export type ToolKind = "read" | "mutation";

export interface ToolDef {
  /** Tool identifier used in the ```action fence and audit log. */
  name: string;
  /** One-line human-readable label (Arabic) shown in prompts. */
  labelAr: string;
  kind: ToolKind;
  /** Scopes allowed to see this tool suggested by the model. */
  allowedScopes: readonly AssistantScope[];
  /** Requires the user to click "confirm" in the UI before /api/ai/action runs it. */
  requiresConfirmation: boolean;
  /** Master feature flag; if unset the tool is enabled unless kind === "mutation". */
  featureFlag?: string;
}

export const TOOL_REGISTRY: Record<string, ToolDef> = {
  // ---------- patient mutations (existing) ----------
  cancel_appointment: {
    name: "cancel_appointment",
    labelAr: "إلغاء موعد",
    kind: "mutation",
    allowedScopes: ["patient"],
    requiresConfirmation: true,
    featureFlag: "ai.assistant.mutations.enabled",
  },
  reschedule_appointment: {
    name: "reschedule_appointment",
    labelAr: "إعادة جدولة موعد",
    kind: "mutation",
    allowedScopes: ["patient"],
    requiresConfirmation: true,
    featureFlag: "ai.assistant.mutations.enabled",
  },

  // ---------- staff read-only helpers (Phase 10) ----------
  // These are advisory: the chat route already injects the underlying data
  // as snapshot context. They are registered here so future explicit
  // tool-calling (MCP-style) can reuse the same allowlist. No mutation
  // side effects. `/api/ai/action` will reject them for `kind: "read"`.
  staff_daily_summary: {
    name: "staff_daily_summary",
    labelAr: "ملخّص اليوم التشغيلي",
    kind: "read",
    allowedScopes: ["staff"],
    requiresConfirmation: false,
  },
  staff_delayed_requests: {
    name: "staff_delayed_requests",
    labelAr: "طلبات متأخرة عن الـ SLA",
    kind: "read",
    allowedScopes: ["staff"],
    requiresConfirmation: false,
  },
  staff_draft_patient_reply: {
    name: "staff_draft_patient_reply",
    labelAr: "صياغة رد للمريض (مسودة فقط)",
    kind: "read", // model output only; sending is a separate manual step
    allowedScopes: ["staff"],
    requiresConfirmation: false,
  },

  // ---------- staff mutations (Phase 10.b — gradual rollout) ----------
  // Enabled only when BOTH `ai.assistant.staff.enabled` AND
  // `ai.assistant.staff.mutations.enabled` are true. Every call runs through
  // the two-phase confirmation flow in /api/ai/staff-action:
  //   1) phase=prepare   → returns a short-lived HMAC confirm_token + a
  //                        human-readable summary the UI must display verbatim
  //                        to the staff member.
  //   2) phase=execute   → requires that exact confirm_token AND `confirm: true`.
  //                        RLS still applies (uses the staff caller's session).
  staff_add_inbox_note: {
    name: "staff_add_inbox_note",
    labelAr: "إضافة ملاحظة داخلية لعنصر الصندوق الموحد",
    kind: "mutation",
    allowedScopes: ["staff"],
    requiresConfirmation: true,
    featureFlag: "ai.assistant.staff.mutations.enabled",
  },
} as const;


/** Tools currently allowed to appear in an ```action fence for a scope. */
export function allowedActionTools(scope: AssistantScope): ToolDef[] {
  return Object.values(TOOL_REGISTRY).filter(
    (t) => t.kind === "mutation" && t.allowedScopes.includes(scope),
  );
}

/** Deny-by-default check used by /api/ai/action. */
export function canInvoke(scope: AssistantScope, tool: string): boolean {
  const def = TOOL_REGISTRY[tool];
  if (!def) return false;
  if (def.kind !== "mutation") return false; // only mutations pass through action
  return def.allowedScopes.includes(scope);
}
