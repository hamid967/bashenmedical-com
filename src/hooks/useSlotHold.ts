/**
 * useSlotHold — creates a short-lived reservation for the doctor/date/time
 * currently selected in the booking wizard and keeps a visible countdown.
 *
 * Contract:
 *   - When (doctor_id, appointment_date, appointment_time) are all set AND
 *     `enabled` is true, POST /api/public/book/hold once. Refresh ~30 s
 *     before expiry as long as the same tuple is still selected.
 *   - When any of those values changes or the hook unmounts, DELETE the
 *     previous hold (best-effort, keepalive).
 *   - Exposes { holdId, expiresAt, secondsLeft, expired, conflict, error }.
 */
import { useEffect, useRef, useState } from "react";
import { holdSlot, releaseHold, type HoldResult } from "@/lib/booking-hold";
import { supabase } from "@/integrations/supabase/client";

type Args = {
  enabled: boolean;
  doctorId: string | null;
  branchId?: string | null;
  date: string | null;
  time: string | null;
};

type State = {
  holdId: string | null;
  expiresAt: number | null; // ms epoch
  createdAt: number | null; // ms epoch — anchor for the visual progress ring
  durationMs: number;       // total hold window at issue time, for the ring denominator
  secondsLeft: number;
  expired: boolean;
  conflict: boolean;
  error: string | null;
};

const REFRESH_LEAD_MS = 45_000;

export function useSlotHold({ enabled, doctorId, branchId, date, time }: Args): State & { refresh: () => void } {
  const [state, setState] = useState<State>({
    holdId: null,
    expiresAt: null,
    secondsLeft: 0,
    expired: false,
    conflict: false,
    error: null,
  });
  const activeIdRef = useRef<string | null>(null);
  const keyRef = useRef<string>("");
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const key = `${doctorId ?? ""}|${date ?? ""}|${time ?? ""}`;
    // If tuple changed, release the previous hold before starting a new one.
    if (keyRef.current && keyRef.current !== key && activeIdRef.current) {
      const stale = activeIdRef.current;
      activeIdRef.current = null;
      void releaseHold(stale);
    }
    keyRef.current = key;

    if (!enabled || !doctorId || !date || !time) {
      setState({ holdId: null, expiresAt: null, secondsLeft: 0, expired: false, conflict: false, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, expired: false, conflict: false, error: null }));

    holdSlot({ doctor_id: doctorId, branch_id: branchId ?? null, appointment_date: date, appointment_time: time })
      .then((res: HoldResult) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({
            holdId: null,
            expiresAt: null,
            secondsLeft: 0,
            expired: false,
            conflict: res.kind === "conflict",
            error: res.message,
          });
          activeIdRef.current = null;
          return;
        }
        activeIdRef.current = res.id;
        const expMs = new Date(res.expires_at).getTime();
        setState({
          holdId: res.id,
          expiresAt: expMs,
          secondsLeft: Math.max(0, Math.floor((expMs - Date.now()) / 1000)),
          expired: false,
          conflict: false,
          error: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, doctorId, branchId, date, time, refreshTick]);

  // Ticker + auto-refresh
  useEffect(() => {
    if (!state.expiresAt) return;
    const exp = state.expiresAt;
    const tick = () => {
      const left = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setState((s) => (s.expiresAt === exp ? { ...s, secondsLeft: left, expired: left === 0 } : s));
    };
    tick();
    tickTimerRef.current = setInterval(tick, 1000);

    const leadMs = Math.max(5_000, exp - Date.now() - REFRESH_LEAD_MS);
    refreshTimerRef.current = setTimeout(() => {
      // Trigger the hold effect to run again for the same tuple.
      setRefreshTick((n) => n + 1);
    }, leadMs);

    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [state.expiresAt]);

  // Release on unmount.
  useEffect(() => {
    return () => {
      const id = activeIdRef.current;
      if (id) {
        activeIdRef.current = null;
        void releaseHold(id);
      }
    };
  }, []);

  return {
    ...state,
    refresh: () => setRefreshTick((n) => n + 1),
  };
}
