import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Public-facing Realtime subscription for anonymous booking flow.
 * Listens to availability_slots changes (allowed for anon by RLS) and
 * invalidates all guest booking queries so the /book page reflects
 * open/close state immediately when other users book or cancel.
 *
 * Mounted in the public /book route.
 */
export function useRealtimePublicSlots(opts?: { doctorId?: string; branchId?: string }) {
  const qc = useQueryClient();
  const doctorId = opts?.doctorId ?? null;
  const branchId = opts?.branchId ?? null;

  useEffect(() => {
    let scheduled = false;
    const invalidate = () => {
      // Coalesce bursts (e.g. bulk INSERT/UPDATE from a booking) into a single refetch
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        qc.invalidateQueries({ queryKey: ["avail"] });
        qc.invalidateQueries({ queryKey: ["week-avail"] });
        qc.invalidateQueries({ queryKey: ["month-avail"] });
      });
    };

    const channelName = doctorId
      ? `public-slots:doctor:${doctorId}`
      : "public-slots:global";

    // Server-side filter when we know the doctor to reduce noise.
    const doctorFilter = doctorId ? { filter: `doctor_id=eq.${doctorId}` } : {};

    const channel = supabase
      .channel(channelName)
      // Availability windows (open/close, capacity changes).
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_slots", ...doctorFilter },
        invalidate,
      )
      // Live holds by other sessions — the viewer must see a slot become
      // busy the moment someone else grabs it, and free again on release/expiry.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "slot_holds", ...doctorFilter },
        invalidate,
      )
      // Confirmed / cancelled appointments — flip slot to booked or reopen it.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", ...doctorFilter },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, doctorId, branchId]);
}
