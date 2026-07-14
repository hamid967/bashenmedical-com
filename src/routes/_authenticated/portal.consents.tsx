/**
 * /portal/consents — Patient consent management.
 *
 * Shows every consent type in the catalog with its status (granted /
 * withdrawn / not granted), the exact timestamp of grant/withdrawal, and
 * lets the patient grant or withdraw with a written reason.
 *
 * Data comes from src/lib/portal/consents.functions.ts (RLS-scoped to the
 * signed-in patient via requireSupabaseAuth).
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileCheck2,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  X,
} from "lucide-react";
import {
  CONSENT_CATALOG,
  grantConsent,
  listMyConsents,
  withdrawConsent,
  type ConsentCatalogItem,
  type ConsentRecord,
  type ConsentType,
  type ConsentView,
} from "@/lib/portal/consents.functions";

/* ----------------------------- query --------------------------------- */

const consentsQuery = queryOptions({
  queryKey: ["portal", "my-consents"],
  queryFn: () => listMyConsents(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/consents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(consentsQuery),
  head: () => ({
    meta: [
      { title: "الموافقات والخصوصية | بوابة المريض" },
      {
        name: "description",
        content:
          "استعرض شروط الموافقة الصحية والخصوصية، وسجّل موافقتك أو اسحبها في أي وقت مع توثيق زمني كامل.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsentsPage,
  errorComponent: ErrorState,
  notFoundComponent: () => null,
  pendingComponent: SkeletonState,
});

/* ----------------------------- helpers ------------------------------- */

const CATEGORY_LABEL: Record<ConsentCatalogItem["category"], string> = {
  essential: "أساسية",
  clinical: "سريرية",
  optional: "اختيارية",
};

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("ar-SA-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ----------------------------- page ---------------------------------- */

function ConsentsPage() {
  const q = useSuspenseQuery(consentsQuery);
  const qc = useQueryClient();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["portal", "my-consents"] });

  const grantMut = useMutation({
    mutationFn: (type: ConsentType) =>
      grantConsent({ data: { consent_type: type, language: "ar" } }),
    onSuccess: (r) => {
      invalidate();
      toast.success(r.already_active ? "الموافقة مسجّلة مسبقًا" : "تم تسجيل موافقتك");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "تعذّر تسجيل الموافقة"),
  });

  const withdrawMut = useMutation({
    mutationFn: (v: { record_id: string; reason?: string }) =>
      withdrawConsent({ data: v }),
    onSuccess: () => {
      invalidate();
      toast.success("تم سحب الموافقة");
      setWithdrawTarget(null);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "تعذّر سحب الموافقة"),
  });

  const [withdrawTarget, setWithdrawTarget] = useState<{
    view: ConsentView;
    record: ConsentRecord;
  } | null>(null);

  const stats = useMemo(() => {
    const total = q.data.length;
    const granted = q.data.filter((v) => v.active).length;
    const missingRequired = q.data.filter(
      (v) => v.catalog.required && !v.active,
    ).length;
    return { total, granted, missingRequired };
  }, [q.data]);

  const groups: Array<{ key: ConsentCatalogItem["category"]; items: ConsentView[] }> =
    useMemo(() => {
      const ordered: ConsentCatalogItem["category"][] = ["essential", "clinical", "optional"];
      return ordered
        .map((k) => ({ key: k, items: q.data.filter((v) => v.catalog.category === k) }))
        .filter((g) => g.items.length > 0);
    }, [q.data]);

  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="h-11 w-11 rounded-2xl grid place-items-center text-white"
              style={{ background: "var(--portal-gradient)" }}
              aria-hidden
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[color:var(--portal-ink)]">
                الموافقات والخصوصية
              </h1>
              <p className="text-xs sm:text-sm text-[color:var(--portal-ink-2)]">
                شروط الموافقة الصحية وسياسات الخصوصية الخاصة بحسابك — مع توثيق زمني كامل.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => invalidate()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[color:var(--portal-border)] bg-white text-sm text-[color:var(--portal-ink)] hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            تحديث
          </button>
        </header>

        {/* Summary */}
        <section className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="إجمالي البنود"
            value={stats.total}
            icon={<FileCheck2 className="h-5 w-5" />}
            tone="neutral"
          />
          <StatCard
            label="ممنوحة"
            value={stats.granted}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="ok"
          />
          <StatCard
            label="مطلوبة وغير ممنوحة"
            value={stats.missingRequired}
            icon={<AlertTriangle className="h-5 w-5" />}
            tone={stats.missingRequired > 0 ? "warn" : "neutral"}
          />
        </section>

        {stats.missingRequired > 0 && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 p-4 flex gap-3"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
            <div className="text-sm leading-relaxed">
              يوجد <strong>{stats.missingRequired}</strong> من الموافقات الأساسية لم يتم منحها بعد.
              يُرجى مراجعة البنود ذات العلامة الحمراء وتسجيل موافقتك لاستمرار خدمات البوابة.
            </div>
          </div>
        )}

        {/* Groups */}
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`group-${g.key}`}>
              <h2
                id={`group-${g.key}`}
                className="mb-3 text-sm font-semibold text-[color:var(--portal-ink-2)] px-1"
              >
                الموافقات {CATEGORY_LABEL[g.key]}
              </h2>
              <ul className="space-y-3">
                {g.items.map((v) => (
                  <ConsentRow
                    key={v.catalog.type}
                    view={v}
                    onGrant={() => grantMut.mutate(v.catalog.type)}
                    onWithdraw={(record) => setWithdrawTarget({ view: v, record })}
                    granting={
                      grantMut.isPending && grantMut.variables === v.catalog.type
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-8 text-center text-[11px] text-[color:var(--portal-ink-2)]">
          توافق أنت وحدك على حساباتك — يمكنك سحب أي موافقة اختيارية في أي وقت.
        </p>
      </main>

      {withdrawTarget && (
        <WithdrawDialog
          target={withdrawTarget}
          pending={withdrawMut.isPending}
          onClose={() => setWithdrawTarget(null)}
          onConfirm={(reason) =>
            withdrawMut.mutate({ record_id: withdrawTarget.record.id, reason })
          }
        />
      )}
    </div>
  );
}

/* ----------------------------- row ----------------------------------- */

function ConsentRow({
  view,
  onGrant,
  onWithdraw,
  granting,
}: {
  view: ConsentView;
  onGrant: () => void;
  onWithdraw: (r: ConsentRecord) => void;
  granting: boolean;
}) {
  const { catalog, active, history } = view;
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const missingRequired = catalog.required && !active;

  return (
    <li
      className={`glass-card p-4 sm:p-5 transition ${
        missingRequired ? "ring-1 ring-red-300" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <StatusBadge status={active ? "granted" : "none"} required={catalog.required} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-[color:var(--portal-ink)]">
                {catalog.title_ar}
                {catalog.required && (
                  <span className="ms-2 inline-flex items-center h-5 px-1.5 rounded-md bg-red-50 text-red-700 border border-red-100 text-[10px] font-semibold">
                    مطلوب
                  </span>
                )}
                <span className="ms-2 text-[11px] text-[color:var(--portal-ink-2)] font-normal">
                  الإصدار {catalog.version}
                </span>
              </h3>
              <p className="mt-1 text-sm text-[color:var(--portal-ink-2)] leading-relaxed">
                {catalog.summary_ar}
              </p>
            </div>
          </div>

          {/* Timestamps */}
          {active && (
            <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-900 px-3 py-2 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              <span>
                مُنحت في{" "}
                <time dateTime={active.granted_at} className="font-semibold">
                  {fullDate(active.granted_at)}
                </time>{" "}
                عبر البوابة
              </span>
            </div>
          )}

          {/* Expand full text */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--portal-primary)] hover:underline"
            aria-expanded={open}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "-rotate-180" : ""}`}
            />
            {open ? "إخفاء النص الكامل" : "اقرأ النص الكامل"}
          </button>
          {open && (
            <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-3 text-[13px] leading-relaxed text-[color:var(--portal-ink)] whitespace-pre-wrap">
              {catalog.body_ar}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {active ? (
              <button
                type="button"
                onClick={() => onWithdraw(active)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-red-200 bg-white text-sm text-red-700 hover:bg-red-50"
              >
                <ShieldOff className="h-4 w-4" />
                سحب الموافقة
              </button>
            ) : (
              <button
                type="button"
                onClick={onGrant}
                disabled={granting}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--portal-gradient)" }}
              >
                {granting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {granting ? "جاري التسجيل…" : "أوافق"}
              </button>
            )}

            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-[color:var(--portal-ink-2)] hover:text-[color:var(--portal-ink)]"
              >
                <Clock className="h-3.5 w-3.5" />
                سجل التغييرات ({history.length})
              </button>
            )}
          </div>

          {/* History */}
          {showHistory && history.length > 0 && (
            <ol className="mt-3 border-r-2 border-[color:var(--portal-border)] ps-4 space-y-2 text-xs">
              {history.map((r) => (
                <li key={r.id} className="text-[color:var(--portal-ink-2)]">
                  <StatusPill status={r.status} />
                  <span className="ms-2 font-medium text-[color:var(--portal-ink)]">
                    {fullDate(r.granted_at)}
                  </span>
                  {r.withdrawn_at && (
                    <span className="ms-2">
                      — سُحبت في {fullDate(r.withdrawn_at)}
                    </span>
                  )}
                  {r.withdrawal_reason && (
                    <div className="mt-1 text-[color:var(--portal-ink-2)]">
                      السبب: {r.withdrawal_reason}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </li>
  );
}

/* ----------------------------- withdraw dialog ------------------------ */

function WithdrawDialog({
  target,
  pending,
  onClose,
  onConfirm,
}: {
  target: { view: ConsentView; record: ConsentRecord };
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const required = target.view.catalog.required;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="withdraw-title"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-[color:var(--portal-border)]">
        <div className="p-5 border-b border-[color:var(--portal-border)] flex items-start justify-between gap-3">
          <div>
            <h3
              id="withdraw-title"
              className="text-base font-bold text-[color:var(--portal-ink)]"
            >
              تأكيد سحب الموافقة
            </h3>
            <p className="mt-1 text-xs text-[color:var(--portal-ink-2)]">
              {target.view.catalog.title_ar}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full grid place-items-center text-[color:var(--portal-ink-2)] hover:bg-slate-100"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {required && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-xs leading-relaxed flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                هذه موافقة <strong>أساسية</strong>. سحبها قد يوقف بعض خدمات البوابة
                (الحجز، التقارير، الفواتير) حتى تعيد منحها.
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-[color:var(--portal-ink)]">
              سبب السحب (اختياري)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
              placeholder="مثل: لم أعد بحاجة لهذه الخدمة"
              className="mt-1 block w-full rounded-xl border border-[color:var(--portal-border)] bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--portal-primary)]/30"
            />
            <span className="mt-1 block text-[11px] text-[color:var(--portal-ink-2)]">
              {reason.length} / 500
            </span>
          </label>
        </div>

        <div className="p-5 border-t border-[color:var(--portal-border)] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-full border border-[color:var(--portal-border)] bg-white text-sm text-[color:var(--portal-ink)] hover:bg-slate-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm(reason.trim() || undefined)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
            تأكيد السحب
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- primitives ---------------------------- */

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "neutral" | "ok" | "warn";
}) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-white text-[color:var(--portal-ink)] border-[color:var(--portal-border)]";
  return (
    <div className={`rounded-2xl border p-4 flex items-center gap-3 ${toneClass}`}>
      <div className="h-10 w-10 rounded-xl bg-white/70 grid place-items-center" aria-hidden>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 text-xs">{label}</div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  required,
}: {
  status: "granted" | "none";
  required: boolean;
}) {
  if (status === "granted") {
    return (
      <div
        className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 grid place-items-center"
        aria-label="ممنوحة"
      >
        <CheckCircle2 className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div
      className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center border ${
        required
          ? "bg-red-50 text-red-600 border-red-100"
          : "bg-slate-50 text-slate-500 border-slate-200"
      }`}
      aria-label={required ? "مطلوبة وغير ممنوحة" : "غير ممنوحة"}
    >
      <ShieldOff className="h-5 w-5" />
    </div>
  );
}

function StatusPill({ status }: { status: ConsentRecord["status"] }) {
  const map: Record<ConsentRecord["status"], { label: string; cls: string }> = {
    granted: { label: "ممنوحة", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    withdrawn: { label: "مسحوبة", cls: "bg-red-50 text-red-700 border-red-100" },
    expired: { label: "منتهية", cls: "bg-amber-50 text-amber-700 border-amber-100" },
    superseded: { label: "مستبدلة", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center h-5 px-1.5 rounded-md border text-[10px] font-semibold ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

/* --------------------------- ux states ------------------------------- */

function SkeletonState() {
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 h-11 w-64 rounded-2xl bg-slate-200/60 animate-pulse" />
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-200/60 animate-pulse" />
          ))}
        </div>
        <ul className="space-y-3">
          {CONSENT_CATALOG.slice(0, 5).map((c) => (
            <li key={c.type} className="glass-card p-5 flex gap-3 items-start">
              <div className="h-10 w-10 rounded-xl bg-slate-200/60 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 rounded bg-slate-200/60 animate-pulse" />
                <div className="h-3 w-4/5 rounded bg-slate-200/50 animate-pulse" />
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh grid place-items-center p-6" dir="rtl">
      <div className="glass-card max-w-md w-full p-8 text-center">
        <div
          className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4"
          aria-hidden
        >
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-[color:var(--portal-ink)]">
          تعذّر تحميل الموافقات
        </h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)] break-words">
          {error.message || "حدث خطأ غير متوقع."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold text-white"
            style={{ background: "var(--portal-gradient)" }}
          >
            <RefreshCw className="h-4 w-4" />
            حاول مجددًا
          </button>
          <Link
            to="/portal"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold border border-[color:var(--portal-border)] bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            العودة إلى البوابة
          </Link>
        </div>
        <div className="mt-4 text-[11px] text-[color:var(--portal-ink-2)]">
          <Inbox className="inline h-3 w-3 me-1" />
          يمكنك التواصل مع الدعم إن استمرت المشكلة.
        </div>
      </div>
    </div>
  );
}
