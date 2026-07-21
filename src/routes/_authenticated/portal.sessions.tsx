/**
 * /portal/sessions — Active sessions management.
 * List all sessions/devices signed into the account, mark the current one,
 * revoke a specific session, sign out from all other devices, or sign out
 * everywhere (current session included).
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Chrome,
  Globe,
  Laptop,
  Loader2,
  LogOut,
  RefreshCw,
  Shield,
  ShieldOff,
  Smartphone,
  Tablet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listMySessions,
  revokeMySession,
  type ActiveSession,
} from "@/lib/portal/sessions.functions";

const sessionsQuery = queryOptions({
  queryKey: ["portal", "sessions"],
  queryFn: () => listMySessions(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_authenticated/portal/sessions")({
  loader: ({ context }) => context.queryClient.ensureQueryData(sessionsQuery),
  head: () => ({
    meta: [
      { title: "الجلسات النشطة | بوابة المريض" },
      {
        name: "description",
        content: "إدارة الأجهزة والجلسات المسجّلة في حسابك وتسجيل الخروج منها.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionsPage,
  errorComponent: ErrorState,
  pendingComponent: Skeleton,
});

/* --------------------------------- Utils --------------------------------- */

function parseUserAgent(ua: string | null): {
  device: "mobile" | "tablet" | "desktop" | "unknown";
  browser: string;
  os: string;
} {
  if (!ua) return { device: "unknown", browser: "غير معروف", os: "غير معروف" };
  const s = ua.toLowerCase();

  let device: "mobile" | "tablet" | "desktop" = "desktop";
  if (/ipad|tablet/.test(s)) device = "tablet";
  else if (/mobi|iphone|android(?!.*tablet)/.test(s)) device = "mobile";

  let os = "غير معروف";
  if (/windows nt/.test(s)) os = "Windows";
  else if (/mac os x|macintosh/.test(s)) os = /iphone|ipad/.test(s) ? "iOS" : "macOS";
  else if (/android/.test(s)) os = "Android";
  else if (/iphone|ipad|ipod/.test(s)) os = "iOS";
  else if (/linux/.test(s)) os = "Linux";

  let browser = "متصفح";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/chrome\//.test(s) && !/edg\/|opr\//.test(s)) browser = "Chrome";
  else if (/safari\//.test(s) && !/chrome\//.test(s)) browser = "Safari";
  else if (/firefox\//.test(s)) browser = "Firefox";

  return { device, browser, os };
}

function DeviceIcon({ kind, className }: { kind: string; className?: string }) {
  const cls = className ?? "h-5 w-5";
  if (kind === "mobile") return <Smartphone className={cls} />;
  if (kind === "tablet") return <Tablet className={cls} />;
  if (kind === "desktop") return <Laptop className={cls} />;
  return <Chrome className={cls} />;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return "قبل لحظات";
  const m = Math.floor(s / 60);
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const days = Math.floor(h / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return d.toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric" });
}

/* -------------------------------- Component ------------------------------ */

function SessionsPage() {
  const q = useSuspenseQuery(sessionsQuery);
  const qc = useQueryClient();
  const router = useRouter();
  const sessions = q.data;

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [signingOutScope, setSigningOutScope] = useState<"others" | "global" | null>(null);
  const [confirm, setConfirm] = useState<null | {
    kind: "revoke" | "others" | "global";
    sessionId?: string;
  }>(null);

  const revokeMut = useMutation({
    mutationFn: (sessionId: string) => revokeMySession({ data: { sessionId } }),
    onMutate: (sessionId) => setRevokingId(sessionId),
    onSuccess: () => {
      toast.success("تم تسجيل الخروج من الجلسة");
      qc.invalidateQueries({ queryKey: ["portal", "sessions"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "تعذّر إلغاء الجلسة"),
    onSettled: () => setRevokingId(null),
  });

  const handleScopedSignOut = async (scope: "others" | "global") => {
    setSigningOutScope(scope);
    try {
      const { error } = await supabase.auth.signOut({ scope });
      if (error) throw error;
      if (scope === "global") {
        toast.success("تم تسجيل الخروج من جميع الأجهزة");
        await qc.cancelQueries();
        qc.clear();
        router.navigate({ to: "/auth", replace: true });
      } else {
        toast.success("تم تسجيل الخروج من الأجهزة الأخرى");
        qc.invalidateQueries({ queryKey: ["portal", "sessions"] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تسجيل الخروج");
    } finally {
      setSigningOutScope(null);
      setConfirm(null);
    }
  };

  // Current session first, then most recently active.
  const sorted = [...sessions].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return tb - ta;
  });

  const otherCount = sessions.filter((s) => !s.is_current).length;

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-[color:var(--portal-ink-2)]">
            <Link
              to="/portal/settings"
              className="inline-flex items-center gap-1 hover:text-[color:var(--portal-ink)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              الإعدادات
            </Link>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-600" />
            الجلسات النشطة
          </h1>
          <p className="mt-1 text-sm text-[color:var(--portal-ink-2)]">
            الأجهزة والمتصفحات المسجّلة الدخول حاليًا إلى حسابك.
          </p>
        </div>
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ["portal", "sessions"] })}
          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)] px-3 h-9 text-xs font-medium hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          تحديث
        </button>
      </header>

      {/* Bulk actions */}
      <div className="glass-card p-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={otherCount === 0 || signingOutScope !== null}
          onClick={() => setConfirm({ kind: "others" })}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 text-[color:var(--portal-on-primary)] px-4 h-10 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingOutScope === "others" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldOff className="h-4 w-4" />
          )}
          تسجيل الخروج من الأجهزة الأخرى ({otherCount})
        </button>
        <button
          type="button"
          disabled={signingOutScope !== null}
          onClick={() => setConfirm({ kind: "global" })}
          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-[color:var(--portal-surface)] text-red-600 px-4 h-10 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
        >
          {signingOutScope === "global" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          تسجيل الخروج من كل الأجهزة
        </button>
      </div>

      {/* Sessions list */}
      {sorted.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-[color:var(--portal-ink-2)]">
          لا توجد جلسات نشطة.
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              busy={revokingId === s.id}
              onRevoke={() => setConfirm({ kind: "revoke", sessionId: s.id })}
            />
          ))}
        </ul>
      )}

      {/* Confirmation dialog */}
      {confirm && (
        <ConfirmDialog
          kind={confirm.kind}
          busy={
            (confirm.kind === "revoke" && revokingId !== null) || signingOutScope !== null
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === "revoke" && confirm.sessionId) {
              revokeMut.mutate(confirm.sessionId);
              setConfirm(null);
            } else if (confirm.kind === "others") {
              void handleScopedSignOut("others");
            } else if (confirm.kind === "global") {
              void handleScopedSignOut("global");
            }
          }}
        />
      )}
    </div>
  );
}

function SessionCard({
  session,
  busy,
  onRevoke,
}: {
  session: ActiveSession;
  busy: boolean;
  onRevoke: () => void;
}) {
  const { device, browser, os } = parseUserAgent(session.user_agent);
  const title = `${browser} على ${os}`;
  return (
    <li className="glass-card p-4 flex flex-wrap items-start gap-4">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
        <DeviceIcon kind={device} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold truncate">{title}</h3>
          {session.is_current && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              الجلسة الحالية
            </span>
          )}
        </div>
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-[color:var(--portal-ink-2)]">
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            <span>عنوان IP:</span>
            <span className="text-[color:var(--portal-ink)] font-mono">
              {session.ip ?? "—"}
            </span>
          </div>
          <div>
            <span>آخر نشاط: </span>
            <span className="text-[color:var(--portal-ink)]">
              {formatRelative(session.updated_at)}
            </span>
          </div>
          <div>
            <span>تسجيل الدخول: </span>
            <span className="text-[color:var(--portal-ink)]">
              {formatRelative(session.created_at)}
            </span>
          </div>
        </dl>
        {session.user_agent && (
          <details className="mt-2">
            <summary className="text-[11px] text-[color:var(--portal-ink-2)] cursor-pointer hover:text-[color:var(--portal-ink)]">
              تفاصيل تقنية
            </summary>
            <p className="mt-1 text-[11px] text-[color:var(--portal-ink-2)] break-all font-mono">
              {session.user_agent}
            </p>
          </details>
        )}
      </div>
      <div className="shrink-0">
        {session.is_current ? (
          <span className="text-xs text-[color:var(--portal-ink-2)]">
            استخدم زر «تسجيل الخروج» في الأعلى
          </span>
        ) : (
          <button
            type="button"
            onClick={onRevoke}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-[color:var(--portal-surface)] text-red-600 px-3 h-9 text-xs font-semibold hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            إنهاء الجلسة
          </button>
        )}
      </div>
    </li>
  );
}

function ConfirmDialog({
  kind,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: "revoke" | "others" | "global";
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy =
    kind === "revoke"
      ? {
          title: "إنهاء هذه الجلسة؟",
          body: "سيتم تسجيل خروج هذا الجهاز فورًا وسيحتاج لإعادة الدخول.",
          confirm: "إنهاء الجلسة",
        }
      : kind === "others"
        ? {
            title: "تسجيل الخروج من الأجهزة الأخرى؟",
            body: "ستبقى هذه الجلسة نشطة، وسيتم تسجيل خروج جميع الأجهزة الأخرى.",
            confirm: "متابعة",
          }
        : {
            title: "تسجيل الخروج من كل الأجهزة؟",
            body: "سيتم إنهاء جميع الجلسات — بما فيها هذه الجلسة — وسيُطلب منك تسجيل الدخول من جديد.",
            confirm: "تسجيل الخروج نهائيًا",
          };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl bg-[color:var(--portal-surface)] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-600 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">{copy.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center rounded-full border border-input bg-[color:var(--portal-surface)] px-4 h-10 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-600 text-[color:var(--portal-on-primary)] px-4 h-10 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- States --------------------------------- */

function Skeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      <div className="h-8 w-56 rounded-md bg-muted animate-pulse" />
      <div className="glass-card p-4 h-16 animate-pulse" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-card p-4 h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="glass-card p-8 text-center" dir="rtl">
      <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-3">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-bold">تعذّر تحميل الجلسات</h2>
      <p className="mt-1 text-sm text-muted-foreground break-words">
        {error.message || "حدث خطأ غير متوقع."}
      </p>
      <button
        type="button"
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 h-10 text-sm font-semibold"
      >
        <RefreshCw className="h-4 w-4" />
        حاول مجددًا
      </button>
    </div>
  );
}
