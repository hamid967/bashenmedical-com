import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listRolePermissionAudit,
  type RolePermissionAuditRow,
  type AppRole,
} from "@/lib/rbac.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "مسؤول أعلى",
  admin: "مسؤول",
  center_admin: "مسؤول المجمع",
  branch_manager: "مدير فرع",
  doctor: "طبيب",
  reception: "استقبال",
  pharmacy: "صيدلية",
  reports_officer: "التقارير",
  billing_officer: "الفوترة",
  insurance_officer: "التأمين",
  support_agent: "الدعم",
  content_manager: "المحتوى",
  auditor: "مدقق",
  patient: "مريض",
};

const auditQuery = queryOptions({
  queryKey: ["rbac", "role-permission-audit", 200],
  queryFn: () => listRolePermissionAudit({ data: { limit: 200, offset: 0 } }),
  staleTime: 10_000,
});

export const Route = createFileRoute("/_authenticated/admin/super/permissions/audit")({
  loader: ({ context }) => context.queryClient.ensureQueryData(auditQuery),
  head: () => ({
    meta: [
      { title: "سجل تدقيق الصلاحيات | Super Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="rbac.manage">
      <AuditPage />
    </RequirePermission>
  ),
  errorComponent: AuditError,
  notFoundComponent: () => null,
});

function AuditPage() {
  const { data: rows } = useSuspenseQuery(auditQuery);
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "">("");
  const [actionFilter, setActionFilter] = useState<"" | "granted" | "revoked">("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter && r.role_key !== roleFilter) return false;
      if (actionFilter === "granted" && r.action !== "role_permission_granted") return false;
      if (actionFilter === "revoked" && r.action !== "role_permission_revoked") return false;
      if (!q) return true;
      return [
        r.permission_key,
        r.permission_label_ar,
        r.permission_label_en,
        r.actor_name,
        r.actor_email,
        r.role_key,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [rows, filter, roleFilter, actionFilter]);

  const uniqueRoles = useMemo(() => {
    const s = new Set<AppRole>();
    rows.forEach((r) => r.role_key && s.add(r.role_key));
    return [...s];
  }, [rows]);

  return (
    <div className="container-app py-8 space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Super Admin
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-7 w-7 text-primary" />
            سجل تدقيق الصلاحيات
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            جميع التغييرات على صلاحيات الأدوار — من قام بالتغيير، متى، والقيمة السابقة والجديدة.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{filtered.length} من {rows.length}</Badge>
          <Link
            to="/admin/super/permissions"
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full border border-border bg-card hover:bg-accent px-3 h-8"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            العودة للمصفوفة
          </Link>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="ابحث بالمفتاح أو الوصف أو اسم المستخدم…"
            className="pr-9"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as AppRole | "")}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">كل الأدوار</option>
          {uniqueRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r] ?? r}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as "" | "granted" | "revoked")}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">كل الإجراءات</option>
          <option value="granted">منح صلاحية</option>
          <option value="revoked">إلغاء صلاحية</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <History className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            لا توجد أي تغييرات مسجّلة حتى الآن.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-right">
                <th className="px-3 py-2 whitespace-nowrap">التاريخ</th>
                <th className="px-3 py-2 whitespace-nowrap">من قام بالتغيير</th>
                <th className="px-3 py-2 whitespace-nowrap">الدور</th>
                <th className="px-3 py-2">الصلاحية</th>
                <th className="px-3 py-2 whitespace-nowrap">السابق</th>
                <th className="px-3 py-2 whitespace-nowrap">الجديد</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <AuditRow key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditRow({ row }: { row: RolePermissionAuditRow }) {
  const dt = new Date(row.created_at);
  const dateStr = dt.toLocaleString("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const permLabel =
    row.permission_label_ar || row.permission_label_en || row.permission_key || "—";
  const prev = row.previous_enabled;
  const next = row.new_enabled;
  const grant = row.action === "role_permission_granted";
  return (
    <tr className="border-t border-border align-top hover:bg-muted/20">
      <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
        {dateStr}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
            <UserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">
              {row.actor_name ?? "—"}
            </div>
            <div className="text-[11px] text-muted-foreground truncate" dir="ltr">
              {row.actor_email ?? row.actor_id ?? "—"}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="text-sm font-semibold">
          {row.role_key ? ROLE_LABEL[row.role_key] ?? row.role_key : "—"}
        </div>
        <div className="text-[11px] font-mono text-muted-foreground" dir="ltr">
          {row.role_key ?? ""}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="font-medium">{permLabel}</div>
        <div className="text-[11px] font-mono text-muted-foreground" dir="ltr">
          {row.permission_key ?? ""}
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <StateBadge value={prev} />
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <StateBadge value={next} highlight={grant ? "on" : "off"} />
      </td>
    </tr>
  );
}

function StateBadge({
  value,
  highlight,
}: {
  value: boolean | null;
  highlight?: "on" | "off";
}) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const on = value === true;
  const strong = (highlight === "on" && on) || (highlight === "off" && !on);
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 h-6 ${
        on
          ? strong
            ? "bg-emerald-600 text-white"
            : "bg-emerald-50 text-emerald-700"
          : strong
            ? "bg-red-600 text-white"
            : "bg-red-50 text-red-700"
      }`}
    >
      {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {on ? "مُفعّلة" : "معطّلة"}
    </span>
  );
}

function AuditError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="container-app py-10">
      <div className="max-w-md mx-auto rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-bold">تعذّر تحميل سجل التدقيق</h3>
        <p className="text-sm text-muted-foreground mt-2 break-words">
          {error.message || "خطأ غير متوقع."}
        </p>
        <Button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4"
        >
          <RefreshCw className="h-4 w-4 ms-2" />
          إعادة المحاولة
        </Button>
      </div>
    </div>
  );
}
