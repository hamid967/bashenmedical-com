import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PatientQrDialog } from "@/components/PatientQrDialog";
import { supabase } from "@/integrations/supabase/client";
import { listBranches } from "@/lib/dashboard.functions";
import { generateMrn } from "@/lib/patients.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Search,
  Plus,
  ArrowLeft,
  Phone,
  IdCard,
  Building2,
  Loader2,
  BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/patients/")({
  head: () => ({
    meta: [{ title: "السجلات الطبية | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
  component: PatientsList,
});

type Patient = {
  id: string;
  mrn: string;
  full_name_ar: string;
  full_name_en: string | null;
  phone: string;
  national_id: string | null;
  gender: "male" | "female" | "other" | null;
  date_of_birth: string | null;
  branch_id: string;
  is_active: boolean;
  created_at: string;
};

function calcAge(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function PatientsList() {
  const [q, setQ] = useState("");
  const [branchId, setBranchId] = useState<string | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const listBranchesFn = useServerFn(listBranches);
  const branchesQ = useQuery({ queryKey: ["branches"], queryFn: () => listBranchesFn() });

  const patientsQ = useQuery({
    queryKey: ["patients", q, branchId, showInactive],
    queryFn: async (): Promise<Patient[]> => {
      let query = supabase
        .from("patients")
        .select(
          "id, mrn, full_name_ar, full_name_en, phone, national_id, gender, date_of_birth, branch_id, is_active, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (!showInactive) query = query.eq("is_active", true);
      if (branchId !== "all") query = query.eq("branch_id", branchId);
      if (q.trim()) {
        const term = q.trim();
        query = query.or(
          `full_name_ar.ilike.%${term}%,full_name_en.ilike.%${term}%,phone.ilike.%${term}%,mrn.ilike.%${term}%,national_id.ilike.%${term}%`,
        );
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Patient[];
    },
  });

  const branchName = (id: string) => branchesQ.data?.find((b) => b.id === id)?.name_ar ?? "—";

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> رجوع
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> السجلات الطبية
            </h1>
            <p className="text-sm text-muted-foreground">ملفات المرضى — بحث وإدارة</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> ملف مريض جديد
        </button>
      </div>

      <Tabs defaultValue="list">
        <TabsList className="grid grid-cols-2 sm:inline-flex h-auto mb-4">
          <TabsTrigger value="list">
            <Users className="h-4 w-4 ml-1" /> قائمة المرضى
          </TabsTrigger>
          <TabsTrigger value="stats">
            <BarChart3 className="h-4 w-4 ml-1" /> إحصائيات سريعة
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث بالاسم، الجوال، الهوية، أو رقم الملف"
                className="w-full rounded-md border border-input bg-background pr-10 pl-3 py-2 text-sm"
              />
            </div>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value as any)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">كل الفروع</option>
              {branchesQ.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4"
              />
              عرض المؤرشفين
            </label>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {patientsQ.isLoading ? (
              <div className="p-10 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : patientsQ.data && patientsQ.data.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">لا توجد نتائج</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-right">رقم الملف</th>
                    <th className="px-4 py-3 text-right">الاسم</th>
                    <th className="px-4 py-3 text-right">الجوال</th>
                    <th className="px-4 py-3 text-right">الهوية</th>
                    <th className="px-4 py-3 text-right">العمر</th>
                    <th className="px-4 py-3 text-right">الجنس</th>
                    <th className="px-4 py-3 text-right">الفرع</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {patientsQ.data?.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{p.mrn}</td>
                      <td className="px-4 py-3 font-medium">{p.full_name_ar}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.phone}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.national_id ?? "—"}</td>
                      <td className="px-4 py-3">{calcAge(p.date_of_birth) ?? "—"}</td>
                      <td className="px-4 py-3">
                        {p.gender === "male" ? "ذكر" : p.gender === "female" ? "أنثى" : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {branchName(p.branch_id)}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <div className="inline-flex items-center gap-1.5">
                          <PatientQrDialog
                            patientId={p.id}
                            mrn={p.mrn}
                            fullNameAr={p.full_name_ar}
                          />
                          <Link
                            to="/patients/$patientId"
                            params={{ patientId: p.id }}
                            className="rounded-md border border-input px-3 py-1 text-xs hover:bg-muted"
                          >
                            فتح
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <QuickStats patients={patientsQ.data ?? []} branches={branchesQ.data ?? []} />
        </TabsContent>
      </Tabs>

      {showCreate && (
        <CreatePatientDialog
          branches={branchesQ.data ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            patientsQ.refetch();
          }}
        />
      )}
    </div>
  );
}

function QuickStats({
  patients,
  branches,
}: {
  patients: Patient[];
  branches: Array<{ id: string; name_ar: string }>;
}) {
  const total = patients.length;
  const male = patients.filter((p) => p.gender === "male").length;
  const female = patients.filter((p) => p.gender === "female").length;
  const byBranch = branches.map((b) => ({
    id: b.id,
    name: b.name_ar,
    count: patients.filter((p) => p.branch_id === b.id).length,
  }));

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs text-muted-foreground">إجمالي المرضى (الحالي)</div>
        <div className="mt-2 text-3xl font-bold">{total}</div>
        <Link
          to="/patients-analytics"
          className="mt-3 inline-flex text-xs text-primary hover:underline"
        >
          التحليلات الكاملة ←
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs text-muted-foreground">حسب الجنس</div>
        <div className="mt-3 space-y-2 text-sm">
          <StatRow label="ذكر" value={male} total={total} />
          <StatRow label="أنثى" value={female} total={total} />
          <StatRow label="غير محدد" value={total - male - female} total={total} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs text-muted-foreground">حسب الفرع</div>
        <div className="mt-3 space-y-2 text-sm">
          {byBranch.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد فروع</p>
          ) : (
            byBranch.map((b) => <StatRow key={b.id} label={b.name} value={b.count} total={total} />)
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {value} <span className="text-xs text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CreatePatientDialog({
  branches,
  onClose,
  onCreated,
}: {
  branches: Array<{ id: string; name_ar: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const generateMrnFn = useServerFn(generateMrn);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    branch_id: branches[0]?.id ?? "",
    full_name_ar: "",
    full_name_en: "",
    phone: "",
    secondary_phone: "",
    national_id: "",
    email: "",
    gender: "" as "" | "male" | "female" | "other",
    date_of_birth: "",
    blood_type: "",
    marital_status: "",
    nationality: "",
    city: "",
    address: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    notes: "",
  });

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.branch_id) return toast.error("اختر الفرع");
    if (!form.full_name_ar.trim()) return toast.error("الاسم بالعربية مطلوب");
    if (!/^\+?\d{6,15}$/.test(form.phone.replace(/\s/g, "")))
      return toast.error("رقم الجوال غير صالح");

    setSaving(true);
    try {
      const { mrn } = await generateMrnFn({ data: { branchId: form.branch_id } });
      const { data: user } = await supabase.auth.getUser();
      const payload: any = {
        branch_id: form.branch_id,
        mrn,
        full_name_ar: form.full_name_ar.trim(),
        full_name_en: form.full_name_en.trim() || null,
        phone: form.phone.trim(),
        secondary_phone: form.secondary_phone.trim() || null,
        national_id: form.national_id.trim() || null,
        email: form.email.trim() || null,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        blood_type: form.blood_type.trim() || null,
        marital_status: form.marital_status.trim() || null,
        nationality: form.nationality.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        notes: form.notes.trim() || null,
        created_by: user.user?.id ?? null,
      };
      const { error } = await supabase.from("patients").insert(payload);
      if (error) throw error;
      toast.success(`تم إنشاء الملف: ${mrn}`);
      onCreated();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر الإنشاء");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 overflow-auto">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">ملف مريض جديد</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground">
            ×
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-auto">
          <Field label="الفرع *" required>
            <select
              value={form.branch_id}
              onChange={(e) => update("branch_id", e.target.value)}
              className="input"
              required
            >
              <option value="">اختر</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الاسم بالعربية *" required>
            <input
              value={form.full_name_ar}
              onChange={(e) => update("full_name_ar", e.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input
              value={form.full_name_en}
              onChange={(e) => update("full_name_en", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="رقم الجوال *" required>
            <input
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className="input"
              inputMode="tel"
              required
            />
          </Field>
          <Field label="جوال بديل">
            <input
              value={form.secondary_phone}
              onChange={(e) => update("secondary_phone", e.target.value)}
              className="input"
              inputMode="tel"
            />
          </Field>
          <Field label="رقم الهوية / الإقامة">
            <input
              value={form.national_id}
              onChange={(e) => update("national_id", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="البريد الإلكتروني">
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="الجنس">
            <select
              value={form.gender}
              onChange={(e) => update("gender", e.target.value)}
              className="input"
            >
              <option value="">—</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
              <option value="other">آخر</option>
            </select>
          </Field>
          <Field label="تاريخ الميلاد">
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
              className="input"
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="فصيلة الدم">
            <select
              value={form.blood_type}
              onChange={(e) => update("blood_type", e.target.value)}
              className="input"
            >
              <option value="">—</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="الجنسية">
            <input
              value={form.nationality}
              onChange={(e) => update("nationality", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="المدينة">
            <input
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="الحالة الاجتماعية">
            <input
              value={form.marital_status}
              onChange={(e) => update("marital_status", e.target.value)}
              className="input"
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="العنوان">
              <input
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                className="input"
              />
            </Field>
          </div>
          <Field label="جهة اتصال طوارئ — الاسم">
            <input
              value={form.emergency_contact_name}
              onChange={(e) => update("emergency_contact_name", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="جهة اتصال طوارئ — الجوال">
            <input
              value={form.emergency_contact_phone}
              onChange={(e) => update("emergency_contact_phone", e.target.value)}
              className="input"
              inputMode="tel"
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="ملاحظات">
              <textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                className="input min-h-20"
              />
            </Field>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm"
          >
            إلغاء
          </button>
          <button
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
          </button>
        </div>
      </form>
      <style>{`.input{width:100%;border:1px solid hsl(var(--input));background:hsl(var(--background));border-radius:6px;padding:0.5rem 0.75rem;font-size:0.875rem}`}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}
