import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ShieldAlert, RefreshCw, ChevronLeft, Filter, X, ArrowRight } from "lucide-react";
import { listRbacAuditLog, listUsersWithRoles, listPermissionsCatalog } from "@/lib/rbac.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";

const ROLES = ["super_admin", "admin", "doctor", "reception", "pharmacy"];

const TABLE_LABELS: Record<string, string> = {
  user_roles: "أدوار المستخدمين",
  role_permissions: "صلاحيات الأدوار",
  permissions: "كتالوج الصلاحيات",
};

const OP_LABELS: Record<string, { label: string; cls: string }> = {
  insert: { label: "إضافة", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  update: { label: "تعديل", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  delete: { label: "حذف", cls: "bg-red-500/15 text-red-700 border-red-500/30" },
  other: { label: "آخر", cls: "bg-muted text-foreground/70 border-border" },
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ar-SA", {
      dateStyle: "short",
      timeStyle: "medium",
    });
  } catch {
    return iso;
  }
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type Row = Awaited<ReturnType<typeof listRbacAuditLog>>[number];

function DiffCard({ row }: { row: Row }) {
  const meta = row.metadata ?? {};
  const changes = meta.changes as Record<string, { old: unknown; new: unknown }> | undefined;
  const newRow = meta.new as Record<string, unknown> | undefined;
  const oldRow = meta.old as Record<string, unknown> | undefined;

  if (changes && Object.keys(changes).length) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="text-right p-2 font-medium">الحقل</th>
              <th className="text-right p-2 font-medium">القيمة قبل</th>
              <th className="text-right p-2 font-medium">القيمة بعد</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(changes).map(([field, diff]) => (
              <tr key={field} className="border-t border-border/40">
                <td className="p-2 font-mono text-foreground">{field}</td>
                <td className="p-2 font-mono text-red-600 line-through decoration-red-400/60">
                  {fmtVal(diff.old)}
                </td>
                <td className="p-2 font-mono text-emerald-700">{fmtVal(diff.new)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (newRow && !oldRow) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="text-xs font-medium text-emerald-700 mb-2">تمت إضافة سجل جديد</div>
        <pre className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap font-mono">
          {JSON.stringify(newRow, null, 2)}
        </pre>
      </div>
    );
  }

  if (oldRow && !newRow) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
        <div className="text-xs font-medium text-red-700 mb-2">تم حذف السجل</div>
        <pre className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap font-mono line-through decoration-red-400/40">
          {JSON.stringify(oldRow, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <pre className="text-[11px] leading-relaxed text-foreground/70 whitespace-pre-wrap font-mono">
        {JSON.stringify(meta, null, 2)}
      </pre>
    </div>
  );
}

function Page() {
  const runList = useServerFn(listRbacAuditLog);
  const runUsers = useServerFn(listUsersWithRoles);
  const runPerms = useServerFn(listPermissionsCatalog);

  const [table, setTable] = useState<"all" | "user_roles" | "role_permissions" | "permissions">(
    "all",
  );
  const [actor, setActor] = useState<string>("");
  const [targetUser, setTargetUser] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [permissionKey, setPermissionKey] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [limit, setLimit] = useState<number>(200);

  const usersQ = useQuery({
    queryKey: ["rbac-audit-users"],
    queryFn: () => runUsers(),
    staleTime: 60_000,
  });
  const permsQ = useQuery({
    queryKey: ["rbac-audit-perms"],
    queryFn: () => runPerms(),
    staleTime: 60_000,
  });

  const logsQ = useQuery({
    queryKey: ["rbac-audit", table, actor, targetUser, role, permissionKey, from, to, q, limit],
    queryFn: () =>
      runList({
        data: {
          table,
          actor: actor || undefined,
          target_user: targetUser || undefined,
          role: role || undefined,
          permission_key: permissionKey || undefined,
          from: from || undefined,
          to: to || undefined,
          q: q || undefined,
          limit,
        },
      }),
  });

  const users = usersQ.data ?? [];
  const perms = permsQ.data ?? [];
  const rows = logsQ.data ?? [];

  const activeFilters = useMemo(() => {
    const items: Array<{ label: string; clear: () => void }> = [];
    if (table !== "all")
      items.push({
        label: `الجدول: ${TABLE_LABELS[table] ?? table}`,
        clear: () => setTable("all"),
      });
    if (actor) {
      const u = users.find((x) => x.user_id === actor);
      items.push({
        label: `المُنفّذ: ${u?.full_name ?? actor.slice(0, 8)}`,
        clear: () => setActor(""),
      });
    }
    if (targetUser) {
      const u = users.find((x) => x.user_id === targetUser);
      items.push({
        label: `المستهدف: ${u?.full_name ?? targetUser.slice(0, 8)}`,
        clear: () => setTargetUser(""),
      });
    }
    if (role) items.push({ label: `الدور: ${role}`, clear: () => setRole("") });
    if (permissionKey)
      items.push({ label: `الصلاحية: ${permissionKey}`, clear: () => setPermissionKey("") });
    if (from) items.push({ label: `من: ${from}`, clear: () => setFrom("") });
    if (to) items.push({ label: `إلى: ${to}`, clear: () => setTo("") });
    if (q) items.push({ label: `بحث: ${q}`, clear: () => setQ("") });
    return items;
  }, [table, actor, targetUser, role, permissionKey, from, to, q, users]);

  const clearAll = () => {
    setTable("all");
    setActor("");
    setTargetUser("");
    setRole("");
    setPermissionKey("");
    setFrom("");
    setTo("");
    setQ("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20" dir="rtl">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            العودة
          </Link>
          <div className="flex items-center gap-2 ms-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">سجل تدقيق الأدوار والصلاحيات</h1>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <Link
              to="/audit-log"
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
            >
              السجل العام
              <ArrowRight className="w-3 h-3" />
            </Link>
            <button
              onClick={() => logsQ.refetch()}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className={`w-3 h-3 ${logsQ.isFetching ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <section className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">فلاتر البحث</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">الجدول</span>
              <select
                value={table}
                onChange={(e) => setTable(e.target.value as any)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">كل الجداول</option>
                <option value="user_roles">أدوار المستخدمين</option>
                <option value="role_permissions">صلاحيات الأدوار</option>
                <option value="permissions">كتالوج الصلاحيات</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">المُنفّذ (Actor)</span>
              <select
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">الكل</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.full_name ?? u.phone ?? u.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">المستخدم المستهدف</span>
              <select
                value={targetUser}
                onChange={(e) => setTargetUser(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">الكل</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.full_name ?? u.phone ?? u.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">الدور</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">الكل</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">مفتاح الصلاحية</span>
              <select
                value={permissionKey}
                onChange={(e) => setPermissionKey(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">الكل</option>
                {perms.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">من تاريخ</span>
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">إلى تاريخ</span>
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">بحث حر في التفاصيل</span>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="نص داخل الميتاداتا..."
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground flex items-center gap-2">
              الحد:
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
            </label>
            {activeFilters.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" /> مسح الفلاتر
              </button>
            )}
            {activeFilters.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"
              >
                {f.label}
                <button onClick={f.clear} className="hover:text-primary/70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </section>

        {/* Results */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">
              النتائج <span className="text-muted-foreground font-normal">({rows.length})</span>
            </h2>
          </div>

          {logsQ.isLoading ? (
            <div className="rounded-xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">
              جاري تحميل السجل...
            </div>
          ) : logsQ.isError ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-sm text-red-700">
              تعذّر تحميل السجل: {String((logsQ.error as any)?.message ?? logsQ.error)}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              لا توجد أحداث مطابقة للفلاتر الحالية.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => {
                const op = OP_LABELS[r.op] ?? OP_LABELS.other;
                return (
                  <article
                    key={r.id}
                    className="rounded-xl border border-border/60 bg-card p-4 shadow-sm"
                  >
                    <header className="flex flex-wrap items-center gap-2 mb-3">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${op.cls}`}
                      >
                        {op.label}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        {TABLE_LABELS[r.table_name] ?? r.table_name}
                      </span>
                      {r.role && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">
                          {r.role}
                        </span>
                      )}
                      {r.permission_key && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/40 text-accent-foreground border border-accent font-mono">
                          {r.permission_key}
                        </span>
                      )}
                      <span className="ms-auto text-xs text-muted-foreground">
                        {fmtDate(r.created_at)}
                      </span>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-xs">
                      <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                        <div className="text-muted-foreground mb-0.5">قام بالتنفيذ</div>
                        <div className="font-medium">
                          {r.actor_name ?? r.actor_phone ?? r.actor?.slice(0, 8) ?? "النظام"}
                        </div>
                        {r.actor_phone && r.actor_name && (
                          <div className="text-muted-foreground text-[11px]">{r.actor_phone}</div>
                        )}
                        {r.ip_address && (
                          <div className="text-muted-foreground text-[11px] font-mono mt-1">
                            IP: {r.ip_address}
                          </div>
                        )}
                      </div>
                      <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                        <div className="text-muted-foreground mb-0.5">المستخدم المستهدف</div>
                        <div className="font-medium">
                          {r.target_user_name ??
                            r.target_user_phone ??
                            r.target_user_id?.slice(0, 8) ??
                            "—"}
                        </div>
                        {r.target_user_phone && r.target_user_name && (
                          <div className="text-muted-foreground text-[11px]">
                            {r.target_user_phone}
                          </div>
                        )}
                      </div>
                    </div>

                    <DiffCard row={r} />
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/rbac-audit")({
  head: () => ({
    meta: [
      { title: "سجل تدقيق الصلاحيات (RBAC) — لوحة الإدارة | مجمع باعشن الطبي" },
      { name: "description", content: "متابعة تغييرات الأدوار والصلاحيات وكتالوج الصلاحيات لأغراض التدقيق." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "سجل تدقيق الصلاحيات (RBAC)" },
      { property: "og:description", content: "أداة إدارية لتدقيق تغييرات الأدوار والصلاحيات." },
      { property: "og:url", content: "https://bashenmedical.com/rbac-audit" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/rbac-audit" }],
  }),
  component: () => (
    <RequirePermission anyOf={["rbac.manage", "audit.view"]}>
      <Page />
    </RequirePermission>
  ),
});
