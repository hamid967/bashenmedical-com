import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, X, Stethoscope } from "lucide-react";
import {
  listAllDoctors,
  upsertDoctor,
  deleteDoctor,
  listSpecialtiesMini,
  type DoctorRecord,
} from "@/lib/doctors.functions";
import { listBranches } from "@/lib/dashboard.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import { Can } from "@/components/rbac/Can";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const Route = createFileRoute("/_authenticated/admin/doctors")({
  head: () => ({
    meta: [
      { title: "إدارة الأطباء (إضافة/تعديل) | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="doctors.manage">
      <AdminDoctorsPage />
    </RequirePermission>
  ),
});

const LANG_OPTIONS = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "الإنجليزية" },
  { value: "ur", label: "الأوردو" },
  { value: "hi", label: "الهندية" },
  { value: "fr", label: "الفرنسية" },
];

function AdminDoctorsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllDoctors);
  const upsertFn = useServerFn(upsertDoctor);
  const deleteFn = useServerFn(deleteDoctor);
  const branchesFn = useServerFn(listBranches);
  const specialtiesFn = useServerFn(listSpecialtiesMini);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<DoctorRecord> | null>(null);

  const doctorsQ = useQuery({ queryKey: ["admin", "doctors", "all"], queryFn: () => listFn() });
  const branchesQ = useQuery({ queryKey: ["admin", "branches"], queryFn: () => branchesFn() });
  const specialtiesQ = useQuery({
    queryKey: ["admin", "specialties"],
    queryFn: () => specialtiesFn(),
  });

  const filtered = useMemo(() => {
    const rows = doctorsQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (d) =>
        d.name_ar.toLowerCase().includes(q) ||
        d.name_en.toLowerCase().includes(q) ||
        (d.slug ?? "").toLowerCase().includes(q),
    );
  }, [doctorsQ.data, search]);

  const upsertM = useMutation({
    mutationFn: (v: Partial<DoctorRecord>) => upsertFn({ data: v as never }),
    onSuccess: () => {
      toast.success("تم الحفظ بنجاح");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin", "doctors"] });
      qc.invalidateQueries({ queryKey: ["dm"] });
    },
    onError: (e: Error) => toast.error(e.message || "فشل الحفظ"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["admin", "doctors"] });
    },
    onError: (e: Error) => toast.error(e.message || "فشل الحذف"),
  });

  const branches = branchesQ.data ?? [];
  const specialties = specialtiesQ.data ?? [];
  const branchName = (id: string | null) =>
    branches.find((b: any) => b.id === id)?.name_ar ?? "—";
  const specialtyName = (id: string | null) =>
    specialties.find((s: any) => s.id === id)?.name_ar ?? "—";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" />
            إدارة الأطباء
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إضافة وتعديل وحذف بطاقات الأطباء الظاهرة في الموقع.
          </p>
        </div>
        <button
          onClick={() =>
            setEditing({
              name_ar: "",
              name_en: "",
              is_active: true,
              booking_enabled: true,
              languages: ["ar", "en"],
              sort_order: 0,
            })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> إضافة طبيب
        </button>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو slug…"
          className="w-full rounded-lg border border-border bg-card ps-9 pe-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="text-start">
              <th className="p-3 text-start">الاسم</th>
              <th className="p-3 text-start">التخصص</th>
              <th className="p-3 text-start">الفرع</th>
              <th className="p-3 text-start">الحالة</th>
              <th className="p-3 text-start">الحجز</th>
              <th className="p-3 text-start"></th>
            </tr>
          </thead>
          <tbody>
            {doctorsQ.isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}
            {!doctorsQ.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  لا يوجد أطباء
                </td>
              </tr>
            )}
            {filtered.map((d) => (
              <tr key={d.id} className="border-t border-border hover:bg-muted/20">
                <td className="p-3">
                  <div className="font-medium">{d.name_ar}</div>
                  <div className="text-xs text-muted-foreground">{d.name_en}</div>
                </td>
                <td className="p-3">{specialtyName(d.specialty_id)}</td>
                <td className="p-3">{branchName(d.branch_id)}</td>
                <td className="p-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${d.is_active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}
                  >
                    {d.is_active ? "نشط" : "معطّل"}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${d.booking_enabled ? "bg-blue-100 text-blue-800" : "bg-muted text-muted-foreground"}`}
                  >
                    {d.booking_enabled ? "مفتوح" : "مغلق"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setEditing(d)}
                      className="rounded-md border border-border p-1.5 hover:bg-muted"
                      aria-label="تعديل"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <Can permission={PERMISSIONS.UsersManage}>
                      <button
                        onClick={() => {
                          if (confirm(`حذف الطبيب ${d.name_ar}؟`)) deleteM.mutate(d.id);
                        }}
                        className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10"
                        aria-label="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Can>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <DoctorFormDialog
          value={editing}
          branches={branches}
          specialties={specialties}
          saving={upsertM.isPending}
          onClose={() => setEditing(null)}
          onSave={(v) => upsertM.mutate(v)}
        />
      )}
    </div>
  );
}

function DoctorFormDialog({
  value,
  branches,
  specialties,
  saving,
  onClose,
  onSave,
}: {
  value: Partial<DoctorRecord>;
  branches: any[];
  specialties: any[];
  saving: boolean;
  onClose: () => void;
  onSave: (v: Partial<DoctorRecord>) => void;
}) {
  const [form, setForm] = useState<Partial<DoctorRecord>>(value);
  const set = <K extends keyof DoctorRecord>(k: K, v: DoctorRecord[K] | null) =>
    setForm((f) => ({ ...f, [k]: v as never }));

  const toggleLang = (l: string) => {
    const cur = new Set(form.languages ?? []);
    if (cur.has(l)) cur.delete(l);
    else cur.add(l);
    set("languages", Array.from(cur) as never);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Clean nullable empty strings
    const cleaned: any = { ...form };
    for (const k of ["title_ar", "title_en", "photo_url", "slug", "bio_ar", "bio_en"] as const) {
      if (cleaned[k] === "") cleaned[k] = null;
    }
    if (cleaned.years_experience === "" || cleaned.years_experience == null)
      cleaned.years_experience = null;
    else cleaned.years_experience = Number(cleaned.years_experience);
    if (cleaned.consultation_fee_sar === "" || cleaned.consultation_fee_sar == null)
      cleaned.consultation_fee_sar = null;
    else cleaned.consultation_fee_sar = Number(cleaned.consultation_fee_sar);
    cleaned.sort_order = Number(cleaned.sort_order ?? 0);
    onSave(cleaned);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-2xl bg-card rounded-2xl border border-border shadow-2xl my-8"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-lg">{form.id ? "تعديل طبيب" : "إضافة طبيب"}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الاسم بالعربية *">
            <input
              required
              value={form.name_ar ?? ""}
              onChange={(e) => set("name_ar", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Name (English) *">
            <input
              required
              value={form.name_en ?? ""}
              onChange={(e) => set("name_en", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="اللقب بالعربية">
            <input
              value={form.title_ar ?? ""}
              onChange={(e) => set("title_ar", e.target.value)}
              className="input"
              placeholder="د. / استشاري…"
            />
          </Field>
          <Field label="Title (English)">
            <input
              value={form.title_en ?? ""}
              onChange={(e) => set("title_en", e.target.value)}
              className="input"
              placeholder="Dr. / Consultant…"
            />
          </Field>
          <Field label="التخصص">
            <select
              value={form.specialty_id ?? ""}
              onChange={(e) => set("specialty_id", (e.target.value || null) as never)}
              className="input"
            >
              <option value="">— بدون —</option>
              {specialties.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الفرع">
            <select
              value={form.branch_id ?? ""}
              onChange={(e) => set("branch_id", (e.target.value || null) as never)}
              className="input"
            >
              <option value="">— بدون —</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الجنس">
            <select
              value={form.gender ?? ""}
              onChange={(e) => set("gender", (e.target.value || null) as never)}
              className="input"
            >
              <option value="">— غير محدد —</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </Field>
          <Field label="سنوات الخبرة">
            <input
              type="number"
              min={0}
              max={80}
              value={form.years_experience ?? ""}
              onChange={(e) => set("years_experience", e.target.value as never)}
              className="input"
            />
          </Field>
          <Field label="رابط الصورة (URL)">
            <input
              value={form.photo_url ?? ""}
              onChange={(e) => set("photo_url", e.target.value)}
              className="input"
              placeholder="https://…"
            />
          </Field>
          <Field label="Slug (اختياري)">
            <input
              value={form.slug ?? ""}
              onChange={(e) => set("slug", e.target.value)}
              className="input"
              placeholder="dr-name"
            />
          </Field>
          <Field label="سعر الكشف (SAR)">
            <input
              type="number"
              min={0}
              value={form.consultation_fee_sar ?? ""}
              onChange={(e) => set("consultation_fee_sar", e.target.value as never)}
              className="input"
            />
          </Field>
          <Field label="ترتيب العرض">
            <input
              type="number"
              value={form.sort_order ?? 0}
              onChange={(e) => set("sort_order", e.target.value as never)}
              className="input"
            />
          </Field>
          <Field label="اللغات" full>
            <div className="flex flex-wrap gap-2">
              {LANG_OPTIONS.map((l) => {
                const active = (form.languages ?? []).includes(l.value);
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => toggleLang(l.value)}
                    className={`rounded-full px-3 py-1 text-xs border ${active ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="السيرة (عربي)" full>
            <textarea
              rows={3}
              value={form.bio_ar ?? ""}
              onChange={(e) => set("bio_ar", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Bio (English)" full>
            <textarea
              rows={3}
              value={form.bio_en ?? ""}
              onChange={(e) => set("bio_en", e.target.value)}
              className="input"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active ?? true}
              onChange={(e) => set("is_active", e.target.checked as never)}
            />
            نشط (ظاهر في الموقع)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.booking_enabled ?? true}
              onChange={(e) => set("booking_enabled", e.target.checked as never)}
            />
            الحجز مفتوح
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
      </form>
      <style>{`.input{width:100%;border:1px solid hsl(var(--border));background:hsl(var(--background));border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;}`}</style>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
