import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRight, CalendarDays, Check, ClipboardCheck, Loader2,
  Plus, Trash2, UserCog, Users, Wallet, X, Pencil, Building2,
} from "lucide-react";
import {
  listEmployees, upsertEmployee, deleteEmployee,
  listAttendance, upsertAttendance,
  listLeaves, createLeave, reviewLeave,
  listPayrollRuns, createPayrollRun, updatePayrollItem, finalizePayrollRun, deletePayrollRun,
  type Employee, type AttendanceStatus, type LeaveStatus, type PayrollRun, type PayrollItem,
} from "@/lib/hr.functions";
import { listBranches } from "@/lib/dashboard.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/hr-management")({
  head: () => ({
    meta: [
      { title: "الموارد البشرية | مجمع باعشن الطبي" },
      { name: "description", content: "إدارة الموظفين، الحضور، الإجازات، والرواتب." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="hr.manage">
      <HrPage />
    </RequirePermission>
  ),
  errorComponent: HrError,
  notFoundComponent: () => null,
});

function HrError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md m-10 rounded-2xl border bg-card p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
      <h2 className="mb-2 font-bold">تعذّر تحميل الموارد البشرية</h2>
      <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
      <button onClick={() => { reset(); router.invalidate(); }} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">إعادة المحاولة</button>
    </div>
  );
}

function HrPage() {
  const [tab, setTab] = useState<"employees" | "attendance" | "leaves" | "payroll">("employees");
  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/command-center" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs hover:bg-accent">
            <ArrowRight className="h-3.5 w-3.5" /> مركز التحكم
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">الموارد البشرية</h1>
            <p className="text-sm text-muted-foreground">الموظفون، الحضور، الإجازات، وسير الرواتب.</p>
          </div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-4">
            <TabsTrigger value="employees"><Users className="ms-1 h-4 w-4" /> الموظفون</TabsTrigger>
            <TabsTrigger value="attendance"><ClipboardCheck className="ms-1 h-4 w-4" /> الحضور</TabsTrigger>
            <TabsTrigger value="leaves"><CalendarDays className="ms-1 h-4 w-4" /> الإجازات</TabsTrigger>
            <TabsTrigger value="payroll"><Wallet className="ms-1 h-4 w-4" /> الرواتب</TabsTrigger>
          </TabsList>
          <TabsContent value="employees"><EmployeesTab /></TabsContent>
          <TabsContent value="attendance"><AttendanceTab /></TabsContent>
          <TabsContent value="leaves"><LeavesTab /></TabsContent>
          <TabsContent value="payroll"><PayrollTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ================= Employees ================= */
function EmployeesTab() {
  const empQ = useQuery({ queryKey: ["hr-employees"], queryFn: () => listEmployees() });
  const branchesQ = useQuery({ queryKey: ["hr-branches"], queryFn: () => listBranches() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const qc = useQueryClient();
  const delFn = useServerFn(deleteEmployee);
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("تم التعطيل"); qc.invalidateQueries({ queryKey: ["hr-employees"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = empQ.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setEditing(null); setOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> موظف جديد
        </button>
      </div>
      {empQ.isLoading ? <LoadingPanel /> : rows.length === 0 ? (
        <EmptyPanel icon={<UserCog className="h-8 w-8" />} title="لا يوجد موظفون" desc="أضف أول موظف لبدء إدارة الحضور والرواتب." />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-start">الاسم</th>
                <th className="p-3 text-start">المسمى</th>
                <th className="p-3 text-start">القسم</th>
                <th className="p-3">الراتب</th>
                <th className="p-3">تاريخ التعيين</th>
                <th className="p-3">الحالة</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3 font-medium">{e.full_name}<div className="text-xs text-muted-foreground">{e.phone ?? ""}</div></td>
                  <td className="p-3">{e.position ?? "—"}</td>
                  <td className="p-3">{e.department ?? "—"}</td>
                  <td className="p-3 text-center font-bold">{Number(e.monthly_salary).toLocaleString("ar-SA")}</td>
                  <td className="p-3 text-center text-muted-foreground">{e.hire_date ?? "—"}</td>
                  <td className="p-3 text-center">
                    {e.is_active
                      ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700">نشط</span>
                      : <span className="rounded-full bg-muted px-2 py-0.5 text-xs">معطّل</span>}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditing(e); setOpen(true); }} className="rounded-full p-1.5 hover:bg-accent" aria-label="تعديل"><Pencil className="h-3.5 w-3.5" /></button>
                      {e.is_active && (
                        <button onClick={() => { if (confirm("تعطيل الموظف؟")) delMut.mutate(e.id); }}
                          className="rounded-full p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EmployeeDialog open={open} onOpenChange={setOpen} editing={editing} branches={branchesQ.data ?? []} />
    </div>
  );
}

function EmployeeDialog({ open, onOpenChange, editing, branches }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Employee | null;
  branches: Array<{ id: string; name_ar: string; name_en: string | null }>;
}) {
  const [form, setForm] = useState<Partial<Employee>>(editing ?? {});
  useMemo(() => { setForm(editing ?? {}); }, [editing]);
  const qc = useQueryClient();
  const fn = useServerFn(upsertEmployee);
  const mut = useMutation({
    mutationFn: () => fn({ data: {
      id: editing?.id,
      full_name: (form.full_name ?? "").trim(),
      national_id: form.national_id ?? null,
      phone: form.phone ?? null,
      email: form.email ?? null,
      position: form.position ?? null,
      department: form.department ?? null,
      branch_id: form.branch_id ?? null,
      monthly_salary: Number(form.monthly_salary ?? 0),
      hire_date: form.hire_date ?? null,
      is_active: form.is_active ?? true,
      notes: form.notes ?? null,
    } }),
    onSuccess: () => {
      toast.success(editing ? "تم التحديث" : "تم الإضافة");
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader><DialogTitle>{editing ? "تعديل موظف" : "موظف جديد"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="الاسم الكامل" value={form.full_name ?? ""} onChange={(v) => setForm({ ...form, full_name: v })} />
          <TextField label="الهوية / الإقامة" value={form.national_id ?? ""} onChange={(v) => setForm({ ...form, national_id: v })} />
          <TextField label="الجوال" value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} />
          <TextField label="البريد" value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} />
          <TextField label="المسمى الوظيفي" value={form.position ?? ""} onChange={(v) => setForm({ ...form, position: v })} />
          <TextField label="القسم" value={form.department ?? ""} onChange={(v) => setForm({ ...form, department: v })} />
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">الفرع</span>
            <select value={form.branch_id ?? ""} onChange={(e) => setForm({ ...form, branch_id: e.target.value || null })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="">—</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name_en}</option>)}
            </select>
          </label>
          <TextField label="الراتب الشهري" type="number" value={String(form.monthly_salary ?? 0)} onChange={(v) => setForm({ ...form, monthly_salary: Number(v) })} />
          <TextField label="تاريخ التعيين" type="date" value={form.hire_date ?? ""} onChange={(v) => setForm({ ...form, hire_date: v })} />
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="rounded-full border px-4 py-2 text-sm">إلغاء</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !(form.full_name ?? "").trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================= Attendance ================= */
function AttendanceTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const empQ = useQuery({ queryKey: ["hr-employees"], queryFn: () => listEmployees() });
  const attQ = useQuery({
    queryKey: ["hr-att", date],
    queryFn: () => listAttendance({ data: { from: date, to: date } }),
  });
  const qc = useQueryClient();
  const fn = useServerFn(upsertAttendance);
  const mut = useMutation({
    mutationFn: (vars: { employee_id: string; status: AttendanceStatus; check_in?: string | null; check_out?: string | null }) =>
      fn({ data: { employee_id: vars.employee_id, work_date: date, status: vars.status,
        check_in: vars.check_in ?? null, check_out: vars.check_out ?? null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-att", date] });
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byEmp = new Map((attQ.data ?? []).map((r) => [r.employee_id, r]));
  const emps = (empQ.data ?? []).filter((e) => e.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">التاريخ:</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm" />
      </div>
      {attQ.isLoading || empQ.isLoading ? <LoadingPanel /> : emps.length === 0 ? (
        <EmptyPanel icon={<Users className="h-8 w-8" />} title="لا يوجد موظفون" desc="أضف موظفين أولاً." />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-start">الموظف</th>
                <th className="p-3">دخول</th>
                <th className="p-3">خروج</th>
                <th className="p-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => {
                const rec = byEmp.get(e.id);
                const set = (patch: Partial<{ status: AttendanceStatus; check_in: string | null; check_out: string | null }>) =>
                  mut.mutate({
                    employee_id: e.id,
                    status: patch.status ?? rec?.status ?? "present",
                    check_in: patch.check_in ?? rec?.check_in ?? null,
                    check_out: patch.check_out ?? rec?.check_out ?? null,
                  });
                return (
                  <tr key={e.id} className="border-t">
                    <td className="p-3 font-medium">{e.full_name}<div className="text-xs text-muted-foreground">{e.position ?? ""}</div></td>
                    <td className="p-3 text-center">
                      <input type="time" defaultValue={rec?.check_in ? new Date(rec.check_in).toISOString().slice(11, 16) : ""}
                        onBlur={(ev) => set({ check_in: ev.target.value ? `${date}T${ev.target.value}:00` : null })}
                        className="rounded-md border bg-background px-2 py-1 text-sm" />
                    </td>
                    <td className="p-3 text-center">
                      <input type="time" defaultValue={rec?.check_out ? new Date(rec.check_out).toISOString().slice(11, 16) : ""}
                        onBlur={(ev) => set({ check_out: ev.target.value ? `${date}T${ev.target.value}:00` : null })}
                        className="rounded-md border bg-background px-2 py-1 text-sm" />
                    </td>
                    <td className="p-3 text-center">
                      <select value={rec?.status ?? "present"} onChange={(ev) => set({ status: ev.target.value as AttendanceStatus })}
                        className="rounded-md border bg-background px-2 py-1 text-sm">
                        <option value="present">حاضر</option>
                        <option value="late">متأخر</option>
                        <option value="absent">غائب</option>
                        <option value="leave">إجازة</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================= Leaves ================= */
const LEAVE_STATUS_AR: Record<LeaveStatus | "all", string> = {
  all: "الكل", pending: "قيد المراجعة", approved: "معتمدة", rejected: "مرفوضة", cancelled: "ملغاة",
};

function LeavesTab() {
  const [status, setStatus] = useState<LeaveStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["hr-leaves", status], queryFn: () => listLeaves({ data: { status } }) });
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewLeave);
  const rev = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "rejected" | "cancelled"; notes?: string | null }) =>
      reviewFn({ data: { id: v.id, status: v.status, review_notes: v.notes ?? null } }),
    onSuccess: () => { toast.success("تم"); qc.invalidateQueries({ queryKey: ["hr-leaves"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border p-1">
          {(["all", "pending", "approved", "rejected", "cancelled"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${status === s ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              {LEAVE_STATUS_AR[s]}
            </button>
          ))}
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> طلب إجازة
        </button>
      </div>
      {q.isLoading ? <LoadingPanel /> : (q.data ?? []).length === 0 ? (
        <EmptyPanel icon={<CalendarDays className="h-8 w-8" />} title="لا توجد طلبات" desc="لا توجد إجازات مطابقة." />
      ) : (
        <div className="grid gap-3">
          {(q.data ?? []).map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{r.employee_name ?? r.employee_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{r.leave_type} · {r.from_date} → {r.to_date} · {r.days} يوم</div>
                </div>
                <StatusPill status={r.status} />
              </div>
              {r.reason && <p className="mb-2 rounded-lg bg-muted/40 p-2 text-xs">{r.reason}</p>}
              {r.review_notes && <p className="mb-2 rounded-lg bg-muted/40 p-2 text-xs">مراجعة: {r.review_notes}</p>}
              {r.status === "pending" && (
                <div className="flex gap-2">
                  <button onClick={() => rev.mutate({ id: r.id, status: "approved" })} disabled={rev.isPending}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white"><Check className="h-3 w-3" /> اعتماد</button>
                  <button onClick={() => rev.mutate({ id: r.id, status: "rejected", notes: prompt("سبب الرفض؟") ?? undefined })} disabled={rev.isPending}
                    className="inline-flex items-center gap-1 rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground"><X className="h-3 w-3" /> رفض</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <NewLeaveDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function StatusPill({ status }: { status: LeaveStatus }) {
  const cls = status === "approved" ? "bg-emerald-500/15 text-emerald-700"
    : status === "rejected" ? "bg-destructive/15 text-destructive"
    : status === "cancelled" ? "bg-muted text-muted-foreground"
    : "bg-amber-500/15 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{LEAVE_STATUS_AR[status]}</span>;
}

function NewLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const empQ = useQuery({ queryKey: ["hr-employees"], queryFn: () => listEmployees(), enabled: open });
  const [employee_id, setEmployee] = useState("");
  const [leave_type, setType] = useState("annual");
  const [from_date, setFrom] = useState("");
  const [to_date, setTo] = useState("");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const fn = useServerFn(createLeave);
  const mut = useMutation({
    mutationFn: () => fn({ data: { employee_id, leave_type, from_date, to_date, reason: reason || null } }),
    onSuccess: () => {
      toast.success("تم إرسال الطلب");
      qc.invalidateQueries({ queryKey: ["hr-leaves"] });
      onOpenChange(false);
      setEmployee(""); setFrom(""); setTo(""); setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader><DialogTitle>طلب إجازة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">الموظف</span>
            <select value={employee_id} onChange={(e) => setEmployee(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="">—</option>
              {(empQ.data ?? []).filter((e) => e.is_active).map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">النوع</span>
              <select value={leave_type} onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                <option value="annual">سنوية</option>
                <option value="sick">مرضية</option>
                <option value="emergency">اضطرارية</option>
                <option value="unpaid">بدون راتب</option>
              </select>
            </label>
            <TextField label="من" type="date" value={from_date} onChange={setFrom} />
            <TextField label="إلى" type="date" value={to_date} onChange={setTo} />
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">السبب</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
          </label>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="rounded-full border px-4 py-2 text-sm">إلغاء</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !employee_id || !from_date || !to_date}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} إرسال
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================= Payroll ================= */
function PayrollTab() {
  const q = useQuery({ queryKey: ["hr-payroll"], queryFn: () => listPayrollRuns(), staleTime: 30_000 });
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const qc = useQueryClient();

  const createFn = useServerFn(createPayrollRun);
  const finalizeFn = useServerFn(finalizePayrollRun);
  const delFn = useServerFn(deletePayrollRun);

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { period_year: year, period_month: month } }),
    onSuccess: () => { toast.success("تم إنشاء سير الرواتب"); qc.invalidateQueries({ queryKey: ["hr-payroll"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const finalMut = useMutation({
    mutationFn: (id: string) => finalizeFn({ data: { id } }),
    onSuccess: () => { toast.success("تم الاعتماد"); qc.invalidateQueries({ queryKey: ["hr-payroll"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["hr-payroll"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
        <span className="text-sm font-semibold">إنشاء سير جديد:</span>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="w-24 rounded-lg border bg-background px-3 py-2 text-sm" />
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
          className="rounded-lg border bg-background px-3 py-2 text-sm">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={() => createMut.mutate()} disabled={createMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Plus className="h-4 w-4" /> إنشاء
        </button>
      </div>
      {q.isLoading ? <LoadingPanel /> : (q.data ?? []).length === 0 ? (
        <EmptyPanel icon={<Wallet className="h-8 w-8" />} title="لا يوجد سير رواتب" desc="أنشئ أول سير رواتب لهذا الشهر." />
      ) : (
        <div className="space-y-4">
          {(q.data ?? []).map((r) => (
            <PayrollRunCard key={r.id} run={r}
              onFinalize={() => finalMut.mutate(r.id)}
              onDelete={() => { if (confirm("حذف السير؟")) delMut.mutate(r.id); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function PayrollRunCard({ run, onFinalize, onDelete }: {
  run: PayrollRun; onFinalize: () => void; onDelete: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(updatePayrollItem);
  const mut = useMutation({
    mutationFn: (v: { id: string; allowances: number; deductions: number; notes?: string | null }) =>
      fn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-payroll"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const items = run.items ?? [];
  const locked = run.status === "finalized";
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <span className="font-bold">{run.period_year}/{String(run.period_month).padStart(2, "0")}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${locked ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
            {locked ? "معتمد" : "مسودة"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div><span className="text-muted-foreground">إجمالي:</span> <b>{Number(run.total_gross).toLocaleString("ar-SA")}</b></div>
          <div><span className="text-muted-foreground">صافي:</span> <b>{Number(run.total_net).toLocaleString("ar-SA")}</b></div>
          {!locked && (
            <button onClick={onFinalize} className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">اعتماد</button>
          )}
          <button onClick={onDelete} className="rounded-full p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-2 text-start">الموظف</th>
              <th className="p-2">الأساسي</th>
              <th className="p-2">بدلات</th>
              <th className="p-2">خصومات</th>
              <th className="p-2">الصافي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => <PayrollItemRow key={it.id} it={it} locked={locked}
              onSave={(v) => mut.mutate({ id: it.id, allowances: v.allowances, deductions: v.deductions })} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayrollItemRow({ it, locked, onSave }: {
  it: PayrollItem; locked: boolean;
  onSave: (v: { allowances: number; deductions: number }) => void;
}) {
  const [a, setA] = useState(String(it.allowances));
  const [d, setD] = useState(String(it.deductions));
  const net = Number(it.base_salary) + Number(a || 0) - Number(d || 0);
  return (
    <tr className="border-t">
      <td className="p-2">{it.employee_name ?? it.employee_id.slice(0, 8)}</td>
      <td className="p-2 text-center">{Number(it.base_salary).toLocaleString("ar-SA")}</td>
      <td className="p-2 text-center">
        <input type="number" value={a} disabled={locked}
          onChange={(e) => setA(e.target.value)}
          onBlur={() => onSave({ allowances: Number(a || 0), deductions: Number(d || 0) })}
          className="w-24 rounded-md border bg-background px-2 py-1 text-sm text-center" />
      </td>
      <td className="p-2 text-center">
        <input type="number" value={d} disabled={locked}
          onChange={(e) => setD(e.target.value)}
          onBlur={() => onSave({ allowances: Number(a || 0), deductions: Number(d || 0) })}
          className="w-24 rounded-md border bg-background px-2 py-1 text-sm text-center" />
      </td>
      <td className="p-2 text-center font-bold">{net.toLocaleString("ar-SA")}</td>
    </tr>
  );
}

/* ================= shared ================= */
function TextField({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
    </label>
  );
}
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
