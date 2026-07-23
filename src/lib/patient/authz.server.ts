/**
 * Patient-portal per-service authorization.
 *
 * Runs inside `createServerFn` handlers that already sit behind
 * `requireSupabaseAuth`. RLS scopes rows to `auth.uid()`, but that alone
 * does not deny the request — it just returns zero rows. This helper turns
 * "not a patient" into an explicit 403 so /patient routes surface a
 * Permission Denied state via `PatientRouteError` classification.
 *
 * A caller is authorized for a patient service iff:
 *   1) They do NOT hold a staff/privileged role (admin, super_admin, doctor,
 *      nurse, content_manager, staff). Staff use /admin surfaces.
 *   2) They have a patient identity — either `patients.profile_id = userId`
 *      or `patient_profiles.user_id = userId`.
 *
 * Server-only. Imported only from `*.functions.ts` handler bodies, never at
 * module scope of client-reachable files.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PatientService =
  | "appointments"
  | "reports"
  | "prescriptions"
  | "notifications"
  | "profile"
  | "dashboard";

const PRIVILEGED_ROLES = new Set([
  "admin",
  "super_admin",
  "doctor",
  "nurse",
  "content_manager",
  "staff",
]);

export class PatientAccessDeniedError extends Error {
  readonly status = 403;
  readonly code = "forbidden";
  readonly service: PatientService;
  constructor(service: PatientService, reason: string) {
    super(`Forbidden: patient.${service} — ${reason}`);
    this.name = "PatientAccessDeniedError";
    this.service = service;
  }
}

// Supabase generic type is heavy; the caller passes the authed client from
// `requireSupabaseAuth` context. Use a loose generic so this compiles across
// both the app's Database type and generic clients.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthedClient = SupabaseClient<any, any, any>;

export async function assertPatientAccess(
  supabase: AuthedClient,
  userId: string,
  service: PatientService,
): Promise<void> {
  if (!userId) {
    throw new PatientAccessDeniedError(service, "missing session user");
  }

  const [rolesRes, patientRes, profileRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("patients").select("id").eq("profile_id", userId).maybeSingle(),
    supabase.from("patient_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);

  const roles = ((rolesRes.data as { role: string }[] | null) ?? []).map((r) => r.role);
  const hasPrivileged = roles.some((r) => PRIVILEGED_ROLES.has(r));
  if (hasPrivileged) {
    throw new PatientAccessDeniedError(
      service,
      "staff accounts must use the admin portal",
    );
  }

  const hasPatientRow = Boolean(patientRes.data?.id);
  const hasPatientProfile = Boolean(profileRes.data?.user_id);
  if (!hasPatientRow && !hasPatientProfile) {
    throw new PatientAccessDeniedError(
      service,
      "no patient record linked to this account",
    );
  }
}
