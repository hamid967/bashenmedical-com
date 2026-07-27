/**
 * لوحة الطلبات الموحّدة (Admin/Reception) — Bashen Medical.
 *
 * تعرض كل طلبات المنصّة عبر أنواع الخدمات مع فلاتر النوع/الحالة/البحث،
 * حالة موحّدة بصريّة (OrderStatusBadge)، ولوحة جانبية لعرض سجل التدقيق
 * للمواعيد (appointment_audit) عند النقر على "السجل".
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import {
  UNIFIED_STATUS_LABELS_AR,
  toUnifiedStatus,
  type OrderTableKind,
  type UnifiedStatus,
} from "@/lib/unified-status";

const KIND_LABELS_AR: Record<OrderTableKind, string> = {
  appointment: "موعد",
  complaint: "بلاغ",
  medicine_order: "صيدلية",
  home_care: "زيارة منزلية",
  second_opinion: "رأي ثانٍ",
  invoice: "فاتورة",
  lab_report: "مختبر",
  radiology_report: "أشعة",
};
import { listAllUnifiedOrders } from "@/lib/admin-unified-orders.functions";
import { listAppointmentAudit } from "@/lib/admin.functions";
import {
  ArrowLeft,
  Search,
  RefreshCw,
  Filter as FilterIcon,
  History,
  X,
  Calendar,
  MessageSquareWarning,
  Pill,
  Home as HomeIcon,
  Stethoscope,
  Receipt,
  FlaskConical,
  Scan,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/orders-unified")({
  head: () => ({
    meta: [
      { title: "لوحة الطلبات الموحّدة | باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrdersUnifiedPage,
});

const KIND_ICONS: Record<OrderTableKind, React.ComponentType<{ className?: string }>> = {
  appointment: Calendar,
  complaint: MessageSquareWarning,
  medicine_order: Pill,
  home_care: HomeIcon,
  second_opinion: Stethoscope,
  invoice: Receipt,
  lab_report: FlaskConical,
  radiology_report: Scan,
};

const ALL_KINDS: OrderTableKind[] = [
  "appointment",
  "complaint",
  "medicine_order",
  "home_care",
  "second_opinion",
  "invoice",
  "lab_report",
  "radiology_report",
];

const ALL_UNIFIED: UnifiedStatus[] = [
  "submitted",
  "under_review",
  "waiting_patient",
  "approved",
  "scheduled",
  "completed",
  "rejected",
  "cancelled",
];

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function OrdersUnifiedPage() {
  return (
    <RequirePermission anyOf={["appointments.view", "audit.view"]}>
      <OrdersUnifiedInner />
    </RequirePermission>
  );
}

function OrdersUnifiedInner() {
  const [kinds, setKinds] = useState<Set<OrderTableKind>>(new Set(ALL_KINDS));
  const [unifiedFilter, setUnifiedFilter] = useState<Set<UnifiedStatus>>(new Set());
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>("");
  const [sortBy, setSortBy] = useState<"created_at" | "updated_at">("updated_at");
  const [auditFor, setAuditFor] = useState<{ id: string; label: string } | null>(null);

  // debounce basic
  useMemoDebounce(search, 350, setDebounced);

  const call = useServerFn(listAllUnifiedOrders);
  const kindsArr = Array.from(kinds);
  const fromISO = dateFrom ? new Date(dateFrom + "T00:00:00").toISOString() : undefined;
  const toISO = dateTo ? new Date(dateTo + "T23:59:59.999").toISOString() : undefined;
  const qk = [
    "orders-unified",
    kindsArr.sort().join(","),
    debounced,
    fromISO ?? "",
    toISO ?? "",
    sortBy,
  ];
  const query = useQuery({
    queryKey: qk,
    queryFn: () =>
      call({
        data: {
          kinds: kindsArr.length === ALL_KINDS.length ? undefined : kindsArr,
          search: debounced || undefined,
          limitPerKind: 50,
          from: fromISO,
          to: toISO,
          sortBy,
        },
      }),
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    const all = query.data ?? [];
    if (unifiedFilter.size === 0) return all;
    return all.filter((r) => unifiedFilter.has(toUnifiedStatus(r.kind, r.status)));
  }, [query.data, unifiedFilter]);

  const toggleKind = (k: OrderTableKind) => {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      if (next.size === 0) return new Set(ALL_KINDS);
      return next;
    });
  };
  const toggleUnified = (s: UnifiedStatus) => {
    setUnifiedFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="container-app py-8" dir="rtl">
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/admin" className="hover:text-primary inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> لوحة الإدارة
            </Link>
          </div>
          <h1 className="text-2xl md:text-3xl mt-1">لوحة الطلبات الموحّدة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            كل الطلبات عبر خدمات المستشفى بحالة موحّدة وسجل تدقيق.
          </p>
        </div>
        <button
          onClick={() => query.refetch()}
          className="inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-card hover:bg-muted text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {/* Search */}
      <div className="bg-card border border-border rounded-2xl p-3 md:p-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="grid place-items-center h-9 w-9 text-muted-foreground">
            <Search className="h-4 w-4" />
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث برقم الجوال، الاسم، أو مرجع البلاغ/الفاتورة…"
            className="flex-1 bg-transparent outline-none text-sm h-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-xs text-muted-foreground px-2 h-8 rounded hover:bg-muted"
            >
              مسح
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FilterIcon className="h-3.5 w-3.5" /> نوع الخدمة:
          </span>
          {ALL_KINDS.map((k) => {
            const active = kinds.has(k);
            const Icon = KIND_ICONS[k];
            return (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full border text-xs transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {KIND_LABELS_AR[k]}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">الحالة:</span>
          {ALL_UNIFIED.map((s) => {
            const active = unifiedFilter.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleUnified(s)}
                className={`px-2.5 h-7 rounded-full border text-xs transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted"
                }`}
              >
                {UNIFIED_STATUS_LABELS_AR[s]}
              </button>
            );
          })}
          {unifiedFilter.size > 0 && (
            <button
              onClick={() => setUnifiedFilter(new Set())}
              className="text-xs text-muted-foreground px-2 h-7 rounded hover:bg-muted"
            >
              إعادة تعيين
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">من:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 px-2 rounded-lg border border-border bg-background text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">إلى:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 px-2 rounded-lg border border-border bg-background text-xs"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="text-xs text-muted-foreground px-2 h-7 rounded hover:bg-muted"
            >
              مسح التاريخ
            </button>
          )}

          <div className="flex items-center gap-1.5 ms-auto">
            <span className="text-xs text-muted-foreground">ترتيب:</span>
            <button
              onClick={() => setSortBy("updated_at")}
              className={`px-2.5 h-7 rounded-full border text-xs transition-colors ${
                sortBy === "updated_at"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-muted"
              }`}
            >
              آخر تحديث
            </button>
            <button
              onClick={() => setSortBy("created_at")}
              className={`px-2.5 h-7 rounded-full border text-xs transition-colors ${
                sortBy === "created_at"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-muted"
              }`}
            >
              الأحدث إنشاءً
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-semibold">النوع</th>
                <th className="p-3 text-start font-semibold">المريض</th>
                <th className="p-3 text-start font-semibold">التفاصيل</th>
                <th className="p-3 text-start font-semibold">الحالة</th>
                <th className="p-3 text-start font-semibold whitespace-nowrap">
                  {sortBy === "updated_at" ? "آخر تحديث" : "أُنشئ"}
                </th>
                <th className="p-3 text-start font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    جارٍ التحميل…
                  </td>
                </tr>
              )}
              {query.isError && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-red-600">
                    تعذّر التحميل: {(query.error as Error).message}
                  </td>
                </tr>
              )}
              {!query.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    لا توجد نتائج مطابقة.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const Icon = KIND_ICONS[r.kind];
                return (
                  <tr key={`${r.kind}:${r.id}`} className="hover:bg-muted/30">
                    <td className="p-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Icon className="h-4 w-4 text-primary" />
                        {KIND_LABELS_AR[r.kind]}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="font-semibold">{r.patient_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {r.patient_phone ?? ""}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {r.reference ? <span className="font-mono me-1">{r.reference}</span> : null}
                        {r.meta ?? ""}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <OrderStatusBadge kind={r.kind} status={r.status} raw />
                    </td>
                    <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDate(sortBy === "updated_at" ? r.updated_at : r.created_at)}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/orders-unified/$kind/$id"
                          params={{ kind: r.kind, id: r.id }}
                          className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 text-xs"
                          title="تفاصيل الطلب"
                        >
                          تفاصيل
                        </Link>
                        {r.kind === "appointment" && (
                          <button
                            onClick={() =>
                              setAuditFor({
                                id: r.id,
                                label: `${r.patient_name ?? "موعد"} — ${r.meta ?? ""}`,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-border bg-card hover:bg-muted text-xs"
                            title="سجل التغييرات"
                          >
                            <History className="h-3.5 w-3.5" />
                            السجل
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 text-xs text-muted-foreground border-t border-border">
          إجمالي المعروض: {rows.length}
        </div>
      </div>

      {auditFor && (
        <AuditModal
          appointmentId={auditFor.id}
          title={auditFor.label}
          onClose={() => setAuditFor(null)}
        />
      )}
    </div>
  );
}

function AuditModal({
  appointmentId,
  title,
  onClose,
}: {
  appointmentId: string;
  title: string;
  onClose: () => void;
}) {
  const call = useServerFn(listAppointmentAudit);
  const q = useQuery({
    queryKey: ["appointment-audit", appointmentId],
    queryFn: () => call({ data: { appointmentId } }),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" dir="rtl">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="font-bold">سجل تغييرات الحجز</h3>
            <p className="text-xs text-muted-foreground truncate max-w-md">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {q.isLoading && <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>}
          {q.isError && (
            <div className="text-sm text-red-600">تعذّر التحميل: {(q.error as Error).message}</div>
          )}
          {q.data && q.data.length === 0 && (
            <div className="text-sm text-muted-foreground">لا توجد تغييرات مسجّلة.</div>
          )}
          <ul className="space-y-3">
            {(q.data ?? []).map((row: any, i: number) => (
              <li key={i} className="rounded-xl border border-border p-3 bg-background/50 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{fmtDate(row.changed_at)}</span>
                  {row.actor_kind && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted">
                      {row.actor_kind}
                    </span>
                  )}
                </div>
                {row.old_status || row.new_status ? (
                  <div className="text-xs">
                    <span className="text-muted-foreground">نوع الانتقال: </span>
                    <span className="font-semibold">{row.old_status ?? "∅"}</span>
                    <span className="mx-1">→</span>
                    <span className="font-semibold">{row.new_status ?? "∅"}</span>
                  </div>
                ) : null}
                {row.old_notes !== row.new_notes ? (
                  <div className="text-xs mt-1">
                    <span className="text-muted-foreground">الملاحظات: </span>
                    <span className="line-through text-muted-foreground">
                      {row.old_notes ?? "∅"}
                    </span>
                    <span className="mx-1">→</span>
                    <span>{row.new_notes ?? "∅"}</span>
                  </div>
                ) : null}
                {row.reason ? (
                  <div className="text-xs mt-1">
                    <span className="text-muted-foreground">السبب: </span>
                    {row.reason}
                  </div>
                ) : null}
                {row.changed_by_name ? (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    بواسطة: {row.changed_by_name}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// tiny debounce hook — inline لأنّ الملف صغير الاستخدام
import { useEffect } from "react";
function useMemoDebounce(value: string, delay: number, cb: (v: string) => void) {
  useEffect(() => {
    const t = setTimeout(() => cb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay, cb]);
}
