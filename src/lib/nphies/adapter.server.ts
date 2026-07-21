/**
 * NPHIES Adapter — server-only.
 *
 * Provides a stable eligibility contract for the booking flow while
 * abstracting the real payer/NPHIES integration behind a pluggable driver.
 *
 * Modes (env `NPHIES_MODE`):
 *   - `mock`    (default): reuses the internal `estimate_appointment_cost` RPC.
 *   - `sandbox`: same as mock for now; kept for future NPHIES sandbox HTTP.
 *   - `live`   : real NPHIES HTTP call — requires `NPHIES_BASE_URL`,
 *                `NPHIES_CLIENT_ID`, `NPHIES_CLIENT_SECRET`. Not yet
 *                implemented; throws until credentials are wired.
 *
 * Every call is logged to `public.nphies_requests` (service_role) for
 * audit/observability — the log is best-effort and never blocks the
 * response returned to the caller.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

function currentMode(): NphiesMode {
  const m = (process.env.NPHIES_MODE ?? "mock").toLowerCase();
  return m === "live" || m === "sandbox" ? (m as NphiesMode) : "mock";
}

function adminClient() {
  const url = process.env.SUPABASE_URL!;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY!;
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

async function liveDriver(_input: EligibilityInput): Promise<EligibilityResult> {
  // Real NPHIES call goes here once credentials + FHIR CoverageEligibilityRequest
  // are onboarded. Kept as a stub so misconfiguration fails loud, not silent.
  throw new Error("NPHIES live driver not configured");
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
): Promise<{ mode: NphiesMode; result: EligibilityResult }> {
  const mode = currentMode();
  const started = Date.now();
  try {
    const result = mode === "live" ? await liveDriver(input) : await mockDriver(input);
    await logRequest({
      mode,
      input,
      result,
      latency_ms: Date.now() - started,
      http_status: 200,
    });
    return { mode, result };
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
