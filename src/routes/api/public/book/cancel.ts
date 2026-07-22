/**
 * Public API — POST /api/public/book/cancel
 *
 * Patient-side cancellation via booking reference + phone. The reference is
 * `BAA-XXXXXXXX` where XXXXXXXX is the first 8 hex characters of the
 * appointment UUID (no dashes) — same shape produced by /create.
 *
 * Rules:
 *   - Validation errors  → HTTP 400 { ok:false, kind:'validation', message }
 *   - Not found / phone  → HTTP 404 { ok:false, kind:'not_found', message }
 *   - Already cancelled  → HTTP 409 { ok:false, kind:'state', message }
 *   - Past appointment   → HTTP 409 { ok:false, kind:'state', message }
 *   - DB failure         → HTTP 500 { ok:false, kind:'server', message }
 *   - Success            → HTTP 200 { ok:true }
 *
 * Uses supabaseAdmin because anon has no SELECT on appointments, and the
 * reference→uuid lookup + phone check IS the authorization here. Never
 * return PII or full uuids.
 */
import { createFileRoute } from "@tanstack/react-router";
import { riyadhTodayIso } from "@/lib/riyadh-date";
import { z } from "zod";

const cancelSchema = z.object({
  reference: z
    .string()
    .trim()
    .regex(/^BAA-[0-9A-F]{8}$/i, "المرجع غير صالح. الصيغة المتوقعة BAA-XXXXXXXX."),
  phone: z.string().trim().min(6, "رقم الهاتف قصير جدًا").max(32, "رقم الهاتف طويل جدًا"),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/book/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, {
            ok: false,
            kind: "validation",
            message: "طلب غير صالح.",
          });
        }

        const parsed = cancelSchema.safeParse(body);
        if (!parsed.success) {
          return json(400, {
            ok: false,
            kind: "validation",
            message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
          });
        }

        const refHex = parsed.data.reference.slice(4).toLowerCase();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Look up by phone (narrow index) then match the reference prefix
          // in-memory. PostgREST cannot `ilike` a uuid column directly, and a
          // per-phone lookup is typically 1-few rows so this stays cheap.
          const { data: candidates, error: readErr } = await supabaseAdmin
            .from("appointments")
            .select("id, status, appointment_date, appointment_time, patient_phone")
            .eq("patient_phone", parsed.data.phone)
            .order("created_at", { ascending: false })
            .limit(50);
          if (readErr) {
            return json(500, {
              ok: false,
              kind: "server",
              message: "تعذّر التحقّق من الحجز.",
            });
          }

          const match = (candidates ?? []).find((a) =>
            String(a.id).replace(/-/g, "").toLowerCase().startsWith(refHex),
          );

          if (!match) {
            return json(404, {
              ok: false,
              kind: "not_found",
              message: "لم يتم العثور على حجز مطابق. تحقّق من المرجع ورقم الجوال.",
            });
          }

          if (match.status === "cancelled") {
            return json(409, {
              ok: false,
              kind: "state",
              message: "الحجز ملغى مسبقًا.",
            });
          }
          if (match.status === "completed" || match.status === "no_show") {
            return json(409, {
              ok: false,
              kind: "state",
              message: "لا يمكن إلغاء موعد منتهٍ.",
            });
          }

          // "اليوم" يجب أن يُحسب بتوقيت الرياض — نفس التوقيت الذي يعرضه الحجز.
          // استخدام UTC هنا كان يسمح/يمنع الإلغاء خطأً ٣ ساعات حول منتصف الليل.
          const todayIso = riyadhTodayIso();
          if (String(match.appointment_date) < todayIso) {
            return json(409, {
              ok: false,
              kind: "state",
              message: "لا يمكن إلغاء موعد سابق.",
            });
          }

          // Route through update_appointment_status so the audit trigger
          // sees a non-blank reason (required for status='cancelled'). The
          // slot release is a separate SECURITY DEFINER RPC.
          const selfReason = "إلغاء ذاتي عبر رابط المتابعة العام";
          const { error: updErr } = await supabaseAdmin.rpc("update_appointment_status", {
            _id: match.id,
            _status: "cancelled",
            _reason: selfReason,
          } as any);
          if (updErr) {
            return json(500, {
              ok: false,
              kind: "server",
              message: "تعذّر إلغاء الحجز. حاول لاحقًا.",
            });
          }
          await supabaseAdmin.rpc("release_slot", { p_appointment_id: match.id });

          return json(200, { ok: true });
        } catch {
          return json(500, {
            ok: false,
            kind: "server",
            message: "خطأ داخلي غير متوقع.",
          });
        }
      },
    },
  },
});
