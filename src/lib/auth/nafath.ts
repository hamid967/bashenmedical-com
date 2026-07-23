/**
 * Nafath adapter — INTERFACE ONLY, deliberately not wired to a real gateway.
 *
 * The Phase 2 spec requires a "future-ready Nafath adapter without pretending
 * it is connected." Both entry points return `not_configured` so no code
 * path can accidentally treat this as a successful identity verification.
 * When we integrate for real, the implementation replaces the bodies of
 * `initiate` and `poll` — the return shape stays stable.
 */

export type NafathInitiate =
  | { status: "not_configured" }
  | { status: "pending"; transactionId: string; randomNumber: string; expiresAt: string }
  | { status: "error"; error: string };

export type NafathPoll =
  | { status: "not_configured" }
  | { status: "pending" }
  | { status: "approved"; nationalId: string; fullName: string; iat: string }
  | { status: "rejected" }
  | { status: "expired" }
  | { status: "error"; error: string };

export async function initiateNafath(_nationalId: string): Promise<NafathInitiate> {
  return { status: "not_configured" };
}

export async function pollNafath(_transactionId: string): Promise<NafathPoll> {
  return { status: "not_configured" };
}

export function isNafathConfigured(): boolean {
  // Real check will inspect provider env vars; deliberately false today.
  return false;
}
