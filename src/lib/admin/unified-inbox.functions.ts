import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = ["admin", "super_admin", "reception"] as const;

async function assertStaff(supabase: any, userId: string) {
  for (const role of STAFF_ROLES) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
    if (data) return;
  }
  throw new Error("Forbidden");
}

export type InboxSource =
  | "appointment"
  | "service_inquiry"
  | "home_care"
  | "corporate"
  | "second_opinion"
  | "complaint"
  | "medicine_order"
  | "waitlist";

export type InboxItem = {
  id: string;
  source: InboxSource;
  reference: string | null;
  patient_name: string;
  patient_phone: string | null;
  subject: string;
  status: string;
  branch_id: string | null;
  channel: "website" | "whatsapp" | "booking" | "phone" | "other";
  created_at: string;
  href: string;
};

const InputSchema = z
  .object({
    date: z.string().optional(), // YYYY-MM-DD, default today (UTC)
    sources: z.array(z.string()).optional(),
    channel: z.enum(["website", "whatsapp", "booking", "phone", "other"]).optional(),
    search: z.string().max(120).optional(),
  })
  .default({});

export const getUnifiedInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => InputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<InboxItem[]> => {
    await assertStaff(context.supabase, context.userId);
    const day = data.date ?? new Date().toISOString().slice(0, 10);
    const start = `${day}T00:00:00.000Z`;
    const end = `${day}T23:59:59.999Z`;
    const s = (data.search ?? "").trim();
    const wantSource = (k: InboxSource) => !data.sources?.length || data.sources.includes(k);

    const results: InboxItem[] = [];
    const sb = context.supabase;

    // appointments
    if (wantSource("appointment")) {
      const { data: rows } = await sb
        .from("appointments")
        .select("id, patient_name, patient_phone, appointment_date, appointment_time, status, branch_id, created_at, reason")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(300);
      (rows ?? []).forEach((r: any) =>
        results.push({
          id: r.id,
          source: "appointment",
          reference: null,
          patient_name: r.patient_name,
          patient_phone: r.patient_phone,
          subject: `موعد ${r.appointment_date} ${String(r.appointment_time).slice(0, 5)}${r.reason ? ` — ${r.reason}` : ""}`,
          status: r.status,
          branch_id: r.branch_id,
          channel: "booking",
          created_at: r.created_at,
          href: `/appointments-queue`,
        }),
      );
    }

    // service_inquiries
    if (wantSource("service_inquiry")) {
      const { data: rows } = await sb
        .from("service_inquiries")
        .select("id, request_number, full_name, mobile_e164, service_label, internal_status, branch_id, created_at, source")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(300);
      (rows ?? []).forEach((r: any) =>
        results.push({
          id: r.id,
          source: "service_inquiry",
          reference: r.request_number,
          patient_name: r.full_name,
          patient_phone: r.mobile_e164,
          subject: r.service_label,
          status: r.internal_status,
          branch_id: r.branch_id,
          channel: r.source === "whatsapp" ? "whatsapp" : "website",
          created_at: r.created_at,
          href: `/admin/service-inquiries`,
        }),
      );
    }

    // home_care
    if (wantSource("home_care")) {
      const { data: rows } = await sb
        .from("home_care_requests")
        .select("id, patient_name, patient_phone, service, status, branch_id, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(300);
      (rows ?? []).forEach((r: any) =>
        results.push({
          id: r.id,
          source: "home_care",
          reference: null,
          patient_name: r.patient_name,
          patient_phone: r.patient_phone,
          subject: `رعاية منزلية${r.service ? ` — ${r.service}` : ""}`,
          status: r.status,
          branch_id: r.branch_id,
          channel: "website",
          created_at: r.created_at,
          href: `/home-care-admin`,
        }),
      );
    }

    // corporate
    if (wantSource("corporate")) {
      const { data: rows } = await sb
        .from("corporate_requests")
        .select("id, company_name, contact_name, phone, service_type, status, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(200);
      (rows ?? []).forEach((r: any) =>
        results.push({
          id: r.id,
          source: "corporate",
          reference: null,
          patient_name: `${r.company_name} — ${r.contact_name}`,
          patient_phone: r.phone,
          subject: `طلب شركات${r.service_type ? ` — ${r.service_type}` : ""}`,
          status: r.status,
          branch_id: null,
          channel: "website",
          created_at: r.created_at,
          href: `/corporate-admin`,
        }),
      );
    }

    // second_opinion
    if (wantSource("second_opinion")) {
      const { data: rows } = await sb
        .from("second_opinion_requests")
        .select("id, patient_name, phone, specialty, status, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(200);
      (rows ?? []).forEach((r: any) =>
        results.push({
          id: r.id,
          source: "second_opinion",
          reference: null,
          patient_name: r.patient_name,
          patient_phone: r.phone,
          subject: `رأي طبي ثانٍ — ${r.specialty}`,
          status: r.status,
          branch_id: null,
          channel: "website",
          created_at: r.created_at,
          href: `/second-opinion-admin`,
        }),
      );
    }

    // complaints
    if (wantSource("complaint")) {
      const { data: rows } = await sb
        .from("complaints")
        .select("id, reference, patient_name, patient_phone, type, status, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(200);
      (rows ?? []).forEach((r: any) =>
        results.push({
          id: r.id,
          source: "complaint",
          reference: r.reference,
          patient_name: r.patient_name,
          patient_phone: r.patient_phone,
          subject: `شكوى — ${r.type}`,
          status: r.status,
          branch_id: null,
          channel: "website",
          created_at: r.created_at,
          href: `/complaints-admin`,
        }),
      );
    }

    // medicine orders
    if (wantSource("medicine_order")) {
      const { data: rows } = await sb
        .from("medicine_orders")
        .select("id, patient_name, patient_phone, delivery_type, status, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(200);
      (rows ?? []).forEach((r: any) =>
        results.push({
          id: r.id,
          source: "medicine_order",
          reference: null,
          patient_name: r.patient_name,
          patient_phone: r.patient_phone,
          subject: `طلب دواء (${r.delivery_type})`,
          status: r.status,
          branch_id: null,
          channel: "website",
          created_at: r.created_at,
          href: `/orders-unified`,
        }),
      );
    }

    // waitlist
    if (wantSource("waitlist")) {
      const { data: rows } = await sb
        .from("appointment_waitlist")
        .select("id, patient_name, patient_phone, status, branch_id, created_at")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(200);
      (rows ?? []).forEach((r: any) =>
        results.push({
          id: r.id,
          source: "waitlist",
          reference: null,
          patient_name: r.patient_name,
          patient_phone: r.patient_phone,
          subject: `قائمة انتظار`,
          status: r.status,
          branch_id: r.branch_id,
          channel: "booking",
          created_at: r.created_at,
          href: `/waitlist`,
        }),
      );
    }

    let out = results;
    if (data.channel) out = out.filter((x) => x.channel === data.channel);
    if (s) {
      const q = s.toLowerCase();
      out = out.filter(
        (x) =>
          x.patient_name?.toLowerCase().includes(q) ||
          x.patient_phone?.toLowerCase().includes(q) ||
          x.subject?.toLowerCase().includes(q) ||
          (x.reference ?? "").toLowerCase().includes(q),
      );
    }
    out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return out;
  });
