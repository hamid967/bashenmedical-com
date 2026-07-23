/**
 * Public API — POST /api/public/book/create
 *
 * Server-side booking endpoint. Since the atomic `confirm_appointment_booking`
 * migration, all persistence goes through ONE Postgres transaction:
 *
 *   1. Validate the JSON body with Zod (same Arabic messages as /book UI).
 *   2. Compute insurance estimate (best-effort, non-blocking).
 *   3. Call rpc('confirm_appointment_booking', { p_data, p_idempotency_key }):
 *        - Replay same reference when the idempotency key matches.
 *        - Otherwise INSERT + generate BMC-YYYYMMDD-XXXX + return, atomically.
 *   4. Slot conflicts propagate as SQLSTATE 23505 from the existing partial
 *      UNIQUE INDEX and surface as HTTP 409 { kind:'conflict' }.
 *
 * Response contract:
 *   - Validation  → 400 { ok:false, kind:'validation', message }
 *   - Slot clash  → 409 { ok:false, kind:'conflict', message }
 *   - DB / RLS    → 400 { ok:false, kind:'db', message } (friendlyInsertError)
 *   - Success     → 200 { ok:true, reference:'BMC-YYYYMMDD-XXXX' | null }
 *
 * The RPC uses SECURITY DEFINER; the anon publishable key is enough to call
 * it. `supabaseAdmin` is only used for the pre-flight fast-path conflict
 * hint so the user sees a friendly 409 before hitting the RPC.
 */
import { createFileRoute } from "@tanstack/react-router";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { friendlyInsertError, FRIENDLY_INSERT_MESSAGES } from "@/lib/insert-errors";
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
  branch_id: z.string().uuid("قيمة غير صالحة").optional().nullable(),
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

// Legacy tracking reference derived from a UUID. Kept for pre-BMC bookings
// looked up by /booking-confirmation. New bookings return the BMC reference
// generated inside confirm_appointment_booking.
const refFromId = (id: string) =>
  "BAA-" + String(id).replace(/-/g, "").slice(0, 8).toUpperCase();

type InsuranceInput = {
  doctor_id?: string | null;
  insurance_provider_id?: string | null;
  insurance_policy_number?: string | null;
  insurance_member_id?: string | null;
};

// Compute insurance patch (estimate cost via existing RPC). Result is merged
// into the JSONB payload passed to confirm_appointment_booking. Failure to
// estimate must not block the booking — we persist `pending` status.
// `supa` is typed loosely: some RPCs used here aren't in the generated Database
// type until types regenerate after this migration.
async function buildInsurancePatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supa: any,
  data: InsuranceInput,
): Promise<Record<string, unknown>> {
  const providerId = data.insurance_provider_id ?? null;
  const policy = (data.insurance_policy_number ?? "").trim() || null;
  const member = (data.insurance_member_id ?? "").trim() || null;

  if (!providerId) return { insurance_status: "none" };

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
        const _rl = await applyRateLimit(request, { category: "booking" });
        if (_rl) return _rl;

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

        // Idempotency-Key: same key → same booking / same reference. Accept
        // 8–128 chars, letters/digits/dash/underscore only. When the header
        // is PRESENT but malformed we reject with an explicit
        // INVALID_IDEMPOTENCY_KEY so the client can rotate the key and
        // retry, instead of silently dropping replay protection.
        const rawKey = request.headers.get("idempotency-key")?.trim() ?? "";
        if (rawKey && !/^[A-Za-z0-9_-]{8,128}$/.test(rawKey)) {
          return json(400, {
            ok: false,
            kind: "validation",
            code: "INVALID_IDEMPOTENCY_KEY",
            message:
              "مفتاح إعادة الإرسال (Idempotency-Key) غير صالح. تم توليد مفتاح جديد — أعد المحاولة.",
          });
        }
        const idempotencyKey = rawKey || null;

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

        // Structured logging helper. We log to stdout (captured by the
        // worker log tail + `stack_modern--server-function-logs`) so an
        // operator can grep by idempotency key or reference number when
        // triaging a duplicate/lost booking report.
        //
        // Idempotency keys are opaque client-generated tokens (crypto.randomUUID
        // in the browser), not PII, but we still mask everything except the
        // last 6 chars so raw keys never sit in log storage indefinitely.
        const maskKey = (k: string | null): string =>
          !k ? "none" : k.length <= 6 ? `***${k}` : `***${k.slice(-6)}`;
        const logBook = (event: string, extra: Record<string, unknown> = {}) => {
          const record = {
            scope: "book/create",
            event,
            idempotency_key: maskKey(idempotencyKey),
            doctor_id: parsed.data.doctor_id ?? null,
            appointment_date: parsed.data.appointment_date,
            appointment_time: parsed.data.appointment_time,
            ...extra,
          };
          if (event.endsWith(".error") || event.endsWith(".conflict")) {
            console.warn(JSON.stringify(record));
          } else {
            console.log(JSON.stringify(record));
          }
        };

        // Fast-path idempotency replay: fetch existing row's reference so we
        // don't even enter the RPC when the client is just retrying. The RPC
        // also handles replay internally, but doing it here saves a call and
        // lets us respond in a single query.
        if (idempotencyKey) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: existing } = await supabaseAdmin
              .from("appointments")
              .select("id, reference_number")
              .eq("idempotency_key", idempotencyKey)
              .maybeSingle();
            if (existing?.id) {
              const reference = existing.reference_number ?? refFromId(existing.id);
              logBook("rpc.replay.fastpath", {
                appointment_id: existing.id,
                reference_number: reference,
                replayed: true,
              });
              return json(200, { ok: true, reference });
            }
          } catch (e) {
            logBook("rpc.replay.fastpath.error", {
              error: (e as Error)?.message ?? String(e),
            });
            /* Fall through — the RPC will handle replay authoritatively. */
          }
        }

        // Optional fast-path conflict message: same doctor+date+time already
        // booked by an active appointment. Purely for a friendlier 409 — the
        // authoritative guard remains the partial UNIQUE INDEX inside the
        // RPC's transaction.
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
                code: "SLOT_TAKEN",
                message: FRIENDLY_INSERT_MESSAGES.duplicate,
              });
            }
          } catch {
            /* Fall through — RPC UNIQUE INDEX still guards atomically. */
          }
        }

        // Build the JSONB payload for the RPC. All non-provided fields are
        // omitted so the function's NULLIF/COALESCE branches apply.
        const cleanEmail = (parsed.data.patient_email ?? "").trim().toLowerCase() || null;
        const insurancePatch = await buildInsurancePatch(supa, parsed.data);

        const payload: Record<string, unknown> = {
          patient_name: parsed.data.patient_name,
          patient_phone: parsed.data.patient_phone,
          patient_email: cleanEmail,
          national_id: parsed.data.national_id ?? null,
          gender: parsed.data.gender ?? null,
          specialty_id: parsed.data.specialty_id ?? null,
          doctor_id: parsed.data.doctor_id ?? null,
          branch_id: parsed.data.branch_id ?? null,
          appointment_date: parsed.data.appointment_date,
          appointment_time: parsed.data.appointment_time,
          reason: parsed.data.reason ?? null,
          reminder_24h: parsed.data.reminder_24h,
          reminder_2h: parsed.data.reminder_2h,
          idempotency_key: idempotencyKey,
          ...insurancePatch,
        };

        // Atomic confirmation. Any 23505 from here means a real conflict
        // (slot uidx or idempotency uidx) — never a partial-state failure.
        // Cast: `confirm_appointment_booking` isn't in the generated Database
        // type until types regenerate after this migration.
        const rpcStart = Date.now();
        logBook("rpc.call");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rows, error } = await (supa as any).rpc("confirm_appointment_booking", {
          p_data: payload,
          p_idempotency_key: idempotencyKey,
        });
        const rpcMs = Date.now() - rpcStart;

        if (error) {
          const err = error as { message?: string; code?: string };
          const isDup =
            err.code === "23505" || (err.message ?? "").includes("duplicate key");
          const dupOnIdemKey =
            isDup && !!idempotencyKey && (err.message ?? "").includes("idempotency_key");

          logBook(isDup ? "rpc.conflict" : "rpc.error", {
            duration_ms: rpcMs,
            pg_code: err.code ?? null,
            pg_message: err.message ?? null,
            dup_on_idempotency_key: dupOnIdemKey,
          });

          // Idempotency-key race: another concurrent request with the same
          // key already inserted — replay its reference.
          if (dupOnIdemKey) {
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data: existing } = await supabaseAdmin
                .from("appointments")
                .select("id, reference_number")
                .eq("idempotency_key", idempotencyKey)
                .maybeSingle();
              if (existing?.id) {
                const reference = existing.reference_number ?? refFromId(existing.id);
                logBook("rpc.replay.race", {
                  appointment_id: existing.id,
                  reference_number: reference,
                  replayed: true,
                });
                return json(200, { ok: true, reference });
              }
            } catch (e) {
              logBook("rpc.replay.race.error", {
                error: (e as Error)?.message ?? String(e),
              });
              /* fall through */
            }
          }

          if (isDup) {
            return json(409, {
              ok: false,
              kind: "conflict",
              code: "SLOT_TAKEN",
              message: FRIENDLY_INSERT_MESSAGES.duplicate,
            });
          }
          return json(400, {
            ok: false,
            kind: "db",
            message: friendlyInsertError(err),
          });
        }

        // rows is an array of { id, reference, replayed }.
        const row = Array.isArray(rows) ? rows[0] : rows;
        const rowId = row && (row as { id?: string }).id;
        const rowRef = row && (row as { reference?: string | null }).reference;
        const rowReplayed = !!(row && (row as { replayed?: boolean }).replayed);
        const reference = rowRef ?? (rowId ? refFromId(rowId) : null);

        logBook(rowReplayed ? "rpc.replay.rpc" : "rpc.success", {
          duration_ms: rpcMs,
          appointment_id: rowId ?? null,
          reference_number: reference,
          replayed: rowReplayed,
        });

        return json(200, { ok: true, reference });
      },
    },
  },
});
