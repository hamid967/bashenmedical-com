/**
 * NPHIES Adapter — server-only.
 *
 * Modes (env `NPHIES_MODE`):
 *   - `mock`    (default): reuses the internal `estimate_appointment_cost` RPC.
 *   - `sandbox` : real HTTP against NPHIES sandbox — requires
 *                 `NPHIES_BASE_URL`, `NPHIES_CLIENT_ID`, `NPHIES_CLIENT_SECRET`.
 *   - `live`    : real HTTP against NPHIES production — same secrets, plus a
 *                 hard `NPHIES_ALLOW_LIVE=true` guard to prevent accidental
 *                 traffic when mock/sandbox is intended.
 *
 * Every call is logged to `public.nphies_requests` (service_role) for
 * audit/observability — the log is best-effort and never blocks the
 * response returned to the caller.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  validateEligibilityRequest,
  validateEligibilityResponse,
  summarizeIssues,
  type FhirIssue,
} from "./fhir-validator";

export type NphiesMode = "mock" | "sandbox" | "live";

export interface EligibilityInput {
  doctor_id: string;
  provider_id: string;
  policy_number?: string | null;
  member_id?: string | null;
  patient_national_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  coverage_percent: number | null;
  consultation_fee: number | null;
  covered_amount: number | null;
  patient_share: number | null;
  coverage_tier?: string | null;
}

export interface NphiesConfigReport {
  mode: NphiesMode;
  requested_mode: string;
  effective_mode: NphiesMode;
  live_allowed: boolean;
  has_base_url: boolean;
  has_client_id: boolean;
  has_client_secret: boolean;
  ready: boolean;
  warnings: string[];
}

function requestedMode(): NphiesMode {
  const m = (process.env.NPHIES_MODE ?? "mock").toLowerCase();
  return m === "live" || m === "sandbox" ? (m as NphiesMode) : "mock";
}

/**
 * Effective mode = requested, but downgrade to `mock` when the requested
 * mode is not safe to run (missing secrets, or `live` without explicit
 * NPHIES_ALLOW_LIVE=true). Fails loud in the audit log via `warnings`.
 */
function resolveMode(): { mode: NphiesMode; report: NphiesConfigReport } {
  const requested = requestedMode();
  const hasBase = !!process.env.NPHIES_BASE_URL;
  const hasId = !!process.env.NPHIES_CLIENT_ID;
  const hasSecret = !!process.env.NPHIES_CLIENT_SECRET;
  const liveAllowed = (process.env.NPHIES_ALLOW_LIVE ?? "").toLowerCase() === "true";
  const warnings: string[] = [];

  let effective: NphiesMode = requested;
  if (requested !== "mock" && !(hasBase && hasId && hasSecret)) {
    warnings.push("NPHIES secrets missing — downgraded to mock.");
    effective = "mock";
  }
  if (requested === "live" && !liveAllowed) {
    warnings.push("NPHIES_ALLOW_LIVE is not 'true' — downgraded to sandbox/mock.");
    effective = hasBase && hasId && hasSecret ? "sandbox" : "mock";
  }

  return {
    mode: effective,
    report: {
      mode: effective,
      requested_mode: process.env.NPHIES_MODE ?? "mock",
      effective_mode: effective,
      live_allowed: liveAllowed,
      has_base_url: hasBase,
      has_client_id: hasId,
      has_client_secret: hasSecret,
      ready:
        effective === "mock" ||
        (hasBase && hasId && hasSecret && (effective === "sandbox" || liveAllowed)),
      warnings,
    },
  };
}

/** Public read-only config snapshot for admin dashboards. Never returns secrets. */
export function getConfigReport(): NphiesConfigReport {
  return resolveMode().report;
}

function adminClient() {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function mockDriver(input: EligibilityInput): Promise<EligibilityResult> {
  const supa = adminClient();
  const { data, error } = await supa.rpc("estimate_appointment_cost", {
    _doctor_id: input.doctor_id,
    _provider_id: input.provider_id,
  });
  if (error) throw new Error(error.message);
  const est = (data ?? {}) as Record<string, unknown>;
  return {
    eligible: est.eligible === true,
    reason: (est.reason as string) ?? "unknown",
    coverage_percent: (est.coverage_percent as number | null) ?? null,
    consultation_fee: (est.consultation_fee as number | null) ?? null,
    covered_amount: (est.covered_amount as number | null) ?? null,
    patient_share: (est.patient_share as number | null) ?? null,
    coverage_tier: (est.coverage_tier as string | null) ?? null,
  };
}

/** In-memory OAuth token cache — trimmed 30s before expiry to avoid boundary 401s. */
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) return cachedToken.token;

  const baseUrl = process.env.NPHIES_BASE_URL!.replace(/\/+$/, "");
  const clientId = process.env.NPHIES_CLIENT_ID!;
  const clientSecret = process.env.NPHIES_CLIENT_SECRET!;

  const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenRes.ok) throw new Error(`NPHIES token error: ${tokenRes.status}`);
  const body = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("NPHIES token: no access_token");
  cachedToken = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 300) * 1000,
  };
  return body.access_token;
}

function buildEligibilityRequest(input: EligibilityInput, mode: "sandbox" | "live") {
  return {
    resourceType: "CoverageEligibilityRequest",
    status: "active",
    purpose: ["validation", "benefits"],
    patient: { identifier: { value: input.patient_national_id ?? "" } },
    servicedDate: new Date().toISOString().slice(0, 10),
    insurance: [
      {
        coverage: {
          identifier: { value: input.member_id ?? input.policy_number ?? "" },
        },
      },
    ],
    provider: { identifier: { value: input.provider_id } },
    _meta: { mode },
  };
}

/**
 * Real NPHIES HTTP driver. Uses OAuth client-credentials (cached), then posts
 * a FHIR CoverageEligibilityRequest that was validated locally beforehand.
 * Any FHIR issues found are attached to the thrown error / returned result so
 * the audit log captures them for triage.
 */
async function httpDriver(
  input: EligibilityInput,
  mode: "sandbox" | "live",
): Promise<{ result: EligibilityResult; issues: FhirIssue[] }> {
  const baseUrl = process.env.NPHIES_BASE_URL!.replace(/\/+$/, "");

  const payload = buildEligibilityRequest(input, mode);
  const reqIssues = validateEligibilityRequest(payload);
  if (reqIssues.some((i) => i.severity === "error")) {
    throw new Error(`FHIR request invalid: ${summarizeIssues(reqIssues)}`);
  }

  const access_token = await getAccessToken();

  const res = await fetch(`${baseUrl}/CoverageEligibilityRequest`, {
    method: "POST",
    headers: {
      "content-type": "application/fhir+json",
      accept: "application/fhir+json",
      authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NPHIES eligibility error: ${res.status} ${text.slice(0, 240)}`);
  }
  const body = (await res.json()) as any;
  const respIssues = validateEligibilityResponse(body);

  const bene = body?.insurance?.[0] ?? {};
  const item = bene?.item?.[0] ?? {};
  const coveragePct =
    typeof item?.benefit?.[0]?.allowedUnsignedInt === "number"
      ? item.benefit[0].allowedUnsignedInt
      : null;
  const consultationFee = typeof item?.unitPrice?.value === "number" ? item.unitPrice.value : null;
  const coveredAmount =
    consultationFee != null && coveragePct != null
      ? Math.round((consultationFee * coveragePct) / 100)
      : null;
  const patientShare =
    consultationFee != null && coveredAmount != null ? consultationFee - coveredAmount : null;

  return {
    result: {
      eligible: bene?.inforce === true || body?.outcome === "complete",
      reason: body?.disposition ?? "nphies_response",
      coverage_percent: coveragePct,
      consultation_fee: consultationFee,
      covered_amount: coveredAmount,
      patient_share: patientShare,
      coverage_tier: bene?.coverage?.classification ?? null,
    },
    issues: [...reqIssues, ...respIssues],
  };
}

/** Ping the NPHIES OAuth endpoint — used by admin "test connection" button. */
export async function pingNphies(): Promise<{
  ok: boolean;
  latency_ms: number;
  mode: NphiesMode;
  message: string;
}> {
  const { mode } = resolveMode();
  const started = Date.now();
  if (mode === "mock") {
    return { ok: true, latency_ms: 0, mode, message: "mock mode — no external call" };
  }
  try {
    await getAccessToken();
    return {
      ok: true,
      latency_ms: Date.now() - started,
      mode,
      message: "OAuth token endpoint reachable",
    };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - started,
      mode,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function logRequest(row: {
  mode: NphiesMode;
  input: EligibilityInput;
  result?: EligibilityResult;
  latency_ms: number;
  http_status: number;
  error_message?: string | null;
}) {
  try {
    const supa = adminClient();
    await supa.from("nphies_requests").insert({
      mode: row.mode,
      provider_id: row.input.provider_id ?? null,
      doctor_id: row.input.doctor_id ?? null,
      policy_number: row.input.policy_number ?? null,
      member_id: row.input.member_id ?? null,
      patient_national_id: row.input.patient_national_id ?? null,
      eligible: row.result?.eligible ?? null,
      reason: row.result?.reason ?? null,
      coverage_percent: row.result?.coverage_percent ?? null,
      consultation_fee: row.result?.consultation_fee ?? null,
      covered_amount: row.result?.covered_amount ?? null,
      patient_share: row.result?.patient_share ?? null,
      latency_ms: row.latency_ms,
      http_status: row.http_status,
      error_message: row.error_message ?? null,
      raw_request: JSON.parse(JSON.stringify(row.input)),
      raw_response: row.result ? JSON.parse(JSON.stringify(row.result)) : null,
      ip: row.input.ip ?? null,
      user_agent: row.input.user_agent ?? null,
    });
  } catch {
    // Audit log failures are never surfaced to the caller.
  }
}

export async function checkEligibility(
  input: EligibilityInput,
): Promise<{ mode: NphiesMode; result: EligibilityResult; config: NphiesConfigReport }> {
  const { mode, report } = resolveMode();
  const started = Date.now();
  try {
    const result =
      mode === "mock" ? await mockDriver(input) : await httpDriver(input, mode);
    await logRequest({
      mode,
      input,
      result,
      latency_ms: Date.now() - started,
      http_status: 200,
    });
    return { mode, result, config: report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logRequest({
      mode,
      input,
      latency_ms: Date.now() - started,
      http_status: 500,
      error_message: message,
    });
    throw err;
  }
}
