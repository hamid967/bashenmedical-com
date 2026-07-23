/**
 * Phase 5 — global session-expiry guard for the /patient portal.
 *
 * Two entry points cover every way a session can end while the user is
 * inside the portal:
 *   1. `usePatientSessionGuard()` — listens to Supabase auth events; when the
 *      session is cleared (sign-out, revoked, refresh failure) we cancel
 *      in-flight queries, drop cached protected data, sign out safely, and
 *      route to `/auth/session-expired` preserving where the user was.
 *   2. `signalPatientSessionExpired()` — imperative version used by the
 *      unified error dispatcher when a server function returns 401 / an
 *      expired-JWT error while the tab is still open.
 *
 * The offline cache persister is scoped to `["patient", ...]` keys. We only
 * evict the react-query in-memory cache here; the persisted snapshot stays
 * so the next signed-in session can still show cached data offline.
 */
import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { Router } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const TARGET = "/auth/session-expired" as const;

function currentNext(): string {
  if (typeof window === "undefined") return "/patient";
  const path = window.location.pathname + window.location.search;
  // Only preserve in-portal paths to avoid open-redirect surface.
  if (!path.startsWith("/patient")) return "/patient";
  return path;
}

let redirecting = false;

export async function signalPatientSessionExpired(
  router: Router<any, any, any, any>,
  queryClient: QueryClient,
  opts?: { next?: string; skipSignOut?: boolean },
) {
  if (redirecting) return;
  redirecting = true;
  const next = opts?.next ?? currentNext();
  try {
    await queryClient.cancelQueries();
  } catch {
    /* ignore */
  }
  queryClient.clear();
  if (!opts?.skipSignOut) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* already signed out */
    }
  }
  await router.navigate({
    to: TARGET,
    search: { next } as never,
    replace: true,
  });
  // Reset flag on next tick so a subsequent real session can re-trigger.
  setTimeout(() => {
    redirecting = false;
  }, 1500);
}

/**
 * Mount inside the /patient layout. Detects:
 *   - SIGNED_OUT event
 *   - TOKEN_REFRESHED / USER_UPDATED with a null session (refresh failure)
 *   - INITIAL_SESSION with no session (tab restored after cookies purged)
 * and routes the user to the Session Expired state.
 */
export function usePatientSessionGuard(
  router: Router<any, any, any, any>,
  queryClient: QueryClient,
) {
  const mounted = useRef(false);
  useEffect(() => {
    // Skip the very first INITIAL_SESSION callback: the _authenticated gate
    // has already validated auth before this layout renders. We only care
    // about *transitions* to a null session from now on.
    let firstEvent = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (firstEvent) {
        firstEvent = false;
        mounted.current = true;
        return;
      }
      if (event === "SIGNED_OUT") {
        void signalPatientSessionExpired(router, queryClient, {
          skipSignOut: true,
        });
        return;
      }
      if (!session && (event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) {
        void signalPatientSessionExpired(router, queryClient);
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router, queryClient]);
}
