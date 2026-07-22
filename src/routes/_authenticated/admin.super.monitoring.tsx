/**
 * /admin/super/monitoring — Super Admin system health & feature flags.
 *
 * Sections:
 *  - System vitals (activity 24h)
 *  - Background jobs failure rates (notifications, attachment scans)
 *  - Integrations health table (aggregated integration_logs, 24h)
 *  - Webhooks health (subset of integrations matching /webhook|hook|callback|inbound/i)
 *  - Feature flags editor (create/toggle/delete)
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Flag,
  Gauge,
  Loader2,
  Plus,
  Plug,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import {
  deleteFeatureFlag,
  getSystemHealth,
  listFeatureFlags,
  setFeatureFlag,
  type FeatureFlag,
  type IntegrationHealth,
  type SystemHealthReport,
} from "@/lib/admin/super-monitoring.functions";

const healthQuery = queryOptions({
  queryKey: ["admin", "super", "system-health"],
  queryFn: () => getSystemHealth(),
  staleTime: 30_000,
  refetchInterval: 60_000,
});

const flagsQuery = queryOptions({
  queryKey: ["admin", "super", "feature-flags"],
  queryFn: () => listFeatureFlags(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/admin/super/monitoring")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(healthQuery),
      context.queryClient.ensureQueryData(flagsQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "صحة النظام | Super Admin" },
      {
        name: "description",
        content: "لوحة مراقبة صحة النظام، التكاملات، المهام الخلفية وإدارة feature flags.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="system.monitor">
      <MonitoringPage />
    </RequirePermission>
  ),
  errorComponent: ErrorState,
  pendingComponent: Skeleton,
});

/* ------------------------------- Page ------------------------------------ */

function MonitoringPage() {
  const health = useSuspenseQuery(healthQuery);
  const flags = useSuspenseQuery(flagsQuery);
  const qc = useQueryClient();
  const report = health.data;

  return (
    <div className="container-app py-6 space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="text-xs text-muted-foreground flex items-center gap-1">
            <Link to="/admin" className="hover:text-foreground">
              لوحة الإدارة
            </Link>
            <ChevronRight className="h-3 w-3 rotate-180" />
            <span>Super Admin</span>
            <ChevronRight className="h-3 w-3 rotate-180" />
            <span className="text-foreground">صحة النظام</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gauge className="h-6 w-6 text-emerald-600" />
            صحة النظام والمراقبة
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            آخر تحديث: {new Date(report.generated_at).toLocaleString("ar")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/super/permissions"
            className="inline-flex items-center gap-1.5 rounded-full border border-input bg-white px-3 h-9 text-xs font-medium hover:bg-muted"
          >
            <Shield className="h-3.5 w-3.5" />
            مصفوفة الصلاحيات
          </Link>
          <button
            type="button"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["admin", "super", "system-health"] });
              qc.invalidateQueries({ queryKey: ["admin", "super", "feature-flags"] });
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 h-9 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </button>
        </div>
      </header>

      <VitalsGrid report={report} />
      <JobsCard report={report} />
      <IntegrationsCard
        title="التكاملات"
        icon={Plug}
        rows={report.integrations}
        emptyMsg="لا توجد سجلات تكامل خلال آخر 24 ساعة."
      />
      <IntegrationsCard
        title="Webhooks"
        icon={Webhook}
        rows={report.webhooks}
        emptyMsg="لم يتم استقبال أي webhook خلال آخر 24 ساعة."
      />
      <FeatureFlagsCard flags={flags.data} />
    </div>
  );
}

/* ------------------------------ Vitals ---------------------------------- */

function VitalsGrid({ report }: { report: SystemHealthReport }) {
  const cards = [
    {
      label: "مواعيد جديدة (24س)",
      value: report.activity.new_appointments_24h,
      icon: Activity,
      tone: "emerald" as const,
    },
    {
      label: "استفسارات جديدة (24س)",
      value: report.activity.new_inquiries_24h,
      icon: Bell,
      tone: "sky" as const,
    },
    {
      label: "أحداث تدقيق (24س)",
      value: report.activity.audit_events_24h,
      icon: Shield,
      tone: "violet" as const,
    },
    {
      label: "أحداث أمنية (24س)",
      value: report.activity.security_events_24h,
      icon: ShieldAlert,
      tone: report.activity.security_events_24h > 0 ? ("amber" as const) : ("emerald" as const),
    },
  ];
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`glass-card p-4 border-t-2 border-${c.tone}-500`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <c.icon className="h-4 w-4" />
            {c.label}
          </div>
          <div className="mt-1 text-2xl font-bold">{c.value.toLocaleString("ar")}</div>
        </div>
      ))}
    </section>
  );
}

/* -------------------------- Background jobs card ------------------------- */

function JobsCard({ report }: { report: SystemHealthReport }) {
  const rate = report.jobs.notifications_failure_rate;
  const tone = rate === 0 ? "emerald" : rate < 0.05 ? "amber" : "red";
  const pct = (rate * 100).toFixed(1);
  return (
    <section className="glass-card p-5 space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        المهام الخلفية
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground">إشعارات (24س)</div>
          <div className="mt-1 text-2xl font-bold">
            {report.jobs.notifications_24h.toLocaleString("ar")}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            الفاشلة:{" "}
            <span className="font-semibold text-foreground">
              {report.jobs.notifications_failed_24h}
            </span>
          </div>
        </div>
        <div className={`rounded-xl border border-${tone}-200 bg-${tone}-50/40 p-4`}>
          <div className="text-xs text-muted-foreground">معدل فشل الإشعارات</div>
          <div className={`mt-1 text-2xl font-bold text-${tone}-600`}>{pct}%</div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full bg-${tone}-500`}
              style={{ width: `${Math.min(100, Math.max(2, rate * 100))}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs text-muted-foreground">فحص المرفقات</div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-center">
            <MiniStat
              label="قيد الفحص"
              value={report.jobs.inquiry_attachments_pending}
              tone="amber"
            />
            <MiniStat label="محجوب" value={report.jobs.inquiry_attachments_infected} tone="red" />
            <MiniStat label="خطأ فحص" value={report.jobs.inquiry_attachments_error} tone="red" />
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "red" | "emerald";
}) {
  return (
    <div>
      <div className={`text-lg font-bold text-${tone}-600`}>{value.toLocaleString("ar")}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

/* --------------------------- Integrations table -------------------------- */

function IntegrationsCard({
  title,
  icon: Icon,
  rows,
  emptyMsg,
}: {
  title: string;
  icon: typeof Plug;
  rows: IntegrationHealth[];
  emptyMsg: string;
}) {
  return (
    <section className="glass-card p-5">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{emptyMsg}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-start py-2 font-medium">التكامل</th>
                <th className="text-start py-2 font-medium">الحالة</th>
                <th className="text-start py-2 font-medium">نجاح</th>
                <th className="text-start py-2 font-medium">فشل</th>
                <th className="text-start py-2 font-medium">معدل النجاح</th>
                <th className="text-start py-2 font-medium">متوسط الاستجابة</th>
                <th className="text-start py-2 font-medium">آخر حدث</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <IntegrationRow key={r.integration_key} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function IntegrationRow({ row }: { row: IntegrationHealth }) {
  const okPct = (row.success_rate * 100).toFixed(0);
  const tone = row.failure_24h === 0 ? "emerald" : row.success_rate >= 0.95 ? "amber" : "red";
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.integration_key}</span>
          {row.is_mock && (
            <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px]">
              Mock
            </span>
          )}
        </div>
      </td>
      <td className="py-3">
        <StatusPill status={row.last_status} tone={tone} />
      </td>
      <td className="py-3 text-emerald-600 font-semibold">{row.success_24h}</td>
      <td
        className={`py-3 font-semibold ${row.failure_24h > 0 ? "text-red-600" : "text-muted-foreground"}`}
      >
        {row.failure_24h}
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full bg-${tone}-500`} style={{ width: `${okPct}%` }} />
          </div>
          <span className={`text-xs font-semibold text-${tone}-600`}>{okPct}%</span>
        </div>
      </td>
      <td className="py-3 text-xs text-muted-foreground">
        {row.avg_duration_ms == null ? "—" : `${row.avg_duration_ms} ms`}
      </td>
      <td className="py-3 text-xs text-muted-foreground">
        {row.last_at ? new Date(row.last_at).toLocaleString("ar") : "—"}
        {row.last_error && (
          <div className="text-[11px] text-red-600 truncate max-w-[240px]" title={row.last_error}>
            {row.last_error}
          </div>
        )}
      </td>
    </tr>
  );
}

function StatusPill({
  status,
  tone,
}: {
  status: IntegrationHealth["last_status"];
  tone: "emerald" | "amber" | "red";
}) {
  const label =
    status === "success"
      ? "سليم"
      : status === "failure"
        ? "فشل"
        : status === "pending"
          ? "قيد التنفيذ"
          : "—";
  const Icon = status === "failure" ? XCircle : status === "pending" ? Loader2 : CheckCircle2;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-${tone}-100 text-${tone}-700 px-2 py-0.5 text-[11px] font-medium`}
    >
      <Icon className={`h-3 w-3 ${status === "pending" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

/* ------------------------- Feature flags editor -------------------------- */

function FeatureFlagsCard({ flags }: { flags: FeatureFlag[] }) {
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const toggleMut = useMutation({
    mutationFn: (payload: { key: string; enabled: boolean; description?: string | null }) =>
      setFeatureFlag({ data: payload }),
    onMutate: (v) => setBusy(v.key),
    onSuccess: (_, v) => {
      toast.success(v.enabled ? `تم تفعيل "${v.key}"` : `تم إيقاف "${v.key}"`);
      qc.invalidateQueries({ queryKey: ["admin", "super", "feature-flags"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر حفظ الـ flag"),
    onSettled: () => setBusy(null),
  });

  const deleteMut = useMutation({
    mutationFn: (key: string) => deleteFeatureFlag({ data: { key } }),
    onMutate: (k) => setBusy(k),
    onSuccess: (_, k) => {
      toast.success(`تم حذف "${k}"`);
      qc.invalidateQueries({ queryKey: ["admin", "super", "feature-flags"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر الحذف"),
    onSettled: () => setBusy(null),
  });

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key) return;
    if (!/^[a-z0-9_.]+$/i.test(key)) {
      toast.error("المفتاح يقبل أحرفًا وأرقامًا و _ . فقط");
      return;
    }
    toggleMut.mutate({ key, enabled: false, description: newDesc.trim() || null });
    setNewKey("");
    setNewDesc("");
  };

  const sorted = useMemo(() => [...flags].sort((a, b) => a.key.localeCompare(b.key)), [flags]);

  return (
    <section className="glass-card p-5 space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Flag className="h-5 w-5 text-primary" />
        Feature Flags
      </h2>

      {/* Add row */}
      <div className="rounded-xl border border-dashed border-border p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] text-muted-foreground mb-1">المفتاح</label>
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="مثال: booking.online_payments"
            className="w-full rounded-md border border-input bg-white px-3 h-9 text-sm font-mono"
            dir="ltr"
          />
        </div>
        <div className="flex-[2] min-w-[220px]">
          <label className="block text-[11px] text-muted-foreground mb-1">الوصف (اختياري)</label>
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="لماذا يوجد هذا الـ flag وأثره على النظام"
            className="w-full rounded-md border border-input bg-white px-3 h-9 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newKey.trim() || toggleMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 h-9 text-sm font-semibold disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          إضافة
        </button>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          لا توجد flags حالياً — أضف أول flag لبدء التحكم بمزايا النظام.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((f) => (
            <li key={f.key} className="py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-semibold" dir="ltr">
                    {f.key}
                  </code>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      f.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {f.enabled ? "مفعّل" : "متوقف"}
                  </span>
                </div>
                {f.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    toggleMut.mutate({
                      key: f.key,
                      enabled: !f.enabled,
                      description: f.description,
                    })
                  }
                  disabled={busy === f.key}
                  role="switch"
                  aria-checked={f.enabled}
                  className={`relative h-6 w-11 rounded-full transition ${
                    f.enabled ? "bg-emerald-500" : "bg-slate-300"
                  } disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                      f.enabled ? "start-0.5" : "end-0.5"
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`حذف الـ flag "${f.key}"؟`)) deleteMut.mutate(f.key);
                  }}
                  disabled={busy === f.key}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                  aria-label="حذف"
                >
                  {busy === f.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        تُخزَّن الـ flags في <code>system_settings.feature_flags</code> — فقط <b>super_admin</b>{" "}
        يمكنه التعديل عبر RLS.
      </p>
    </section>
  );
}

/* -------------------------------- States --------------------------------- */

function Skeleton() {
  return (
    <div className="container-app py-6 space-y-4" dir="rtl">
      <div className="h-8 w-64 rounded-md bg-muted animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-4 h-20 animate-pulse" />
        ))}
      </div>
      <div className="glass-card p-6 h-40 animate-pulse" />
      <div className="glass-card p-6 h-60 animate-pulse" />
    </div>
  );
}

function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="container-app py-10" dir="rtl">
      <div className="glass-card p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-3">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold">تعذّر تحميل لوحة المراقبة</h2>
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
    </div>
  );
}
