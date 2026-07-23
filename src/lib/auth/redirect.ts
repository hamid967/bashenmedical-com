/**
 * Same-origin redirect-back helper.
 *
 * The `next` search param on `/auth/login` MUST be a same-origin path so we
 * cannot be tricked into an open-redirect (a phishing site could otherwise
 * append `?next=https://evil.example/`). Rules:
 *   - starts with a single "/" and NOT "//" (protocol-relative)
 *   - never routes back to any `/auth/*` page (would trap the user)
 *   - never routes to `/forbidden` (dead-end)
 *   - hard cap length so it fits comfortably in a URL bar
 */
const MAX_LEN = 2048;

export function sanitizeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (next.length > MAX_LEN) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  if (next.startsWith("/auth/") || next === "/auth") return null;
  if (next.startsWith("/forbidden")) return null;
  return next;
}

/**
 * Post-login home per primary role. Server also enforces this — the client
 * copy exists so the login page can navigate synchronously after Supabase
 * resolves the session and the server fn returns the role list.
 */
export type PrimaryRole =
  | "patient"
  | "doctor"
  | "admin"
  | "super_admin"
  | "content_manager"
  | "staff"
  | "unknown";

const HOME_BY_ROLE: Record<PrimaryRole, string> = {
  patient: "/patient",
  doctor: "/doctor/workspace",
  admin: "/admin",
  super_admin: "/admin",
  content_manager: "/admin",
  staff: "/admin",
  unknown: "/forbidden",
};

// Roles that map to the staff bucket for redirect purposes.
const STAFF_ROLES = new Set([
  "reception",
  "pharmacy",
  "center_admin",
  "branch_manager",
  "reports_officer",
  "billing_officer",
  "insurance_officer",
  "support_agent",
  "auditor",
]);

/** Pick the highest-privilege primary role from the user's role list. */
export function pickPrimaryRole(roles: string[]): PrimaryRole {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("doctor")) return "doctor";
  if (roles.includes("content_manager")) return "content_manager";
  if (roles.some((r) => STAFF_ROLES.has(r))) return "staff";
  if (roles.includes("patient")) return "patient";
  return "unknown";
}

export function homeForRoles(roles: string[]): string {
  return HOME_BY_ROLE[pickPrimaryRole(roles)];
}
