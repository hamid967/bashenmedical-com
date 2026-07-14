import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  ClipboardCheck,
  Loader2,
  MinusCircle,
  Package,
  Pencil,
  Pill,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  listInventoryItems,
  upsertInventoryItem,
  deleteInventoryItem,
  listStockMovements,
  createStockMovement,
  listPharmacyPrescriptions,
  reviewPrescription,
  type InventoryItem,
  type StockMovement,
  type MovementType,
  type PharmacyPrescription,
  type PharmacyStatus,
} from "@/lib/pharmacy.functions";
import { listBranches } from "@/lib/dashboard.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/pharmacy-management")({
  head: () => ({
    meta: [
      { title: "الصيدلية | مجمع باعشن الطبي" },
      { name: "description", content: "المخزون، حركة الأصناف، تنبيه انتهاء الصلاحية، ومراجعة الوصفات." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="pharmacy.view">
      <PharmacyPage />
    </RequirePermission>
  ),
  errorComponent: PharmacyError,
  notFoundComponent: () => null,
});

function PharmacyError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md m-10 rounded-2xl border bg-card p-8 text-center">
      <h3 className="text-lg font-bold">تعذّر تحميل وحدة الصيدلية</h3>
      <p className="mt-2 text-sm text-muted-foreground break-words">{error.message}</p>
      <button
        onClick={() => { router.invalidate(); reset(); }}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  );
}

type TabValue = "inventory" | "movements" | "rx";

function PharmacyPage() {
  const [tab, setTab] = useState<TabValue>("inventory");
  const [branchId, setBranchId] = useState<string>("");
  const branchesFn = useServerFn(listBranches);
  const branchesQ = useQuery({ queryKey: ["pharmacy", "branches"], queryFn: () => branchesFn() });

  return (
    <div dir="rtl" className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600">
              <Pill className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">وحدة الصيدلية</h1>
              <p className="text-xs text-muted-foreground">المخزون، حركات الأصناف، ومراجعة الوصفات</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">كل الفروع</option>
              {branchesQ.data?.map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
            </select>
            <Link
              to="/command-center"
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              <ArrowRight className="h-4 w-4" /> لوحة التحكم
            </Link>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList className="grid grid-cols-3 w-full max-w-2xl">
            <TabsTrigger value="inventory"><Boxes className="h-4 w-4 ml-1" /> المخزون</TabsTrigger>
            <TabsTrigger value="movements"><Package className="h-4 w-4 ml-1" /> الحركة</TabsTrigger>
            <TabsTrigger value="rx"><ClipboardCheck className="h-4 w-4 ml-1" /> الوصفات</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="mt-6">
            <InventoryPanel branchId={branchId || null} />
          </TabsContent>
          <TabsContent value="movements" className="mt-6">
            <MovementsPanel branchId={branchId || null} />
          </TabsContent>
          <TabsContent value="rx" className="mt-6">
            <RxPanel branchId={branchId || null} />
          </TabsContent>
        </Tabs>
      </div>
      <style>{`.pinput{width:100%;border:1px solid hsl(var(--input));background:hsl(var(--background));border-radius:6px;padding:6px 10px;font-size:14px}`}</style>
    </div>
  );
}

/* ============================================================
   Inventory Panel
   ============================================================ */

function InventoryPanel({ branchId }: { branchId: string | null }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "expired" | "expiring" | "low" | "out">("all");
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<InventoryItem> | null>(null);

  const listFn = useServerFn(listInventoryItems);
  const upsertFn = useServerFn(upsertInventoryItem);
  const deleteFn = useServerFn(deleteInventoryItem);
  const branchesFn = useServerFn(listBranches);

  const itemsQ = useQuery({
    queryKey: ["pharmacy", "inv", branchId, filter, search],
    queryFn: () => listFn({ data: { branchId, filter, search: search || null } }),
  });
  const branchesQ = useQuery({ queryKey: ["pharmacy", "branches"], queryFn: () => branchesFn() });

  const save = useMutation({
    mutationFn: (v: Partial<InventoryItem>) => upsertFn({ data: v as never }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pharmacy", "inv"] }); setEditOpen(false); toast.success("تم الحفظ"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pharmacy", "inv"] }); toast.success("تم إخفاء الصنف"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = useMemo(() => {
    const rows = itemsQ.data ?? [];
    return {
      expired: rows.filter((r) => r.expiry_status === "expired").length,
      expiring: rows.filter((r) => r.expiry_status === "expiring").length,
      low: rows.filter((r) => r.stock_status === "low").length,
      out: rows.filter((r) => r.stock_status === "out").length,
    };
  }, [itemsQ.data]);

  const branchName = (id: string | null) =>
    id ? branchesQ.data?.find((b) => b.id === id)?.name_ar ?? "—" : "—";

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={AlertTriangle} label="منتهي الصلاحية" value={counts.expired} color="rose" />
        <SummaryCard icon={AlertTriangle} label="قريب الانتهاء (30 يوم)" value={counts.expiring} color="amber" />
        <SummaryCard icon={MinusCircle} label="مخزون منخفض" value={counts.low} color="orange" />
        <SummaryCard icon={X} label="نافد" value={counts.out} color="red" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث عن صنف…"
              className="w-full rounded-md border border-input bg-background pr-8 pl-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1 text-xs">
            {([
              { v: "all", l: "الكل" },
              { v: "expired", l: "منتهي" },
              { v: "expiring", l: "قريب" },
              { v: "low", l: "منخفض" },
              { v: "out", l: "نافد" },
            ] as const).map((f) => (
              <button
                key={f.v}
                onClick={() => setFilter(f.v)}
                className={`rounded px-2 py-1 ${filter === f.v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >{f.l}</button>
            ))}
          </div>
        </div>
        <button
          onClick={() => { setEditing({ quantity: 0, min_stock: 0 }); setEditOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> صنف جديد
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-right text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">الاسم</th>
              <th className="px-3 py-2 font-medium">الرمز</th>
              <th className="px-3 py-2 font-medium">الشكل</th>
              <th className="px-3 py-2 font-medium">الفرع</th>
              <th className="px-3 py-2 font-medium">الكمية</th>
              <th className="px-3 py-2 font-medium">الحد الأدنى</th>
              <th className="px-3 py-2 font-medium">تاريخ الانتهاء</th>
              <th className="px-3 py-2 font-medium">الحالة</th>
              <th className="px-3 py-2 font-medium w-24">—</th>
            </tr>
          </thead>
          <tbody>
            {itemsQ.data?.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="px-3 py-2 font-medium">{it.name_ar}</td>
                <td className="px-3 py-2 ltr text-xs">{it.sku ?? it.barcode ?? "—"}</td>
                <td className="px-3 py-2">{it.form ?? "—"}</td>
                <td className="px-3 py-2">{branchName(it.branch_id)}</td>
                <td className="px-3 py-2 font-mono">{it.quantity}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{it.min_stock}</td>
                <td className="px-3 py-2 ltr text-xs">{it.expiry_date ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <ExpiryBadge s={it.expiry_status} />
                    <StockBadge s={it.stock_status} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditing(it); setEditOpen(true); }} className="rounded p-1.5 hover:bg-muted" aria-label="تعديل">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`إخفاء الصنف "${it.name_ar}"؟`)) del.mutate(it.id); }}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      aria-label="حذف"
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!itemsQ.isLoading && (itemsQ.data?.length ?? 0) === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">لا توجد أصناف ضمن هذا الفلتر</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <InventoryDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        value={editing}
        branches={branchesQ.data ?? []}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "rose" | "amber" | "orange" | "red";
}) {
  const map = {
    rose: "bg-rose-500/10 text-rose-700 border-rose-500/30",
    amber: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    orange: "bg-orange-500/10 text-orange-700 border-orange-500/30",
    red: "bg-red-500/10 text-red-700 border-red-500/30",
  } as const;
  return (
    <div className={`rounded-xl border-2 p-3 ${map[color]}`}>
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 opacity-70" />
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <div className="mt-1 text-xs">{label}</div>
    </div>
  );
}

function ExpiryBadge({ s }: { s: InventoryItem["expiry_status"] }) {
  if (s === "none") return null;
  const map = {
    expired: { l: "منتهي", c: "bg-rose-500/15 text-rose-700" },
    expiring: { l: "قريب الانتهاء", c: "bg-amber-500/15 text-amber-700" },
    ok: { l: "سارٍ", c: "bg-emerald-500/15 text-emerald-700" },
  } as const;
  const m = map[s];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${m.c}`}>{m.l}</span>;
}
function StockBadge({ s }: { s: InventoryItem["stock_status"] }) {
  const map = {
    out: { l: "نافد", c: "bg-red-500/15 text-red-700" },
    low: { l: "منخفض", c: "bg-orange-500/15 text-orange-700" },
    ok: { l: "متوفر", c: "bg-emerald-500/15 text-emerald-700" },
  } as const;
  const m = map[s];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${m.c}`}>{m.l}</span>;
}

function InventoryDialog({
  open, onOpenChange, value, branches, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: Partial<InventoryItem> | null;
  branches: Array<{ id: string; name_ar: string }>;
  onSave: (v: Partial<InventoryItem>) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<Partial<InventoryItem>>(value ?? {});
  useMemo(() => { setF(value ?? {}); }, [value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>{f.id ? "تعديل صنف" : "صنف جديد"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <PField label="الاسم بالعربي *" className="col-span-2">
            <input className="pinput" value={f.name_ar ?? ""} onChange={(e) => setF({ ...f, name_ar: e.target.value })} />
          </PField>
          <PField label="الاسم بالإنجليزي">
            <input className="pinput" value={f.name_en ?? ""} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
          </PField>
          <PField label="الفرع">
            <select className="pinput" value={f.branch_id ?? ""} onChange={(e) => setF({ ...f, branch_id: e.target.value || null })}>
              <option value="">—</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
            </select>
          </PField>
          <PField label="الرمز (SKU)">
            <input className="pinput" value={f.sku ?? ""} onChange={(e) => setF({ ...f, sku: e.target.value })} />
          </PField>
          <PField label="الباركود">
            <input className="pinput ltr" value={f.barcode ?? ""} onChange={(e) => setF({ ...f, barcode: e.target.value })} />
          </PField>
          <PField label="الشكل">
            <input className="pinput" value={f.form ?? ""} placeholder="حبوب، شراب…" onChange={(e) => setF({ ...f, form: e.target.value })} />
          </PField>
          <PField label="الوحدة">
            <input className="pinput" value={f.unit ?? ""} placeholder="علبة، عبوة…" onChange={(e) => setF({ ...f, unit: e.target.value })} />
          </PField>
          <PField label="الكمية">
            <input type="number" min={0} className="pinput" value={f.quantity ?? 0} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} />
          </PField>
          <PField label="الحد الأدنى">
            <input type="number" min={0} className="pinput" value={f.min_stock ?? 0} onChange={(e) => setF({ ...f, min_stock: Number(e.target.value) })} />
          </PField>
          <PField label="تاريخ الانتهاء">
            <input type="date" className="pinput" value={f.expiry_date ?? ""} onChange={(e) => setF({ ...f, expiry_date: e.target.value || null })} />
          </PField>
          <PField label="السعر">
            <input type="number" min={0} step="0.01" className="pinput" value={f.price ?? ""} onChange={(e) => setF({ ...f, price: e.target.value ? Number(e.target.value) : null })} />
          </PField>
          <PField label="ملاحظات" className="col-span-2">
            <textarea className="pinput min-h-14" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </PField>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="rounded-md border px-3 py-1.5 text-sm">إلغاء</button>
          <button
            disabled={saving || !f.name_ar}
            onClick={() => onSave(f)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} حفظ
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/* ============================================================
   Movements Panel
   ============================================================ */

const MOVE_TYPES: Record<MovementType, { label: string; cls: string }> = {
  in: { label: "استلام", cls: "bg-emerald-500/15 text-emerald-700" },
  out: { label: "صرف", cls: "bg-teal-500/15 text-teal-700" },
  adjust: { label: "تعديل", cls: "bg-slate-500/15 text-slate-700" },
  waste: { label: "إتلاف", cls: "bg-rose-500/15 text-rose-700" },
  transfer: { label: "تحويل", cls: "bg-teal-500/15 text-teal-700" },
};

function MovementsPanel({ branchId }: { branchId: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listStockMovements);
  const createFn = useServerFn(createStockMovement);
  const invFn = useServerFn(listInventoryItems);

  const movesQ = useQuery({
    queryKey: ["pharmacy", "moves", branchId],
    queryFn: () => listFn({ data: { branchId } }),
  });
  const invQ = useQuery({
    queryKey: ["pharmacy", "inv", branchId, "all", ""],
    queryFn: () => invFn({ data: { branchId, filter: "all" } }),
  });

  const [newOpen, setNewOpen] = useState(false);
  const create = useMutation({
    mutationFn: (v: { item_id: string; branch_id: string | null; movement_type: MovementType; quantity: number; reason?: string | null; reference?: string | null }) => createFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pharmacy", "moves"] });
      qc.invalidateQueries({ queryKey: ["pharmacy", "inv"] });
      setNewOpen(false);
      toast.success("تم تسجيل الحركة");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const itemName = (id: string) => invQ.data?.find((i) => i.id === id)?.name_ar ?? id.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {movesQ.isLoading ? "…" : `${movesQ.data?.length ?? 0} حركة`}
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          <PlusCircle className="h-4 w-4" /> حركة جديدة
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-right text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">التاريخ</th>
              <th className="px-3 py-2 font-medium">الصنف</th>
              <th className="px-3 py-2 font-medium">النوع</th>
              <th className="px-3 py-2 font-medium">الكمية</th>
              <th className="px-3 py-2 font-medium">المرجع</th>
              <th className="px-3 py-2 font-medium">السبب</th>
            </tr>
          </thead>
          <tbody>
            {movesQ.data?.map((m: StockMovement) => (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: arLocale })}
                </td>
                <td className="px-3 py-2">{itemName(m.item_id)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${MOVE_TYPES[m.movement_type].cls}`}>
                    {MOVE_TYPES[m.movement_type].label}
                  </span>
                </td>
                <td className={`px-3 py-2 font-mono ltr ${m.quantity_delta < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                </td>
                <td className="px-3 py-2 ltr text-xs">{m.reference ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{m.reason ?? "—"}</td>
              </tr>
            ))}
            {!movesQ.isLoading && (movesQ.data?.length ?? 0) === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">لا توجد حركات</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <MovementDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        items={invQ.data ?? []}
        branchId={branchId}
        onSave={(v) => create.mutate(v)}
        saving={create.isPending}
      />
    </div>
  );
}

function MovementDialog({
  open, onOpenChange, items, branchId, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: InventoryItem[];
  branchId: string | null;
  onSave: (v: { item_id: string; branch_id: string | null; movement_type: MovementType; quantity: number; reason?: string | null; reference?: string | null }) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<{ item_id: string; movement_type: MovementType; quantity: number; reason: string; reference: string }>({
    item_id: "", movement_type: "in", quantity: 1, reason: "", reference: "",
  });
  useMemo(() => { if (open) setF({ item_id: "", movement_type: "in", quantity: 1, reason: "", reference: "" }); }, [open]);

  const sel = items.find((i) => i.id === f.item_id);
  const branch = sel?.branch_id ?? branchId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>حركة مخزون جديدة</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <PField label="الصنف *" className="col-span-2">
            <select className="pinput" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}>
              <option value="">—</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name_ar} — كمية حالية: {i.quantity}</option>)}
            </select>
          </PField>
          <PField label="النوع *">
            <select className="pinput" value={f.movement_type} onChange={(e) => setF({ ...f, movement_type: e.target.value as MovementType })}>
              {(Object.keys(MOVE_TYPES) as MovementType[]).map((t) => (
                <option key={t} value={t}>{MOVE_TYPES[t].label}</option>
              ))}
            </select>
          </PField>
          <PField label="الكمية *">
            <input type="number" min={1} className="pinput" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} />
          </PField>
          <PField label="مرجع (رقم فاتورة/وصفة)" className="col-span-2">
            <input className="pinput" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
          </PField>
          <PField label="السبب" className="col-span-2">
            <textarea className="pinput min-h-14" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </PField>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="rounded-md border px-3 py-1.5 text-sm">إلغاء</button>
          <button
            disabled={saving || !f.item_id || f.quantity < 1}
            onClick={() => onSave({ item_id: f.item_id, branch_id: branch ?? null, movement_type: f.movement_type, quantity: f.quantity, reason: f.reason || null, reference: f.reference || null })}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} تسجيل
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Prescriptions Panel
   ============================================================ */

const RX_STATUS: Record<PharmacyStatus, { label: string; cls: string }> = {
  pending: { label: "بانتظار المراجعة", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  approved: { label: "معتمدة", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  rejected: { label: "مرفوضة", cls: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
  needs_info: { label: "تحتاج توضيح", cls: "bg-teal-500/15 text-teal-700 border-teal-500/30" },
};

function RxPanel({ branchId }: { branchId: string | null }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<PharmacyStatus | "all">("pending");
  const listFn = useServerFn(listPharmacyPrescriptions);
  const reviewFn = useServerFn(reviewPrescription);
  const invFn = useServerFn(listInventoryItems);

  const rxQ = useQuery({
    queryKey: ["pharmacy", "rx", branchId, status],
    queryFn: () => listFn({ data: { branchId, status } }),
    refetchInterval: status === "pending" ? 20000 : false,
  });
  const invQ = useQuery({
    queryKey: ["pharmacy", "inv", branchId, "all", ""],
    queryFn: () => invFn({ data: { branchId, filter: "all" } }),
  });

  const review = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" | "needs_info"; notes?: string | null; item_id?: string | null; quantity?: number | null }) => reviewFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pharmacy", "rx"] });
      qc.invalidateQueries({ queryKey: ["pharmacy", "inv"] });
      qc.invalidateQueries({ queryKey: ["pharmacy", "moves"] });
      toast.success("تم تحديث الحالة");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1 text-xs">
          {(["pending", "needs_info", "approved", "rejected", "all"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setStatus(v)}
              className={`rounded px-2 py-1 ${status === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >{v === "all" ? "الكل" : RX_STATUS[v].label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {rxQ.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status === "pending" && <span>تحديث كل 20ث</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rxQ.data?.map((rx: PharmacyPrescription) => (
          <RxCard key={rx.id} rx={rx} items={invQ.data ?? []} onDecide={(v) => review.mutate(v)} />
        ))}
        {!rxQ.isLoading && (rxQ.data?.length ?? 0) === 0 && (
          <div className="lg:col-span-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            لا توجد وصفات في هذا الفلتر.
          </div>
        )}
      </div>
    </div>
  );
}

function RxCard({
  rx, items, onDecide,
}: {
  rx: PharmacyPrescription;
  items: InventoryItem[];
  onDecide: (v: { id: string; decision: "approved" | "rejected" | "needs_info"; notes?: string | null; item_id?: string | null; quantity?: number | null }) => void;
}) {
  const meta = RX_STATUS[rx.pharmacy_status];
  const [notes, setNotes] = useState("");
  const [itemId, setItemId] = useState<string>(rx.item_id ?? "");
  const [qty, setQty] = useState<number>(rx.dispense_qty ?? 1);
  const isPending = rx.pharmacy_status === "pending" || rx.pharmacy_status === "needs_info";

  return (
    <div className={`rounded-xl border-2 bg-card p-4 ${meta.cls}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-semibold">{rx.medication}</div>
          <div className="text-xs text-muted-foreground">
            {rx.patient_name ?? "—"} • د. {rx.doctor_name ?? "—"}
          </div>
        </div>
        <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
      </div>
      {rx.dosage && <div className="text-xs mb-1"><b>الجرعة:</b> {rx.dosage}</div>}
      {rx.instructions && <div className="text-xs text-muted-foreground line-clamp-2">{rx.instructions}</div>}
      <div className="mt-2 text-[11px] text-muted-foreground">
        منذ {formatDistanceToNow(new Date(rx.created_at), { locale: arLocale })}
        {rx.reviewed_at ? ` • روجعت ${formatDistanceToNow(new Date(rx.reviewed_at), { addSuffix: true, locale: arLocale })}` : ""}
      </div>
      {rx.review_notes && (
        <div className="mt-2 rounded bg-muted p-2 text-xs">
          <b>ملاحظة الصيدلي:</b> {rx.review_notes}
        </div>
      )}

      {isPending && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="grid grid-cols-2 gap-2">
            <select className="pinput text-xs" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">— ربط بمخزون —</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name_ar}</option>)}
            </select>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="pinput text-xs"
              placeholder="الكمية"
            />
          </div>
          <input
            className="pinput text-xs"
            placeholder="ملاحظة (اختياري)…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onDecide({ id: rx.id, decision: "approved", notes: notes || null, item_id: itemId || null, quantity: itemId ? qty : null })}
              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:opacity-90"
            ><Check className="h-3.5 w-3.5" /> موافقة{itemId ? " + خصم" : ""}</button>
            <button
              onClick={() => onDecide({ id: rx.id, decision: "needs_info", notes: notes || null })}
              className="inline-flex items-center gap-1 rounded border border-teal-500 px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-50"
            >طلب توضيح</button>
            <button
              onClick={() => {
                if (!notes) { toast.error("اكتب سبب الرفض في حقل الملاحظة"); return; }
                onDecide({ id: rx.id, decision: "rejected", notes });
              }}
              className="inline-flex items-center gap-1 rounded border border-destructive px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            ><X className="h-3.5 w-3.5" /> رفض</button>
          </div>
        </div>
      )}
    </div>
  );
}
