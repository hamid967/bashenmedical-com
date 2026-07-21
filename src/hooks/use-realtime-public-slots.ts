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

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "availability_slots",
          // Server-side filter when we know the doctor to reduce noise
          ...(doctorId ? { filter: `doctor_id=eq.${doctorId}` } : {}),
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, doctorId, branchId]);
}
