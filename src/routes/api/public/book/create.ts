/**
 * Public API — POST /api/public/book/create
 *
 * Server-side alternative to the client-only insert in /book. Both paths
 * MUST return the same Arabic strings for both Zod validation failures and
 * PostgREST/RLS failures, so external callers, e2e harnesses, and the UI
 * see one consistent user-facing error surface.
 *
 * Rules:
 *   - Validation errors → HTTP 400 { ok:false, kind:'validation', message }
 *     where `message` is the FIRST Zod issue's Arabic message.
 *   - DB / RLS errors    → HTTP 400 { ok:false, kind:'db', message }
 *     where `message` is `friendlyInsertError(error)` (from
 *     src/lib/insert-errors.ts) — NEVER the raw PostgREST text.
 *   - Success            → HTTP 200 { ok:true }.
 *
 * The endpoint uses the publishable (anon) Supabase key so DB triggers and
 * RLS behave exactly as they do for the public /book UI. Bad JSON is folded
 * into the generic `unknown` friendly message rather than leaking a parser
 * error.
 */
import { createFileRoute } from "@tanstack/react-router";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { friendlyInsertError, FRIENDLY_INSERT_MESSAGES } from "@/lib/insert-errors";
// Single source of truth — shared with the client wizard.
// See src/lib/booking-limits.ts and src/components/booking/types.ts.
import {
  NAME_MIN,
  NAME_MAX,
  PHONE_MIN,
  PHONE_MAX,
  NID_MAX,
  REASON_MAX,
  PHONE_RE,
} from "@/lib/booking-limits";

const bookingCreateSchema = z.object({
  patient_name: z
    .string()
    .trim()
    .min(NAME_MIN, "الاسم قصير جدًا (٢ أحرف على الأقل)")
    .max(NAME_MAX, "الاسم طويل جدًا"),
  patient_phone: z
    .string()
    .trim()
    .min(PHONE_MIN, "رقم الهاتف قصير جدًا")
    .max(PHONE_MAX, "رقم الهاتف طويل جدًا")
    .regex(PHONE_RE, "رقم الهاتف يحتوي على أحرف غير مسموحة"),
  patient_email: z
    .string()
    .trim()
    .max(255, "البريد الإلكتروني طويل جدًا")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "بريد إلكتروني غير صالح")
    .optional()
    .nullable(),
  national_id: z.string().trim().max(NID_MAX, "رقم الهوية طويل جدًا").optional().nullable(),
  gender: z.enum(["male", "female"], { message: "الجنس غير صالح" }).optional(),
  specialty_id: z.string().uuid("قيمة غير صالحة").optional().nullable(),
  doctor_id: z.string().uuid("قيمة غير صالحة").optional().nullable(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح"),
  appointment_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "وقت غير صالح"),
  reason: z
    .string()
    .trim()
    .max(REASON_MAX, `السبب طويل جدًا (الحد الأقصى ${REASON_MAX} حرفًا)`)
    .optional()
    .nullable(),
  reminder_24h: z.boolean().optional(),
  reminder_2h: z.boolean().optional(),
  insurance_provider_id: z.string().uuid("جهة تأمين غير صالحة").optional().nullable(),
  insurance_policy_number: z.string().trim().max(64, "رقم البوليصة طويل").optional().nullable(),
  insurance_member_id: z.string().trim().max(64, "رقم العضو طويل").optional().nullable(),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

type InsuranceInput = {
  doctor_id?: string | null;
  insurance_provider_id?: string | null;
  insurance_policy_number?: string | null;
  insurance_member_id?: string | null;
};

// Estimate cost using the same DB function the /verify endpoint uses so the
// stored numbers on the appointment stay consistent with what the wizard
// showed the patient. Failure to estimate must not block the booking — we
// just persist the provider selection with `insurance_status = 'pending'`.
async function buildInsurancePatch(
  supa: any,
  data: InsuranceInput,
): Promise<Record<string, unknown>> {
  const providerId = data.insurance_provider_id ?? null;
  const policy = (data.insurance_policy_number ?? "").trim() || null;
  const member = (data.insurance_member_id ?? "").trim() || null;

  if (!providerId) {
    return {
      insurance_status: "none",
    };
  }

  const patch: Record<string, unknown> = {
    insurance_provider_id: providerId,
    insurance_policy_number: policy,
    insurance_member_id: member,
    insurance_status: "pending",
  };

  if (!data.doctor_id) return patch;

  try {
    const { data: estRaw, error } = await supa.rpc("estimate_appointment_cost", {
      _doctor_id: data.doctor_id,
      _provider_id: providerId,
    });
    if (error) return patch;
    const est = (estRaw ?? {}) as {
      eligible?: boolean;
      coverage_percent?: number | null;
      estimated_cost?: number | null;
      patient_share?: number | null;
    };
    if (est.eligible === true) patch.insurance_status = "eligible";
    if (typeof est.coverage_percent === "number") {
      patch.insurance_coverage_percent = est.coverage_percent;
    }
    if (typeof est.estimated_cost === "number") {
      patch.estimated_cost_sar = est.estimated_cost;
    }
    if (typeof est.patient_share === "number") {
      patch.patient_share_sar = est.patient_share;
    }
  } catch {
    /* keep pending */
  }
  return patch;
}

export const Route = createFileRoute("/api/public/book/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "booking" }); if (_rl) return _rl;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, {
            ok: false,
            kind: "validation",
            message: FRIENDLY_INSERT_MESSAGES.unknown,
          });
        }

        const parsed = bookingCreateSchema.safeParse(body);
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? "بيانات غير صالحة";
          return json(400, { ok: false, kind: "validation", message });
        }

        // Optional Idempotency-Key: same key → same result. Guards against
        // duplicate bookings from double-clicks, retries after a timeout,
        // or navigation-triggered resends. Accept 8–128 chars, letters/
        // digits/dash/underscore only; silently ignore anything else so a
        // garbage header can't create keyless rows or break the request.
        const rawKey = request.headers.get("idempotency-key")?.trim() ?? "";
        const idempotencyKey = /^[A-Za-z0-9_-]{8,128}$/.test(rawKey) ? rawKey : null;

        const url = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !anonKey) {
          return json(500, {
            ok: false,
            kind: "db",
            message: FRIENDLY_INSERT_MESSAGES.unknown,
          });
        }

        const supa = createClient(url, anonKey, {
          auth: {
            storage: undefined,
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        // Helper: derive the tracking reference from a UUID.
        const refFromId = (id: string) =>
          "BAA-" + String(id).replace(/-/g, "").slice(0, 8).toUpperCase();

        // Idempotent replay: same key already produced a row → return the
        // same success response. Guards against double-clicks and network
        // retries. Runs BEFORE the slot conflict check so a retry after a
        // 200-that-never-reached-the-client still returns 200.
        if (idempotencyKey) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: existing } = await supabaseAdmin
              .from("appointments")
              .select("id")
              .eq("idempotency_key", idempotencyKey)
              .maybeSingle();
            if (existing?.id) {
              return json(200, { ok: true, reference: refFromId(existing.id) });
            }
          } catch {
            // Fall through — worst case the unique index below catches it.
          }
        }

        // Fast-path conflict check: same-doctor slot already taken by a
        // non-cancelled appointment. This is just for a nice 409 message —
        // the authoritative guard is the partial UNIQUE INDEX
        // `appointments_doctor_slot_unique_active` which runs inside the
        // INSERT's own transaction and makes the check atomic (no TOCTOU
        // window between check and insert).
        if (parsed.data.doctor_id) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const timeHHMM = parsed.data.appointment_time.slice(0, 5);
            const { data: existing } = await supabaseAdmin
              .from("appointments")
              .select("id,status,appointment_time")
              .eq("doctor_id", parsed.data.doctor_id)
              .eq("appointment_date", parsed.data.appointment_date);
            const clash = (existing ?? []).some(
              (r) =>
                r.status !== "cancelled" &&
                r.status !== "no_show" &&
                String(r.appointment_time).slice(0, 5) === timeHHMM,
            );
            if (clash) {
              return json(409, {
                ok: false,
                kind: "conflict",
                message: FRIENDLY_INSERT_MESSAGES.duplicate,
              });
            }
          } catch {
            // Fall through — DB unique index still guards atomically.
          }
        }

        // Keep the anon insert path exactly as before so triggers + RLS
        // behave identically to the /book UI. Anon has no SELECT policy, so
        // we cannot use .select() here. If two requests race past the
        // fast-path check above, the partial UNIQUE INDEX rejects the
        // second insert with SQLSTATE 23505 which we surface as 409.
        const cleanEmail = (parsed.data.patient_email ?? "").trim().toLowerCase() || null;
        const { error } = await supa.from("appointments").insert({
          patient_name: parsed.data.patient_name,
          patient_phone: parsed.data.patient_phone,
          patient_email: cleanEmail,
          national_id: parsed.data.national_id ?? null,
          gender: parsed.data.gender,
          specialty_id: parsed.data.specialty_id ?? null,
          doctor_id: parsed.data.doctor_id ?? null,
          appointment_date: parsed.data.appointment_date,
          appointment_time: parsed.data.appointment_time,
          reason: parsed.data.reason ?? null,
          ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
          ...(parsed.data.reminder_24h !== undefined
            ? { reminder_24h: parsed.data.reminder_24h }
            : {}),
          ...(parsed.data.reminder_2h !== undefined
            ? { reminder_2h: parsed.data.reminder_2h }
            : {}),
          ...(await buildInsurancePatch(supa, parsed.data)),
        });

        if (error) {
          const err = error as { message?: string; code?: string };
          const isDup = err.code === "23505" || (err.message ?? "").includes("duplicate key");

          // Concurrent replay with the same Idempotency-Key: another request
          // won the insert race. Look the row up and return its reference so
          // the client sees the same success it would have seen the first
          // time. This is different from a slot clash (below) — same key
          // means intentionally the same booking.
          if (isDup && idempotencyKey && (err.message ?? "").includes("idempotency_key")) {
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data: existing } = await supabaseAdmin
                .from("appointments")
                .select("id")
                .eq("idempotency_key", idempotencyKey)
                .maybeSingle();
              if (existing?.id) {
                return json(200, {
                  ok: true,
                  reference: refFromId(existing.id),
                });
              }
            } catch {
              /* fall through to generic conflict */
            }
          }

          if (isDup) {
            return json(409, {
              ok: false,
              kind: "conflict",
              message: FRIENDLY_INSERT_MESSAGES.duplicate,
            });
          }
          return json(400, {
            ok: false,
            kind: "db",
            message: friendlyInsertError(err),
          });
        }

        // Follow-up admin read to derive the tracking reference from the
        // just-inserted row. Prefer the idempotency key (exact match); fall
        // back to phone+date+time when the client didn't send a key. Failure
        // here must not fail the whole request — the booking is already
        // persisted; the reference is a convenience.
        let reference: string | null = null;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let foundId: string | undefined;
          if (idempotencyKey) {
            const { data } = await supabaseAdmin
              .from("appointments")
              .select("id")
              .eq("idempotency_key", idempotencyKey)
              .maybeSingle();
            foundId = data?.id;
          }
          if (!foundId) {
            const { data } = await supabaseAdmin
              .from("appointments")
              .select("id")
              .eq("patient_phone", parsed.data.patient_phone)
              .eq("appointment_date", parsed.data.appointment_date)
              .eq("appointment_time", parsed.data.appointment_time)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            foundId = data?.id;
          }
          if (foundId) reference = refFromId(foundId);
        } catch {
          // Ignore — booking is already saved; reference simply won't be returned.
        }

        return json(200, { ok: true, reference });
      },
    },
  },
});
