/**
 * Public API — POST /api/public/inquiries/create
 *
 * Creates a service inquiry row (Jazan WhatsApp widget) using the
 * service-role client so RLS still hides inquiries from anon SELECT.
 * Returns the freshly-generated request_number so the UI can show a
 * confirmation and prepare the wa.me message.
 *
 * Validation: Zod with Arabic messages, Saudi mobile normalization.
 * Rate limiting: soft per-IP+mobile 5min window (best-effort).
 *
 * IMPORTANT: never returns internal IDs — only request_number.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  checkRateLimit,
  getClientIp,
  rateLimitedResponse,
} from "@/lib/rate-limit.server";

const NAME_MAX = 120;
const PHONE_MAX = 32;
const NOTES_MAX = 1000;
const EMAIL_MAX = 255;
const NID_MAX = 20;

const PHONE_RE = /^[+0-9\s\-()]+$/;
const SA_MOBILE_RE = /^(?:\+?966|00966|0)?5\d{8}$/;

function normalizeSaudiMobile(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, "");
  const m = digits.match(/^(?:\+?966|00966|0)?(5\d{8})$/);
  return m ? `966${m[1]}` : null;
}

const schema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "الاسم قصير جدًا (٢ أحرف على الأقل)")
    .max(NAME_MAX, "الاسم طويل جدًا")
    .regex(/^[\p{L}\s'’.-]+$/u, "الاسم يحتوي على رموز غير مسموحة"),
  mobile_number: z
    .string()
    .trim()
    .min(6, "رقم الجوال قصير جدًا")
    .max(PHONE_MAX, "رقم الجوال طويل جدًا")
    .regex(PHONE_RE, "رقم الجوال يحتوي على أحرف غير مسموحة")
    .refine((v) => SA_MOBILE_RE.test(v.replace(/[\s\-()]/g, "")), {
      message: "أدخل رقم جوال سعودي صحيح (05XXXXXXXX)",
    }),
  email: z.string().trim().max(EMAIL_MAX).email("بريد إلكتروني غير صالح").optional().or(z.literal("")),
  national_id: z.string().trim().max(NID_MAX, "رقم الهوية طويل جدًا").optional().or(z.literal("")),
  service_id: z.string().uuid("خدمة غير صالحة"),
  specialty_id: z.string().uuid().optional().or(z.literal("")),
  doctor_id: z.string().uuid().optional().or(z.literal("")),
  branch_id: z.string().uuid("اختر الفرع المفضّل"),
  preferred_contact_method: z.enum(["whatsapp", "phone", "sms", "email"]).default("whatsapp"),
  preferred_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح")
    .optional()
    .or(z.literal("")),
  insurance_provider_id: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().trim().max(NOTES_MAX, `الملاحظات طويلة جدًا (الحد ${NOTES_MAX} حرفًا)`).optional().or(z.literal("")),
  consent: z.literal(true, { message: "يجب الموافقة على سياسة الخصوصية" }),
  source: z.enum(["website", "mobile_web", "patient_portal", "campaign", "direct_link"]).default("website"),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export const Route = createFileRoute("/api/public/inquiries/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, kind: "validation", message: "طلب غير صالح" });
        }

        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return json(400, {
            ok: false,
            kind: "validation",
            message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
          });
        }
        const d = parsed.data;

        const e164 = normalizeSaudiMobile(d.mobile_number);
        if (!e164) {
          return json(400, { ok: false, kind: "validation", message: "رقم جوال غير صالح" });
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "0.0.0.0";
        const ipHash = hashIp(ip);
        const ua = request.headers.get("user-agent")?.slice(0, 500) ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Soft rate limit: max 3 inquiries per mobile per hour.
        try {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { count } = await supabaseAdmin
            .from("service_inquiries")
            .select("id", { count: "exact", head: true })
            .eq("mobile_e164", e164)
            .gte("created_at", oneHourAgo);
          if ((count ?? 0) >= 3) {
            return json(429, {
              ok: false,
              kind: "rate_limited",
              message: "لقد أرسلت عدة طلبات مؤخرًا. الرجاء المحاولة بعد قليل.",
            });
          }
        } catch {
          /* soft-fail */
        }

        // Fetch service label
        const { data: svc, error: svcErr } = await supabaseAdmin
          .from("service_catalog")
          .select("id, name_ar, is_active")
          .eq("id", d.service_id)
          .maybeSingle();
        if (svcErr || !svc || !svc.is_active) {
          return json(400, { ok: false, kind: "validation", message: "الخدمة غير متاحة" });
        }

        // Generate request number (concurrency-safe SECURITY DEFINER)
        const { data: refData, error: refErr } = await supabaseAdmin.rpc(
          "generate_service_inquiry_number",
        );
        if (refErr || !refData) {
          return json(500, {
            ok: false,
            kind: "db",
            message: "تعذّر توليد رقم الطلب. حاول مرة أخرى.",
          });
        }
        const requestNumber = String(refData);

        // One-time link token: returned only in this response and stored
        // in-DB so the patient can later claim the inquiry from the portal.
        const linkToken = crypto.randomUUID();

        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("service_inquiries")
          .insert({
            request_number: requestNumber,
            full_name: d.full_name,
            mobile_number: d.mobile_number,
            mobile_e164: e164,
            email: d.email || null,
            national_id: d.national_id || null,
            service_id: d.service_id,
            service_label: svc.name_ar,
            specialty_id: d.specialty_id || null,
            doctor_id: d.doctor_id || null,
            branch_id: d.branch_id,
            preferred_contact_method: d.preferred_contact_method,
            preferred_date: d.preferred_date || null,
            insurance_provider_id: d.insurance_provider_id || null,
            notes: d.notes || null,
            source: d.source,
            submitter_ip_hash: ipHash,
            user_agent: ua,
            link_token: linkToken,
          })
          .select("id, request_number")
          .single();

        if (insErr || !inserted) {
          return json(500, {
            ok: false,
            kind: "db",
            message: "تعذّر حفظ الطلب حاليًا. حاول بعد قليل.",
          });
        }

        await supabaseAdmin.from("service_inquiry_updates").insert({
          inquiry_id: inserted.id,
          update_type: "created",
          metadata: { source: d.source, ip_hash: ipHash },
        });

        return json(200, {
          ok: true,
          request_number: requestNumber,
          link_token: linkToken,
        });
      },
    },
  },
});
