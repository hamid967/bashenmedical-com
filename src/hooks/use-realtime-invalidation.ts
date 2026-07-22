import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global Realtime subscription for availability_slots + appointments.
 * Invalidates related query caches so every open surface refreshes
 * immediately when a slot is booked, released, or an appointment changes.
 *
 * Mounted once inside the client-only _authenticated layout.
 */
export function useRealtimeInvalidation() {
  const qc = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      // Booking surfaces (availability grid, my-appointments, dashboards)
      qc.invalidateQueries({ queryKey: ["portal", "booking", "avail-slots"] });
      qc.invalidateQueries({ queryKey: ["portal", "dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["portal", "my-appointments"] });
      // Admin/reception surfaces
      qc.invalidateQueries({ queryKey: ["admin", "appointments-queue"] });
      qc.invalidateQueries({ queryKey: ["admin", "availability"] });
    };

    const channel = supabase
      .channel("global-availability-appointments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability_slots" },
        invalidate,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "slot_holds" }, invalidate)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
