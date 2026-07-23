/**
 * Shared state dispatcher for /patient routes.
 * Maps thrown errors to the correct unified state (Offline / SessionExpired /
 * Forbidden / Error) so every module and the dashboard render consistently.
 */
import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ErrorState,
  EmptyState,
  OfflineState,
  ForbiddenState,
  SessionExpiredState,
  SkeletonList,
  SkeletonCards,
} from "@/components/states";
import { signalPatientSessionExpired } from "@/lib/patient/session-guard";

export function classifyPatientError(
  error: unknown,
): "offline" | "session" | "forbidden" | "error" {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const rawMsg =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const m = rawMsg.toLowerCase();
  if (
    status === 401 ||
    m.includes("unauthorized") ||
    (m.includes("session") && (m.includes("expired") || m.includes("invalid"))) ||
    m.includes("jwt") ||
    m.includes("no authorization header")
  ) {
    return "session";
  }
  if (
    status === 403 ||
    m.includes("forbidden") ||
    m.includes("permission") ||
    m.includes("not allowed") ||
    m.includes("لا تملك") ||
    m.includes("لا يمكن الحجز")
  ) {
    return "forbidden";
  }
  if (m.includes("networkerror") || m.includes("failed to fetch") || m.includes("offline")) {
    return "offline";
  }
  return "error";
}

const classify = classifyPatientError;


export function PatientRouteError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const kind = classify(error);
  const retry = () => {
    router.invalidate();
    reset();
  };
  // Auto-redirect on session expiry: show the state briefly, then route
  // the user to /auth/session-expired preserving `next` so they can return
  // after re-authentication.
  React.useEffect(() => {
    if (kind !== "session") return;
    void signalPatientSessionExpired(router, queryClient);
  }, [kind, router, queryClient]);
  if (kind === "session") return <SessionExpiredState className="m-4" />;
  if (kind === "forbidden") return <ForbiddenState className="m-4" />;
  if (kind === "offline") return <OfflineState className="m-4" onRetry={retry} />;
  return <ErrorState className="m-4" description={error.message} onRetry={retry} />;
}

export function PatientRouteNotFound({
  title = "لا يوجد محتوى",
  description = "لم نعثر على ما تبحث عنه في هذا القسم.",
}: {
  title?: string;
  description?: string;
}) {
  return <EmptyState className="m-4" title={title} description={description} />;
}

/** Preset state trio for a route. Spread into createFileRoute options. */
export function patientRouteStates(opts?: {
  skeleton?: "list" | "cards";
  rows?: number;
  count?: number;
}) {
  const skeleton = opts?.skeleton ?? "list";
  return {
    pendingComponent: () =>
      skeleton === "cards" ? (
        <SkeletonCards count={opts?.count ?? 3} />
      ) : (
        <SkeletonList rows={opts?.rows ?? 5} />
      ),
    errorComponent: PatientRouteError,
    notFoundComponent: () => <PatientRouteNotFound />,
  } as const;
}
