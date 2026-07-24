/**
 * Global search across routes + patients + doctors + appointments.
 * Staff-only (admin/super_admin). Used by the Command Palette.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertConsoleAccess } from "@/lib/admin/_guard";
import { z } from "zod";

const Input = z.object({ q: z.string().min(1).max(80) });

export type GlobalSearchResult = {
  patients: { id: string; name: string; mrn: string | null; phone: string | null }[];
  doctors: { id: string; name_ar: string; name_en: string | null; specialty: string | null }[];
  appointments: {
    id: string;
    reference_number: string | null;
    patient_name: string;
    date: string;
    status: string;
  }[];
  requests: {
    id: string;
    request_number: string | null;
    full_name: string;
    phone: string | null;
    status: string | null;
  }[];
};

function maskPhone(p: string | null): string | null {
  if (!p) return null;
  const s = p.replace(/\D/g, "");
  if (s.length < 4) return "***";
  return `${s.slice(0, 3)}****${s.slice(-2)}`;
}

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<GlobalSearchResult> => {
    await assertConsoleAccess(context);
    const q = data.q.trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;

    const [pRes, dRes, aRes, rRes] = await Promise.all([
      sb
        .from("patients")
        .select("id, full_name, mrn, phone")
        .or(`full_name.ilike.%${q}%,mrn.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(8),
      sb
        .from("doctors")
        .select("id, name_ar, name_en, specialties(name_ar)")
        .or(`name_ar.ilike.%${q}%,name_en.ilike.%${q}%`)
        .limit(8),
      sb
        .from("appointments")
        .select("id, reference_number, appointment_date, status, patients!inner(full_name)")
        .or(
          `reference_number.ilike.%${q}%,patients.full_name.ilike.%${q}%`,
        )
        .order("appointment_date", { ascending: false })
        .limit(6),
      sb
        .from("service_inquiries")
        .select("id, request_number, full_name, mobile_e164, mobile_number, internal_status")
        .or(
          `request_number.ilike.%${q}%,full_name.ilike.%${q}%,mobile_e164.ilike.%${q}%,mobile_number.ilike.%${q}%`,
        )
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patients: (pRes.data ?? []).map((r: any) => ({
        id: r.id,
        name: r.full_name ?? "—",
        mrn: r.mrn ?? null,
        phone: maskPhone(r.phone),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doctors: (dRes.data ?? []).map((r: any) => ({
        id: r.id,
        name_ar: r.name_ar ?? "—",
        name_en: r.name_en ?? null,
        specialty: r.specialties?.name_ar ?? null,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appointments: (aRes.data ?? []).map((r: any) => ({
        id: r.id,
        reference_number: r.reference_number ?? null,
        patient_name: r.patients?.full_name ?? "—",
        date: r.appointment_date,
        status: r.status,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      requests: (rRes.data ?? []).map((r: any) => ({
        id: r.id,
        request_number: r.request_number ?? null,
        full_name: r.full_name ?? "—",
        phone: maskPhone(r.mobile_e164 ?? r.mobile_number ?? null),
        status: r.internal_status ?? null,
      })),
    };
  });
