/**
 * Compact inline banner used inside dialogs and screens where the full
 * StateShell would be too large. Classifies the error via the same rules
 * as PatientRouteError so the six states stay consistent.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock,
  Lock,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { classifyPatientError } from "@/components/states/patient-route-states";
import { signalPatientSessionExpired } from "@/lib/patient/session-guard";

type Kind = "offline" | "session" | "forbidden" | "error";

const AR: Record<Kind, { title: string; desc: string }> = {
  offline: {
    title: "لا يوجد اتصال بالإنترنت",
    desc: "تحقّق من اتصالك ثم أعِد المحاولة.",
  },
  session: {
    title: "انتهت جلستك",
    desc: "سجّل الدخول مجددًا لمتابعة العملية.",
  },
  forbidden: {
    title: "لا تملك صلاحية إتمام هذه العملية",
    desc: "قد يتطلب الأمر توثيق العلاقة أو تفعيل صلاحية الحجز أولًا.",
  },
  error: {
    title: "تعذّر إتمام العملية",
    desc: "حدث خطأ غير متوقع. حاول مجددًا بعد قليل.",
  },
};

export function InlineStateBanner({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const kind: Kind = classifyPatientError(error);
  const copy = AR[kind];
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  React.useEffect(() => {
    if (kind !== "session") return;
    void signalPatientSessionExpired(router, qc);
  }, [kind, router, qc]);

  const tone =
    kind === "error"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : kind === "forbidden"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-border bg-muted/50 text-foreground";

  const Icon =
    kind === "offline"
      ? WifiOff
      : kind === "session"
        ? Clock
        : kind === "forbidden"
          ? Lock
          : AlertTriangle;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-xs",
        tone,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1">
        <div className="font-semibold">{copy.title}</div>
        <p className="opacity-90">
          {copy.desc}
          {kind === "error" && message && message !== copy.title ? (
            <span className="ms-1 opacity-70">— {message}</span>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {kind === "session" ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/auth/login">إعادة الدخول</Link>
          </Button>
        ) : onRetry && (kind === "offline" || kind === "error") ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="me-1 h-3 w-3" aria-hidden />
            إعادة المحاولة
          </Button>
        ) : null}
      </div>
    </div>
  );
}
