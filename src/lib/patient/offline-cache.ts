/**
 * Patient Portal — offline cache.
 * Persists TanStack Query cache entries whose queryKey starts with
 * ["patient", ...] to localStorage so appointments, reports, prescriptions,
 * notifications, and the dashboard snapshot remain visible when the network
 * drops. Client-only; safe no-op during SSR.
 */
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const CACHE_KEY = "bmc.patient.offline.v1";
const MAX_AGE = 1000 * 60 * 60 * 24; // 24h
const PATIENT_CACHE_KEYS = new Set([
  "dashboard-snapshot",
  "appointments",
  "reports",
  "prescriptions",
  "notifications",
  "my-profile",
]);

export function usePatientOfflineCache(queryClient: QueryClient) {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let storage: Storage;
    try {
      storage = window.localStorage;
      // probe (private mode / disabled)
      storage.setItem("__probe__", "1");
      storage.removeItem("__probe__");
    } catch {
      return;
    }
    const persister = createSyncStoragePersister({
      storage,
      key: CACHE_KEY,
      throttleTime: 1000,
    });
    const [unsubscribe] = persistQueryClient({
      queryClient,
      persister,
      maxAge: MAX_AGE,
      buster: "v1",
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key[0] !== "patient") return false;
          if (typeof key[1] !== "string") return false;
          if (!PATIENT_CACHE_KEYS.has(key[1])) return false;
          return query.state.status === "success";
        },
      },
    });
    return () => {
      unsubscribe();
    };
  }, [queryClient]);
}

export function clearPatientOfflineCache() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
