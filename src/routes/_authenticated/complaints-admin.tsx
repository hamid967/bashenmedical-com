import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, MessageSquareWarning, Radio } from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import { supabase } from "@/integrations/supabase/client";
import { listAllComplaints, updateComplaint } from "@/lib/complaints.functions";

export const Route = createFileRoute("/_authenticated/complaints-admin")({
  head: () => ({
    meta: [
      { title: "الشكاوى والمقترحات — لوحة الإدارة" },
      { name: "description", content: "مراجعة وتحديث حالات الشكاوى والمقترحات." },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="patients.view">
      <ComplaintsAdminPage />
    </RequirePermission>
  ),
});

const STATUS_AR: Record<string, string> = {
  submitted: "تم الإرسال",
  under_review: "تحت المراجعة",
  waiting_patient: "بانتظار المريض",
  resolved: "تم الحل",
  closed: "مغلق",
};
const STATUS_COLOR: Record<string, string> = {
  submitted: "bg-primary/10 text-primary border-primary/30",
  under_review: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  waiting_patient: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  resolved: "bg-green-500/10 text-green-700 border-green-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};
const TYPE_AR: Record<string, string> = {
  complaint: "شكوى",
  suggestion: "اقتراح",
  thanks: "شكر",
  inquiry: "استفسار",
};
const STATUSES = ["submitted", "under_review", "waiting_patient", "resolved", "closed"] as const;
const TYPES = ["complaint", "suggestion", "thanks", "inquiry"] as const;

function ComplaintsAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllComplaints);
  const updateFn = useServerFn(updateComplaint);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["admin", "complaints", statusFilter, typeFilter, search],
    queryFn: () =>
      listFn({
        data: {
          status: statusFilter ? (statusFilter as (typeof STATUSES)[number]) : undefined,
          type: typeFilter ? (typeFilter as (typeof TYPES)[number]) : undefined,
          search: search || undefined,
        },
      }),
  });

  // Realtime — refresh on any complaint change
  useEffect(() => {
    const ch = supabase
      .channel("admin-complaints")
      .on("postgres_changes", { event: "*", schema: "public", table: "complaints" }, () =>
        qc.invalidateQueries({ queryKey: ["admin", "complaints"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const rows = listQuery.data ?? [];
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const updateMut = useMutation({
    mutationFn: (input: {
      id: string;
      status?: (typeof STATUSES)[number];
      internal_notes?: string | null;
    }) => updateFn({ data: input }),
    onSuccess: () => {
      toast.success("تم التحديث");
      qc.invalidateQueries({ queryKey: ["admin", "complaints"] });
    },
    onError: (e: Error) => toast.error(e.message || "تعذّر التحديث"),
  });

  return (
    <div className="container-app py-8">
      <header className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareWarning className="h-6 w-6 text-primary" />
            الشكاوى والمقترحات
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-green-600 animate-pulse" />
            محدّث مباشرةً — {rows.length} بلاغ
          </p>
        </div>
        <button
          onClick={() => listQuery.refetch()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute inset-y-0 right-3 my-auto h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم / الجوال / رقم البلاغ"
            className="w-full rounded-md border border-border bg-background pr-9 pl-3 py-2 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">كل الحالات</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_AR[s]}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">كل الأنواع</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_AR[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {listQuery.isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">لا توجد نتائج.</div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-start p-4 hover:bg-muted/50 transition-colors ${
                    selectedId === r.id ? "bg-muted/60" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.reference}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                          {TYPE_AR[r.type] ?? r.type}
                        </span>
                        {r.department && (
                          <span className="text-xs text-muted-foreground">· {r.department}</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium">{r.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{r.patient_phone}</p>
                      <p className="mt-1 text-sm line-clamp-2 text-muted-foreground">{r.message}</p>
                    </div>
                    <div className="shrink-0 text-end">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full border ${
                          STATUS_COLOR[r.status] ?? ""
                        }`}
                      >
                        {STATUS_AR[r.status] ?? r.status}
                      </span>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("ar-SA")}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-5 sticky top-4 self-start">
          {!selected ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              اختر بلاغاً لعرض التفاصيل وتحديث حالته.
            </p>
          ) : (
            <ComplaintDetail
              key={selected.id}
              row={selected}
              onUpdate={(patch) => updateMut.mutate({ id: selected.id, ...patch })}
              saving={updateMut.isPending}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function ComplaintDetail({
  row,
  onUpdate,
  saving,
}: {
  row: {
    id: string;
    reference: string;
    patient_name: string;
    patient_phone: string;
    patient_email: string | null;
    type: string;
    department: string | null;
    message: string;
    status: string;
    internal_notes: string | null;
    created_at: string;
  };
  onUpdate: (patch: { status?: (typeof STATUSES)[number]; internal_notes?: string | null }) => void;
  saving: boolean;
}) {
  const [notes, setNotes] = useState(row.internal_notes ?? "");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">رقم البلاغ</p>
        <p className="font-mono font-bold">{row.reference}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">الاسم</p>
          <p>{row.patient_name}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الجوال</p>
          <p dir="ltr">{row.patient_phone}</p>
        </div>
        {row.patient_email && (
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">البريد</p>
            <p>{row.patient_email}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground">النوع</p>
          <p>{TYPE_AR[row.type] ?? row.type}</p>
        </div>
        {row.department && (
          <div>
            <p className="text-xs text-muted-foreground">القسم</p>
            <p>{row.department}</p>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">الرسالة</p>
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
          {row.message}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">تغيير الحالة</label>
        <select
          value={row.status}
          disabled={saving}
          onChange={(e) => onUpdate({ status: e.target.value as (typeof STATUSES)[number] })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_AR[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium">ملاحظات داخلية</label>
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="لا تظهر للمريض — للفريق فقط"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => onUpdate({ internal_notes: notes || null })}
          disabled={saving || notes === (row.internal_notes ?? "")}
          className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ الملاحظات"}
        </button>
      </div>
    </div>
  );
}
