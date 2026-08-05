/**
 * Extract and validate a Supabase access token from an Authorization Bearer header.
 * Used by public booking APIs that must reject anonymous callers.
 */
import { createClient } from "@supabase/supabase-js";

export type BearerUser = {
  userId: string;
  accessToken: string;
};

export async function requireBearerUser(
  request: Request,
): Promise<{ ok: true; user: BearerUser } | { ok: false; status: number; message: string; code: string }> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "يجب تسجيل الدخول أو إنشاء حساب لحجز موعد.",
    };
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    return {
      ok: false,
      status: 500,
      code: "AUTH_CONFIG",
      message: "تعذّر التحقق من الجلسة حاليًا.",
    };
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_INVALID",
      message: "انتهت صلاحية الجلسة. سجّل الدخول ثم أعد المحاولة.",
    };
  }

  return { ok: true, user: { userId: data.user.id, accessToken: token } };
}
