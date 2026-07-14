import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import {
  AlertTriangle, ArrowRight, Boxes, Building2, Check, ClipboardList, Loader2,
  Package, PackageMinus, Plus, RefreshCw, Trash2, TrendingDown, X, ShoppingCart,
} from "lucide-react";
import {
  listWarehouseSummary, listLowStockAlerts,
  listPurchaseRequests, createPurchaseRequest, updatePurchaseRequestStatus, deletePurchaseRequest,
  type WarehouseSummary, type LowStockAlert, type PurchaseRequest, type PurchaseRequestStatus, type PurchaseRequestPriority,
} from "@/lib/inventory.functions";
import { listBranches } from "@/lib/dashboard.functions";
import { listInventoryItems, type InventoryItem } from "@/lib/pharmacy.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/inventory-management")({
  head: () => ({
    meta: [
      { title: "المخزون | مجمع باعشن الطبي" },
      { name: "description", content: "قائمة المستودعات، تنبيهات انخفاض الكميات، وطلبات الشراء." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="inventory.manage">
      <InventoryPage />
    </RequirePermission>
  ),
  errorComponent: InvError,
  notFoundComponent: () => null,
});

function InvError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md m-10 rounded-2xl border bg-card p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
      <h2 className="mb-2 font-bold">تعذّر تحميل المخزون</h2>
      <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
      <button onClick={() => { reset(); router.invalidate(); }} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">إعادة المحاولة</button>
    </div>
  );
}

function InventoryPage() {
  const [tab, setTab] = useState<"warehouses" | "alerts" | "requests">("warehouses");
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const branchesQ = useQuery({ queryKey: ["inv-branches"], queryFn: () => listBranches() });

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/command-center" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs hover:bg-accent">
              <ArrowRight className="h-3.5 w-3.5" /> مركز التحكم
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">المخزون</h1>
              <p className="text-sm text-muted-foreground">قائمة المستودعات، تنبيهات، وطلبات شراء.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={branchFilter ?? ""}
              onChange={(e) => setBranchFilter(e.target.value || null)}
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="">كل الفروع</option>
              {(branchesQ.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.name_ar || b.name_en}</option>
              ))}
            </select>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-4">
            <TabsTrigger value="warehouses"><Building2 className="ms-1 h-4 w-4" /> المستودعات</TabsTrigger>
            <TabsTrigger value="alerts"><TrendingDown className="ms-1 h-4 w-4" /> تنبيهات الانخفاض</TabsTrigger>
            <TabsTrigger value="requests"><ShoppingCart className="ms-1 h-4 w-4" /> طلبات الشراء</TabsTrigger>
          </TabsList>
          <TabsContent value="warehouses"><WarehousesTab branchId={branchFilter} /></TabsContent>
          <TabsContent value="alerts"><LowStockTab branchId={branchFilter} /></TabsContent>
          <TabsContent value="requests"><PurchaseRequestsTab branchId={branchFilter} branches={branchesQ.data ?? []} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* -------- Warehouses tab -------- */
function WarehousesTab({ branchId }: { branchId: string | null }) {
  const q = useQuery({
    queryKey: ["inv-warehouses"],
    queryFn: () => listWarehouseSummary(),
    staleTime: 30_000,
  });
  const rows = useMemo(() => {
    const list = q.data ?? [];
    return branchId ? list.filter((r) => r.branch_id === branchId) : list;
  }, [q.data, branchId]);

  if (q.isLoading) return <LoadingPanel />;
  if (rows.length === 0) return <EmptyPanel icon={<Boxes className="h-8 w-8" />} title="لا توجد مستودعات" desc="أضف أصنافاً من وحدة الصيدلية لتظهر هنا." />;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((w) => <WarehouseCard key={w.branch_id ?? "none"} w={w} />)}
    </div>
  );
}

function WarehouseCard({ w }: { w: WarehouseSummary }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold">{w.branch_name}</h3>
            <p className="text-xs text-muted-foreground">{w.items_count} صنف نشط</p>
          </div>
        </div>
        <div className="text-left">
          <div className="text-xs text-muted-foreground">قيمة تقديرية</div>
          <div className="font-bold">{w.total_value.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="نافد" value={w.out_count} tone="destructive" />
        <Stat label="منخفض" value={w.low_count} tone="warning" />
        <Stat label="قريب الانتهاء" value={w.expiring_count} tone="warning" />
        <Stat label="منتهي" value={w.expired_count} tone="destructive" />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "destructive" | "warning" | "default" }) {
  const cls = tone === "destructive"
    ? "bg-destructive/10 text-destructive"
    : tone === "warning"
    ? "bg-amber-500/10 text-amber-700"
    : "bg-muted";
  return (
    <div className={`rounded-lg px-3 py-2 ${cls}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

/* -------- Low stock tab -------- */
function LowStockTab({ branchId }: { branchId: string | null }) {
  const q = useQuery({
    queryKey: ["inv-lowstock", branchId],
    queryFn: () => listLowStockAlerts({ data: { branchId: branchId ?? null } }),
    staleTime: 30_000,
  });

  if (q.isLoading) return <LoadingPanel />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <EmptyPanel icon={<Check className="h-8 w-8" />} title="لا توجد تنبيهات" desc="جميع الكميات ضمن الحدود المسموحة." />;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3 text-start">الصنف</th>
            <th className="p-3 text-start">الفرع</th>
            <th className="p-3">الكمية</th>
            <th className="p-3">الحد الأدنى</th>
            <th className="p-3">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-3 font-medium">{r.name_ar}</td>
              <td className="p-3 text-muted-foreground">{r.branch_name ?? "—"}</td>
              <td className="p-3 text-center font-bold">{r.quantity} {r.unit ?? ""}</td>
              <td className="p-3 text-center text-muted-foreground">{r.min_stock}</td>
              <td className="p-3 text-center">
                {r.status === "out"
                  ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">نافد</span>
                  : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700">منخفض</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------- Purchase requests tab -------- */
function PurchaseRequestsTab({ branchId, branches }: { branchId: string | null; branches: Array<{ id: string; name_ar: string; name_en: string | null }> }) {
  const [statusFilter, setStatusFilter] = useState<PurchaseRequestStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["inv-purchase-requests", branchId, statusFilter],
    queryFn: () => listPurchaseRequests({ data: { branchId: branchId ?? null, status: statusFilter } }),
    staleTime: 20_000,
  });

  const updateFn = useServerFn(updatePurchaseRequestStatus);
  const deleteFn = useServerFn(deletePurchaseRequest);

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; status: PurchaseRequestStatus; notes?: string | null }) =>
      updateFn({ data: { id: vars.id, status: vars.status, review_notes: vars.notes ?? null } }),
    onSuccess: (_r, v) => {
      toast.success(v.status === "approved" ? "تمت الموافقة" : v.status === "rejected" ? "تم الرفض" : v.status === "received" ? "تم الاستلام" : "تم التحديث");
      qc.invalidateQueries({ queryKey: ["inv-purchase-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["inv-purchase-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border p-1">
          {(["all", "pending", "approved", "received", "rejected", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${statusFilter === s ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              {STATUS_AR[s]}
            </button>
          ))}
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> طلب شراء جديد
        </button>
      </div>

      {q.isLoading ? <LoadingPanel /> : (q.data ?? []).length === 0 ? (
        <EmptyPanel icon={<ShoppingCart className="h-8 w-8" />} title="لا توجد طلبات" desc="ابدأ بإنشاء طلب شراء جديد." />
      ) : (
        <div className="grid gap-3">
          {(q.data ?? []).map((r) => (
            <PurchaseCard key={r.id} r={r}
              onUpdate={(status, notes) => updateMut.mutate({ id: r.id, status, notes })}
              onDelete={() => { if (confirm("حذف الطلب؟")) deleteMut.mutate(r.id); }}
              pending={updateMut.isPending}
            />
          ))}
        </div>
      )}

      <NewRequestDialog open={open} onOpenChange={setOpen} branches={branches} defaultBranchId={branchId} />
    </div>
  );
}

const STATUS_AR: Record<PurchaseRequestStatus | "all", string> = {
  all: "الكل", pending: "قيد المراجعة", approved: "معتمد",
  received: "مستلم", rejected: "مرفوض", cancelled: "ملغى",
};
const PRIORITY_AR: Record<PurchaseRequestPriority, string> = {
  low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة",
};
const PRIORITY_CLASS: Record<PurchaseRequestPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-teal-500/15 text-teal-700",
  high: "bg-amber-500/15 text-amber-700",
  urgent: "bg-destructive/15 text-destructive",
};
const STATUS_CLASS: Record<PurchaseRequestStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  approved: "bg-emerald-500/15 text-emerald-700",
  received: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function PurchaseCard({ r, onUpdate, onDelete, pending }: {
  r: PurchaseRequest;
  onUpdate: (status: PurchaseRequestStatus, notes?: string | null) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm font-bold">{r.request_no ?? r.id.slice(0, 8)}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[r.status]}`}>{STATUS_AR[r.status]}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_CLASS[r.priority]}`}>{PRIORITY_AR[r.priority]}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {r.branch_name ?? "بدون فرع"} · {formatDistanceToNow(new Date(r.created_at), { locale: arLocale, addSuffix: true })}
        </div>
      </div>

      <div className="mb-3 overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr><th className="p-2 text-start">الصنف</th><th className="p-2">الكمية</th><th className="p-2">السعر التقديري</th></tr>
          </thead>
          <tbody>
            {r.items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="p-2">{it.name_ar}{it.notes ? <span className="ms-2 text-xs text-muted-foreground">— {it.notes}</span> : null}</td>
                <td className="p-2 text-center">{it.quantity} {it.unit ?? ""}</td>
                <td className="p-2 text-center">{it.estimated_price != null ? `${it.estimated_price} ر.س` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.notes && <p className="mb-3 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">ملاحظات: {r.notes}</p>}
      {r.review_notes && <p className="mb-3 rounded-lg bg-muted/40 p-2 text-xs">مراجعة: {r.review_notes}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {r.status === "pending" && (
          <>
            <ActionBtn onClick={() => onUpdate("approved")} disabled={pending} tone="success"><Check className="h-3.5 w-3.5" /> اعتماد</ActionBtn>
            <ActionBtn onClick={() => onUpdate("rejected", prompt("سبب الرفض؟") ?? undefined)} disabled={pending} tone="danger"><X className="h-3.5 w-3.5" /> رفض</ActionBtn>
          </>
        )}
        {r.status === "approved" && (
          <ActionBtn onClick={() => onUpdate("received")} disabled={pending} tone="success"><PackageMinus className="h-3.5 w-3.5" /> تأكيد الاستلام</ActionBtn>
        )}
        {(r.status === "pending" || r.status === "approved") && (
          <ActionBtn onClick={() => onUpdate("cancelled")} disabled={pending} tone="muted">إلغاء</ActionBtn>
        )}
        <button onClick={onDelete} className="ms-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" /> حذف
        </button>
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, disabled, tone }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  tone: "success" | "danger" | "muted";
}) {
  const cls = tone === "success" ? "bg-emerald-500 text-white hover:bg-emerald-600"
    : tone === "danger" ? "bg-destructive text-destructive-foreground hover:opacity-90"
    : "border hover:bg-accent";
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

/* -------- New request dialog -------- */
type LineDraft = {
  key: string; item_id: string | null; name_ar: string;
  quantity: number; unit: string; estimated_price: string; notes: string;
};

function newLine(): LineDraft {
  return { key: crypto.randomUUID(), item_id: null, name_ar: "", quantity: 1, unit: "", estimated_price: "", notes: "" };
}

function NewRequestDialog({ open, onOpenChange, branches, defaultBranchId }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  branches: Array<{ id: string; name_ar: string; name_en: string | null }>;
  defaultBranchId: string | null;
}) {
  const [branchId, setBranchId] = useState<string | null>(defaultBranchId);
  const [priority, setPriority] = useState<PurchaseRequestPriority>("normal");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  const itemsQ = useQuery({
    queryKey: ["inv-items-for-pr", branchId],
    queryFn: () => listInventoryItems({ data: { branchId: branchId ?? null } }),
    enabled: open,
  });

  const qc = useQueryClient();
  const createFn = useServerFn(createPurchaseRequest);
  const createMut = useMutation({
    mutationFn: () => createFn({
      data: {
        branch_id: branchId,
        priority,
        notes: notes || null,
        items: lines
          .filter((l) => l.name_ar.trim().length > 0 && l.quantity > 0)
          .map((l) => ({
            item_id: l.item_id,
            name_ar: l.name_ar.trim(),
            quantity: Math.max(1, Math.floor(l.quantity)),
            unit: l.unit || null,
            estimated_price: l.estimated_price ? Number(l.estimated_price) : null,
            notes: l.notes || null,
          })),
      },
    }),
    onSuccess: () => {
      toast.success("تم إنشاء الطلب");
      qc.invalidateQueries({ queryKey: ["inv-purchase-requests"] });
      onOpenChange(false);
      setLines([newLine()]); setNotes(""); setPriority("normal");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickItem = (key: string, itemId: string) => {
    const it = (itemsQ.data ?? []).find((x: InventoryItem) => x.id === itemId);
    if (!it) return;
    updateLine(key, { item_id: it.id, name_ar: it.name_ar, unit: it.unit ?? "", estimated_price: it.price != null ? String(it.price) : "" });
  };

  const canSubmit = lines.some((l) => l.name_ar.trim().length > 0 && l.quantity > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader><DialogTitle>طلب شراء جديد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">الفرع</span>
              <select value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value || null)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="">بدون فرع</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name_en}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">الأولوية</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as PurchaseRequestPriority)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                {(Object.keys(PRIORITY_AR) as PurchaseRequestPriority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_AR[p]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">الأصناف</span>
              <button onClick={() => setLines((p) => [...p, newLine()])}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-accent">
                <Plus className="h-3 w-3" /> إضافة صنف
              </button>
            </div>
            {lines.map((l) => (
              <div key={l.key} className="grid gap-2 rounded-lg border p-2 md:grid-cols-[1.5fr,1fr,0.6fr,0.8fr,auto]">
                <div className="space-y-1">
                  <select value={l.item_id ?? ""} onChange={(e) => e.target.value ? pickItem(l.key, e.target.value) : updateLine(l.key, { item_id: null })}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-xs">
                    <option value="">— من المخزون —</option>
                    {(itemsQ.data ?? []).map((it: InventoryItem) => (
                      <option key={it.id} value={it.id}>{it.name_ar} ({it.quantity})</option>
                    ))}
                  </select>
                  <input value={l.name_ar} onChange={(e) => updateLine(l.key, { name_ar: e.target.value, item_id: null })}
                    placeholder="أو اكتب اسم الصنف" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
                </div>
                <input value={l.notes} onChange={(e) => updateLine(l.key, { notes: e.target.value })}
                  placeholder="ملاحظات" className="rounded-md border bg-background px-2 py-1.5 text-sm" />
                <input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) })}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm" />
                <input value={l.estimated_price} onChange={(e) => updateLine(l.key, { estimated_price: e.target.value })}
                  placeholder="سعر تقديري" className="rounded-md border bg-background px-2 py-1.5 text-sm" />
                <button onClick={() => setLines((p) => p.length > 1 ? p.filter((x) => x.key !== l.key) : p)}
                  className="rounded-md p-2 text-destructive hover:bg-destructive/10" aria-label="حذف السطر">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">ملاحظات الطلب</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </label>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="rounded-full border px-4 py-2 text-sm hover:bg-accent">إلغاء</button>
          <button onClick={() => createMut.mutate()} disabled={!canSubmit || createMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} إنشاء الطلب
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------- shared -------- */
function LoadingPanel() {
  return <div className="grid place-items-center rounded-2xl border bg-card p-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
}
function EmptyPanel({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border bg-card p-10 text-center">
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <h3 className="mb-1 font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
