import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  listNurses,
  upsertNurse,
  deleteNurse,
  listShifts,
  upsertShift,
  deleteShift,
  listCalls,
  createCall,
  updateCallStatus,
  type Nurse,
  type NurseShift,
  type NurseCall,
  type ShiftType,
  type CallPriority,
  type CallStatus,
} from "@/lib/nurses.functions";
import { listBranches } from "@/lib/dashboard.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/nurses")({
  head: () => ({
    meta: [
      { title: "التمريض | مجمع باعشن الطبي" },
      {
        name: "description",
        content: "إدارة طاقم التمريض وجداول الورديات وطابور استدعاءات المرضى.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="nurses.manage">
      <NursesPage />
    </RequirePermission>
  ),
  errorComponent: NursesError,
  notFoundComponent: () => null,
});

function NursesError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md m-10 rounded-2xl border bg-card p-8 text-center">
      <h3 className="text-lg font-bold">تعذّر تحميل وحدة التمريض</h3>
      <p className="mt-2 text-sm text-muted-foreground break-words">{error.message}</p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  );
}

type TabValue = "staff" | "shifts" | "calls";

function NursesPage() {
  const [tab, setTab] = useState<TabValue>("calls");
  const [branchId, setBranchId] = useState<string>("");

  const branchesFn = useServerFn(listBranches);
  const branchesQ = useQuery({ queryKey: ["nurses", "branches"], queryFn: () => branchesFn() });

  return (
    <div dir="rtl" className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-rose-500/10 p-2 text-rose-600">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">وحدة التمريض</h1>
              <p className="text-xs text-muted-foreground">الطاقم، الورديات، واستدعاءات المرضى</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">كل الفروع</option>
              {branchesQ.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              <ArrowRight className="h-4 w-4" /> لوحة التحكم
            </Link>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList className="grid grid-cols-3 w-full max-w-xl">
            <TabsTrigger value="calls">
              <BellRing className="h-4 w-4 ml-1" /> الاستدعاءات
            </TabsTrigger>
            <TabsTrigger value="shifts">
              <CalendarDays className="h-4 w-4 ml-1" /> الورديات
            </TabsTrigger>
            <TabsTrigger value="staff">
              <UserRound className="h-4 w-4 ml-1" /> الطاقم
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calls" className="mt-6">
            <CallsPanel branchId={branchId || null} />
          </TabsContent>
          <TabsContent value="shifts" className="mt-6">
            <ShiftsPanel branchId={branchId || null} />
          </TabsContent>
          <TabsContent value="staff" className="mt-6">
            <StaffPanel branchId={branchId || null} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ============================================================
   Staff panel
   ============================================================ */

function StaffPanel({ branchId }: { branchId: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listNurses);
  const branchesFn = useServerFn(listBranches);
  const upsertFn = useServerFn(upsertNurse);
  const deleteFn = useServerFn(deleteNurse);

  const nursesQ = useQuery({
    queryKey: ["nurses", "list", branchId],
    queryFn: () => listFn({ data: { branchId } }),
  });
  const branchesQ = useQuery({ queryKey: ["nurses", "branches"], queryFn: () => branchesFn() });

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Nurse> | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nurses", "list"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: (data: Partial<Nurse>) => upsertFn({ data: data as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nurses", "list"] });
      setEditOpen(false);
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const branchName = (id: string | null) =>
    id ? (branchesQ.data?.find((b) => b.id === id)?.name_ar ?? "—") : "—";

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="text-sm text-muted-foreground">
          {nursesQ.isLoading ? "جارٍ التحميل…" : `عدد الممرضين: ${nursesQ.data?.length ?? 0}`}
        </div>
        <button
          onClick={() => {
            setEditing({ status: "active" });
            setEditOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> إضافة
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">الاسم</th>
              <th className="px-3 py-2 font-medium">القسم</th>
              <th className="px-3 py-2 font-medium">الفرع</th>
              <th className="px-3 py-2 font-medium">الجوال</th>
              <th className="px-3 py-2 font-medium">الرقم الوظيفي</th>
              <th className="px-3 py-2 font-medium">الحالة</th>
              <th className="px-3 py-2 font-medium w-24">—</th>
            </tr>
          </thead>
          <tbody>
            {nursesQ.data?.map((n) => (
              <tr key={n.id} className="border-t">
                <td className="px-3 py-2 font-medium">{n.full_name}</td>
                <td className="px-3 py-2">{n.department ?? "—"}</td>
                <td className="px-3 py-2">{branchName(n.branch_id)}</td>
                <td className="px-3 py-2 ltr">{n.phone ?? "—"}</td>
                <td className="px-3 py-2">{n.employee_no ?? "—"}</td>
                <td className="px-3 py-2">
                  <NurseStatusBadge status={n.status} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditing(n);
                        setEditOpen(true);
                      }}
                      className="rounded p-1.5 hover:bg-muted"
                      aria-label="تعديل"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`حذف الممرض/ة "${n.full_name}"؟`)) del.mutate(n.id);
                      }}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      aria-label="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!nursesQ.isLoading && (nursesQ.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  لا يوجد ممرضون
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <NurseEditDialog
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

function NurseStatusBadge({ status }: { status: Nurse["status"] }) {
  const map: Record<Nurse["status"], { label: string; cls: string }> = {
    active: { label: "متاح", cls: "bg-emerald-500/15 text-emerald-700" },
    on_leave: { label: "إجازة", cls: "bg-amber-500/15 text-amber-700" },
    inactive: { label: "غير نشط", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function NurseEditDialog({
  open,
  onOpenChange,
  value,
  branches,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: Partial<Nurse> | null;
  branches: Array<{ id: string; name_ar: string }>;
  onSave: (v: Partial<Nurse>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<Nurse>>(value ?? { status: "active" });
  // Reset form when value changes
  useMemo(() => {
    setForm(value ?? { status: "active" });
  }, [value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "تعديل ممرض/ة" : "إضافة ممرض/ة"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="الاسم الكامل *">
            <input
              className="input"
              value={form.full_name ?? ""}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label="القسم">
            <input
              className="input"
              value={form.department ?? ""}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </Field>
          <Field label="الفرع">
            <select
              className="input"
              value={form.branch_id ?? ""}
              onChange={(e) => setForm({ ...form, branch_id: e.target.value || null })}
            >
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الجوال">
            <input
              className="input"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="البريد الإلكتروني">
            <input
              className="input"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="الرقم الوظيفي">
            <input
              className="input"
              value={form.employee_no ?? ""}
              onChange={(e) => setForm({ ...form, employee_no: e.target.value })}
            />
          </Field>
          <Field label="الحالة">
            <select
              className="input"
              value={form.status ?? "active"}
              onChange={(e) => setForm({ ...form, status: e.target.value as Nurse["status"] })}
            >
              <option value="active">متاح</option>
              <option value="on_leave">إجازة</option>
              <option value="inactive">غير نشط</option>
            </select>
          </Field>
          <Field label="ملاحظات" className="md:col-span-2">
            <textarea
              className="input min-h-16"
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            إلغاء
          </button>
          <button
            disabled={saving || !form.full_name}
            onClick={() => onSave(form)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{" "}
            حفظ
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      <style>{`.input{width:100%;border:1px solid hsl(var(--input));background:hsl(var(--background));border-radius:6px;padding:6px 10px;font-size:14px}`}</style>
    </label>
  );
}

/* ============================================================
   Shifts panel — weekly grid
   ============================================================ */

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sunday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const SHIFT_TYPES: Array<{ v: ShiftType; label: string; range: [string, string]; cls: string }> = [
  {
    v: "morning",
    label: "صباحية",
    range: ["07:00", "15:00"],
    cls: "bg-teal-500/15 text-teal-700 border-teal-500/30",
  },
  {
    v: "evening",
    label: "مسائية",
    range: ["15:00", "23:00"],
    cls: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  },
  {
    v: "night",
    label: "ليلية",
    range: ["23:00", "07:00"],
    cls: "bg-teal-500/15 text-teal-700 border-teal-500/30",
  },
];

function ShiftsPanel({ branchId }: { branchId: string | null }) {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const listShiftsFn = useServerFn(listShifts);
  const listNursesFn = useServerFn(listNurses);
  const upsertFn = useServerFn(upsertShift);
  const deleteShiftFn = useServerFn(deleteShift);

  const shiftsQ = useQuery({
    queryKey: ["shifts", branchId, isoDate(weekStart)],
    queryFn: () =>
      listShiftsFn({ data: { branchId, fromDate: isoDate(weekStart), toDate: isoDate(weekEnd) } }),
  });
  const nursesQ = useQuery({
    queryKey: ["nurses", "list", branchId],
    queryFn: () => listNursesFn({ data: { branchId } }),
  });

  const [dlgOpen, setDlgOpen] = useState(false);
  const [dlgInit, setDlgInit] = useState<Partial<NurseShift> | null>(null);

  const save = useMutation({
    mutationFn: (data: Partial<NurseShift>) => upsertFn({ data: data as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      setDlgOpen(false);
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteShiftFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group shifts by nurse_id -> date
  const grouped = useMemo(() => {
    const m = new Map<string, Map<string, NurseShift[]>>();
    for (const s of shiftsQ.data ?? []) {
      if (!m.has(s.nurse_id)) m.set(s.nurse_id, new Map());
      const inner = m.get(s.nurse_id)!;
      const key = s.shift_date;
      if (!inner.has(key)) inner.set(key, []);
      inner.get(key)!.push(s);
    }
    return m;
  }, [shiftsQ.data]);

  const visibleNurses = (nursesQ.data ?? []).filter((n) => n.status !== "inactive");

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded border p-1.5 hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="text-sm font-medium">
            {isoDate(weekStart)} — {isoDate(weekEnd)}
          </div>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded border p-1.5 hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="ml-2 rounded border px-2 py-1 text-xs hover:bg-muted"
          >
            هذا الأسبوع
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            {SHIFT_TYPES.map((t) => (
              <span
                key={t.v}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${t.cls}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> {t.label}
              </span>
            ))}
          </div>
          <button
            onClick={() => {
              setDlgInit({
                shift_date: isoDate(new Date()),
                shift_type: "morning",
                start_time: "07:00",
                end_time: "15:00",
                branch_id: branchId,
              });
              setDlgOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> إضافة وردية
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-2 py-2 font-medium text-right sticky right-0 bg-muted/50 min-w-40">
                الممرض/ة
              </th>
              {days.map((d) => (
                <th key={isoDate(d)} className="px-2 py-2 font-medium text-center min-w-28">
                  <div>{d.toLocaleDateString("ar", { weekday: "short" })}</div>
                  <div className="text-[10px] text-muted-foreground">{isoDate(d).slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleNurses.map((n) => (
              <tr key={n.id} className="border-t">
                <td className="px-2 py-2 font-medium sticky right-0 bg-card">{n.full_name}</td>
                {days.map((d) => {
                  const key = isoDate(d);
                  const cell = grouped.get(n.id)?.get(key) ?? [];
                  return (
                    <td key={key} className="px-1 py-1 align-top">
                      <div className="flex flex-col gap-1">
                        {cell.map((s) => {
                          const t = SHIFT_TYPES.find((x) => x.v === s.shift_type)!;
                          return (
                            <button
                              key={s.id}
                              onClick={() => {
                                setDlgInit(s);
                                setDlgOpen(true);
                              }}
                              className={`group text-right rounded border px-1.5 py-1 ${t.cls} hover:opacity-80`}
                              title={s.notes ?? ""}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-medium">{t.label}</span>
                                <span className="ltr text-[10px] opacity-80">
                                  {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                        <button
                          onClick={() => {
                            setDlgInit({
                              nurse_id: n.id,
                              shift_date: key,
                              shift_type: "morning",
                              start_time: "07:00",
                              end_time: "15:00",
                              branch_id: n.branch_id ?? branchId,
                            });
                            setDlgOpen(true);
                          }}
                          className="rounded border border-dashed border-input px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                        >
                          + وردية
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {visibleNurses.length === 0 && (
              <tr>
                <td
                  colSpan={days.length + 1}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  أضف الممرضين من تبويب "الطاقم" أولاً
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ShiftDialog
        open={dlgOpen}
        onOpenChange={setDlgOpen}
        value={dlgInit}
        nurses={nursesQ.data ?? []}
        onSave={(v) => save.mutate(v)}
        onDelete={(id) => del.mutate(id)}
        saving={save.isPending}
      />
    </div>
  );
}

function ShiftDialog({
  open,
  onOpenChange,
  value,
  nurses,
  onSave,
  onDelete,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: Partial<NurseShift> | null;
  nurses: Nurse[];
  onSave: (v: Partial<NurseShift>) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<Partial<NurseShift>>(value ?? {});
  useMemo(() => {
    setF(value ?? {});
  }, [value]);

  function pickType(t: ShiftType) {
    const preset = SHIFT_TYPES.find((x) => x.v === t)!;
    setF({ ...f, shift_type: t, start_time: preset.range[0], end_time: preset.range[1] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{f.id ? "تعديل وردية" : "إضافة وردية"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الممرض/ة *" className="col-span-2">
            <select
              className="input"
              value={f.nurse_id ?? ""}
              onChange={(e) => setF({ ...f, nurse_id: e.target.value })}
            >
              <option value="">—</option>
              {nurses.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="التاريخ *">
            <input
              type="date"
              className="input"
              value={f.shift_date ?? ""}
              onChange={(e) => setF({ ...f, shift_date: e.target.value })}
            />
          </Field>
          <Field label="النوع *">
            <select
              className="input"
              value={f.shift_type ?? "morning"}
              onChange={(e) => pickType(e.target.value as ShiftType)}
            >
              {SHIFT_TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="بداية">
            <input
              type="time"
              className="input"
              value={f.start_time?.slice(0, 5) ?? ""}
              onChange={(e) => setF({ ...f, start_time: e.target.value })}
            />
          </Field>
          <Field label="نهاية">
            <input
              type="time"
              className="input"
              value={f.end_time?.slice(0, 5) ?? ""}
              onChange={(e) => setF({ ...f, end_time: e.target.value })}
            />
          </Field>
          <Field label="ملاحظات" className="col-span-2">
            <input
              className="input"
              value={f.notes ?? ""}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter className="flex-row justify-between">
          {f.id ? (
            <button
              onClick={() => {
                if (confirm("حذف الوردية؟")) {
                  onDelete(f.id!);
                  onOpenChange(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive"
            >
              <Trash2 className="h-4 w-4" /> حذف
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              إلغاء
            </button>
            <button
              disabled={saving || !f.nurse_id || !f.shift_date}
              onClick={() => onSave(f)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}{" "}
              حفظ
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Calls panel
   ============================================================ */

const PRIORITY_META: Record<CallPriority, { label: string; cls: string }> = {
  normal: { label: "عادي", cls: "bg-slate-500/15 text-slate-700 border-slate-500/30" },
  urgent: { label: "عاجل", cls: "bg-amber-500/15 text-amber-700 border-amber-500/40" },
  critical: { label: "حرج", cls: "bg-red-500/15 text-red-700 border-red-500/50" },
};

const STATUS_META: Record<CallStatus, { label: string; cls: string }> = {
  pending: { label: "قيد الانتظار", cls: "bg-teal-500/15 text-teal-700" },
  in_progress: { label: "قيد المعالجة", cls: "bg-teal-500/15 text-teal-700" },
  completed: { label: "مكتمل", cls: "bg-emerald-500/15 text-emerald-700" },
  cancelled: { label: "ملغى", cls: "bg-muted text-muted-foreground" },
};

function CallsPanel({ branchId }: { branchId: string | null }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"active" | "all" | CallStatus>("active");
  const listCallsFn = useServerFn(listCalls);
  const createCallFn = useServerFn(createCall);
  const updateFn = useServerFn(updateCallStatus);
  const listNursesFn = useServerFn(listNurses);

  const callsQ = useQuery({
    queryKey: ["calls", branchId, filter],
    queryFn: () => listCallsFn({ data: { branchId, status: filter === "all" ? null : filter } }),
    refetchInterval: filter === "active" ? 15000 : false,
  });
  const nursesQ = useQuery({
    queryKey: ["nurses", "list", branchId],
    queryFn: () => listNursesFn({ data: { branchId } }),
  });

  const [newOpen, setNewOpen] = useState(false);

  const upd = useMutation({
    mutationFn: (v: { id: string; status: CallStatus; assigned_nurse_id?: string | null }) =>
      updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calls"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: (v: Partial<NurseCall>) => createCallFn({ data: v as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calls"] });
      setNewOpen(false);
      toast.success("تم إنشاء الاستدعاء");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = callsQ.data ?? [];
  const nurseName = (id: string | null) =>
    id ? (nursesQ.data?.find((n) => n.id === id)?.full_name ?? "—") : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1 text-xs">
          {(
            [
              { v: "active", l: "النشطة" },
              { v: "pending", l: "قيد الانتظار" },
              { v: "in_progress", l: "قيد المعالجة" },
              { v: "completed", l: "المكتملة" },
              { v: "cancelled", l: "الملغاة" },
              { v: "all", l: "الكل" },
            ] as const
          ).map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`rounded px-2 py-1 ${filter === f.v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {f.l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {callsQ.isFetching && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">تحديث كل 15ث</span>
          <button
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> استدعاء جديد
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map((c) => {
          const p = PRIORITY_META[c.priority];
          const s = STATUS_META[c.status];
          return (
            <div key={c.id} className={`rounded-xl border-2 bg-card p-4 ${p.cls}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`border-current ${p.cls}`}>
                    {p.label}
                  </Badge>
                  <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${s.cls}`}>
                    {s.label}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.called_at), {
                    addSuffix: true,
                    locale: arLocale,
                  })}
                </span>
              </div>
              <div className="text-sm font-semibold">غرفة {c.room_no ?? "—"}</div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {c.reason ?? "بدون سبب محدد"}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                مُسند إلى: <span className="text-foreground">{nurseName(c.assigned_nurse_id)}</span>
              </div>

              {c.status !== "completed" && c.status !== "cancelled" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className="input text-xs !py-1 flex-1 min-w-0"
                    value={c.assigned_nurse_id ?? ""}
                    onChange={(e) =>
                      upd.mutate({
                        id: c.id,
                        status: c.status,
                        assigned_nurse_id: e.target.value || null,
                      })
                    }
                  >
                    <option value="">— إسناد —</option>
                    {nursesQ.data
                      ?.filter((n) => n.status === "active")
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.full_name}
                        </option>
                      ))}
                  </select>
                  {c.status === "pending" && (
                    <button
                      onClick={() => upd.mutate({ id: c.id, status: "in_progress" })}
                      className="rounded bg-teal-600 px-2 py-1 text-xs text-white hover:opacity-90"
                    >
                      قبول
                    </button>
                  )}
                  {c.status === "in_progress" && (
                    <button
                      onClick={() => upd.mutate({ id: c.id, status: "completed" })}
                      className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:opacity-90"
                    >
                      <Check className="h-3 w-3" /> إنهاء
                    </button>
                  )}
                  <button
                    onClick={() => upd.mutate({ id: c.id, status: "cancelled" })}
                    className="inline-flex items-center gap-1 rounded border border-destructive px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-3 w-3" /> إلغاء
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!callsQ.isLoading && rows.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            لا توجد استدعاءات في هذا الفلتر.
          </div>
        )}
      </div>

      <NewCallDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        branchId={branchId}
        onSave={(v) => create.mutate(v)}
        saving={create.isPending}
      />
    </div>
  );
}

function NewCallDialog({
  open,
  onOpenChange,
  branchId,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branchId: string | null;
  onSave: (v: Partial<NurseCall>) => void;
  saving: boolean;
}) {
  const [f, setF] = useState<Partial<NurseCall>>({ priority: "normal", branch_id: branchId });
  useMemo(() => {
    setF({ priority: "normal", branch_id: branchId });
  }, [branchId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>استدعاء جديد</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="رقم الغرفة *">
            <input
              className="input"
              value={f.room_no ?? ""}
              onChange={(e) => setF({ ...f, room_no: e.target.value })}
            />
          </Field>
          <Field label="الأولوية">
            <select
              className="input"
              value={f.priority ?? "normal"}
              onChange={(e) => setF({ ...f, priority: e.target.value as CallPriority })}
            >
              <option value="normal">عادي</option>
              <option value="urgent">عاجل</option>
              <option value="critical">حرج</option>
            </select>
          </Field>
          <Field label="السبب" className="col-span-2">
            <textarea
              className="input min-h-16"
              value={f.reason ?? ""}
              onChange={(e) => setF({ ...f, reason: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            إلغاء
          </button>
          <button
            disabled={saving || !f.room_no}
            onClick={() => onSave(f)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}{" "}
            إنشاء
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
