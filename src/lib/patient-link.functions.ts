/**
 * Link guest bookings to the currently authenticated patient account.
 *
 * Wraps the SECURITY DEFINER RPC `public.link_guest_appointments()` which:
 *  - Finds or creates a `patients` row tied to the caller's profile.
 *  - Attaches all appointments where `patient_id IS NULL` and either
 *    `patient_email` matches the auth email or `patient_phone` matches the
 *    profile phone.
 *
 * Only reachable via `requireSupabaseAuth`, so unauthenticated callers can
 * never invoke it — the RPC also raises `not_authenticated` as a safety net.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LinkGuestResult = {
  ok: boolean;
  patientId: string | null;
  linkedCount: number;
  message?: string;
};

export const linkGuestAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LinkGuestResult> => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("link_guest_appointments" as never);
    if (error) {
      return {
        ok: false,
        patientId: null,
        linkedCount: 0,
        message: error.message,
      };
    }
    const row = Array.isArray(data) ? (data[0] as { patient_id?: string; linked_count?: number } | undefined) : null;
    return {
      ok: true,
      patientId: row?.patient_id ?? null,
      linkedCount: Number(row?.linked_count ?? 0),
    };
  });
