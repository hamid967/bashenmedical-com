/**
 * Shared server-side helper: resolves a guest reservation session token
 * to its verified phone number (or null when the token is invalid or
 * expired). Endpoints that mutate an appointment MUST call this before
 * touching data.
 */
export async function resolveGuestSession(
  token: string,
): Promise<{ phone: string } | null> {
  if (!token || typeof token !== "string" || token.length < 32) return null;
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { data, error } = await supabaseAdmin
    .from("guest_reservation_sessions")
    .select("phone, session_expires_at, verified_at")
    .eq("session_token", token)
    .maybeSingle();
  if (error || !data || !data.verified_at) return null;
  if (
    !data.session_expires_at ||
    new Date(data.session_expires_at).getTime() < Date.now()
  ) {
    return null;
  }
  return { phone: data.phone };
}
