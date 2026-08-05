/**
 * Client helper for the 5-minute slot-hold protocol used by /book.
 * See src/routes/api/public/book/hold.ts for the server contract.
 * Requires an authenticated Supabase session (Bearer token).
 */
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "booking:session_id";

export function getBookingSessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 8) return existing;
  } catch {
    /* fall through */
  }
  const rand = (
    globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`
  ).replace(/-/g, "");
  try {
    sessionStorage.setItem(SESSION_KEY, rand);
  } catch {
    /* ignore */
  }
  return rand;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* server rejects without token */
  }
  return headers;
}

export type HoldOk = { ok: true; id: string; expires_at: string };
export type HoldErr = {
  ok: false;
  kind: "validation" | "conflict" | "db" | "auth";
  message: string;
};
export type HoldResult = HoldOk | HoldErr;

export async function holdSlot(params: {
  doctor_id: string;
  branch_id?: string | null;
  appointment_date: string;
  appointment_time: string;
}): Promise<HoldResult> {
  const session_id = getBookingSessionId();
  try {
    const res = await fetch("/api/public/book/hold", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ ...params, session_id }),
    });
    const json = (await res.json().catch(() => ({}))) as HoldResult;
    if (res.status === 401) {
      return {
        ok: false,
        kind: "auth",
        message: (json as HoldErr).message || "يجب تسجيل الدخول لحجز موعد.",
      };
    }
    return json;
  } catch (e) {
    return { ok: false, kind: "db", message: (e as Error)?.message ?? "network" };
  }
}

export async function releaseHold(id?: string): Promise<void> {
  const session_id = getBookingSessionId();
  try {
    const body = JSON.stringify({ session_id, ...(id ? { id } : {}) });
    // Use keepalive so a release during page unload still ships.
    await fetch("/api/public/book/hold", {
      method: "DELETE",
      headers: await authHeaders(),
      body,
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
