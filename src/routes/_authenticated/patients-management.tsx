import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listPatientsAdvanced,
  updatePatientStatus,
  bulkUpdatePatientStatus,
  updatePatientTags,
  listPatientTags,
  type PatientRow,
  type PatientStatus,
} from "@/lib/patients-mgmt.functions";
import { listBranches } from "@/lib/dashboard.functions";
import {
  Users,
  Search,
  Loader2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  CheckSquare,
  Square,
  Tag as TagIcon,
  UserCheck,
  UserX,
  Archive,
  HeartOff,
  Save,
  MoreVertical,
} from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/patients-management")({
  head: () => ({
    meta: [
      { title: "إدارة المرضى المتقدمة | مجمع باعشن الطبي" },
      { name: "description", content: "إدارة متقدمة للمرضى مع فلاتر وسير عمل تحديث الحالة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="patients.view">
      <PatientsManagement />
    </RequirePermission>
  ),
});

const STATUS_META: Record<
  PatientStatus,
  { ar: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  active: {
    ar: "نشط",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: UserCheck,
  },
  inactive: {
    ar: "غير نشط",
    className: "bg-amber-100 text-amber-700 border-amber-200",
    icon: UserX,
  },
  archived: {
    ar: "مؤرشف",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Archive,
  },
  deceased: { ar: "متوفى", className: "bg-rose-100 text-rose-700 border-rose-200", icon: HeartOff },
};

const STATUS_LIST: PatientStatus[] = ["active", "inactive", "archived", "deceased"];

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

function PatientsManagement() {
  const qc = useQueryClient();

  // Filters
  const [q, setQ] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState<PatientStatus | "">("");
  const [gender, setGender] = useState<"" | "male" | "female" | "other">("");
  const [tag, setTag] = useState("");
  const [minAge, setMinAge] = useState<string>("");
  const [maxAge, setMaxAge] = useState<string>("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusEditor, setStatusEditor] = useState<{ patient: PatientRow } | null>(null);
  const [bulkEditor, setBulkEditor] = useState<PatientStatus | null>(null);
  const [tagsEditor, setTagsEditor] = useState<PatientRow | null>(null);

  const branchesFn = useServerFn(listBranches);
  const listFn = useServerFn(listPatientsAdvanced);
  const tagsFn = useServerFn(listPatientTags);

  const branchesQ = useQuery({ queryKey: ["pm", "branches"], queryFn: () => branchesFn() });
  const tagsQ = useQuery({ queryKey: ["pm", "tags"], queryFn: () => tagsFn() });
  const listQ = useQuery({
    queryKey: [
      "pm",
      "list",
      { q, branchId, status, gender, tag, minAge, maxAge, createdFrom, createdTo, page },
    ],
    queryFn: () =>
      listFn({
        data: {
          q: q.trim() || undefined,
          branchId: branchId || null,
          status: status || null,
          gender: gender || null,
          tag: tag || null,
          minAge: minAge ? Number(minAge) : null,
          maxAge: maxAge ? Number(maxAge) : null,
          createdFrom: createdFrom || null,
          createdTo: createdTo || null,
          page,
          pageSize,
        },
      }),
    staleTime: 15_000,
  });

  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const anySelected = selected.size > 0;
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const resetFilters = () => {
    setQ("");
    setBranchId("");
    setStatus("");
    setGender("");
    setTag("");
    setMinAge("");
    setMaxAge("");
    setCreatedFrom("");
    setCreatedTo("");
    setPage(1);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["pm"] });

  const activeFiltersCount = useMemo(
    () =>
      [q, branchId, status, gender, tag, minAge, maxAge, createdFrom, createdTo].filter(
        (v) => v && String(v).length > 0,
      ).length,
    [q, branchId, status, gender, tag, minAge, maxAge, createdFrom, createdTo],
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> رجوع
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> إدارة المرضى المتقدمة
              </h1>
              <p className="text-xs text-muted-foreground">
                فلاتر متقدمة، سير عمل تغيير الحالة، وسوم، وإجراءات جماعية
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/patients"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              العرض البسيط
            </Link>
            <Link
              to="/reports"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              التقارير
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" />
              الفلاتر
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {activeFiltersCount}
                </span>
              )}
            </div>
            {activeFiltersCount > 0 && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" /> مسح الفلاتر
              </button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium">بحث</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder="الاسم، الجوال، الهوية، رقم الملف…"
                  className="w-full rounded-md border border-input bg-background pr-10 pl-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">الفرع</label>
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">كل الفروع</option>
                {branchesQ.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_ar}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">الحالة</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as PatientStatus | "");
                  setPage(1);
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">كل الحالات</option>
                {STATUS_LIST.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].ar}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">الجنس</label>
              <select
                value={gender}
                onChange={(e) => {
                  setGender(e.target.value as typeof gender);
                  setPage(1);
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">الكل</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
                <option value="other">آخر</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">الوسم</label>
              <select
                value={tag}
                onChange={(e) => {
                  setTag(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">الكل</option>
                {tagsQ.data?.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium">من عمر</label>
                <input
                  type="number"
                  min={0}
                  max={150}
                  value={minAge}
                  onChange={(e) => {
                    setMinAge(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium">إلى</label>
                <input
                  type="number"
                  min={0}
                  max={150}
                  value={maxAge}
                  onChange={(e) => {
                    setMaxAge(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium">تسجيل من</label>
                <input
                  type="date"
                  value={createdFrom}
                  onChange={(e) => {
                    setCreatedFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium">إلى</label>
                <input
                  type="date"
                  value={createdTo}
                  onChange={(e) => {
                    setCreatedTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bulk action bar */}
        {anySelected && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
            <div>
              تم تحديد <b>{selected.size}</b> مريضًا
              <button
                onClick={() => setSelected(new Set())}
                className="mr-3 text-xs text-muted-foreground hover:text-destructive"
              >
                إلغاء التحديد
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted-foreground">تغيير الحالة إلى:</span>
              {STATUS_LIST.map((s) => {
                const M = STATUS_META[s];
                return (
                  <button
                    key={s}
                    onClick={() => setBulkEditor(s)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${M.className}`}
                  >
                    <M.icon className="h-3.5 w-3.5" />
                    {M.ar}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <button onClick={toggleAll} aria-label="تحديد الكل">
                    {allOnPageSelected ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-2">رقم الملف</th>
                <th className="px-3 py-2">الاسم</th>
                <th className="px-3 py-2">الجوال</th>
                <th className="px-3 py-2">العمر</th>
                <th className="px-3 py-2">الفرع</th>
                <th className="px-3 py-2">الحالة</th>
                <th className="px-3 py-2">الوسوم</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                    لا توجد نتائج
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const M = STATUS_META[r.status];
                  const isSel = selected.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`border-t ${isSel ? "bg-primary/5" : "hover:bg-muted/30"}`}
                    >
                      <td className="px-3 py-2">
                        <button onClick={() => toggleOne(r.id)} aria-label="تحديد">
                          {isSel ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.mrn}</td>
                      <td className="px-3 py-2">
                        <Link
                          to="/patients/$patientId"
                          params={{ patientId: r.id }}
                          className="font-medium hover:text-primary"
                        >
                          {r.full_name_ar}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.phone}</td>
                      <td className="px-3 py-2">{calcAge(r.date_of_birth) ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.branch_name_ar ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setStatusEditor({ patient: r })}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${M.className}`}
                        >
                          <M.icon className="h-3 w-3" />
                          {M.ar}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setTagsEditor(r)}
                          className="inline-flex flex-wrap items-center gap-1 text-xs hover:opacity-80"
                        >
                          {r.tags.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <TagIcon className="h-3 w-3" /> إضافة
                            </span>
                          ) : (
                            r.tags.slice(0, 3).map((t) => (
                              <span key={t} className="rounded bg-muted px-1.5 py-0.5">
                                {t}
                              </span>
                            ))
                          )}
                          {r.tags.length > 3 && (
                            <span className="text-muted-foreground">+{r.tags.length - 3}</span>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to="/patients/$patientId"
                          params={{ patientId: r.id }}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                          فتح
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-muted-foreground">
            المجموع: <b>{total}</b> — صفحة {page} من {totalPages}
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-input px-2 py-1 text-xs disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-input px-2 py-1 text-xs disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {statusEditor && (
        <StatusEditorDialog
          patient={statusEditor.patient}
          onClose={() => setStatusEditor(null)}
          onSaved={() => {
            setStatusEditor(null);
            invalidate();
          }}
        />
      )}
      {bulkEditor && (
        <BulkStatusDialog
          status={bulkEditor}
          ids={Array.from(selected)}
          onClose={() => setBulkEditor(null)}
          onSaved={(n) => {
            setBulkEditor(null);
            setSelected(new Set());
            invalidate();
            toast.success(`تم تحديث ${n} مريضًا`);
          }}
        />
      )}
      {tagsEditor && (
        <TagsEditorDialog
          patient={tagsEditor}
          existing={tagsQ.data ?? []}
          onClose={() => setTagsEditor(null)}
          onSaved={() => {
            setTagsEditor(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

// ---------- Dialogs ----------

function StatusEditorDialog({
  patient,
  onClose,
  onSaved,
}: {
  patient: PatientRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [next, setNext] = useState<PatientStatus>(patient.status);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const fn = useServerFn(updatePatientStatus);

  const requiresReason = next !== "active" && next !== patient.status;
  const changed = next !== patient.status;

  const save = async () => {
    if (!changed) return onClose();
    if (requiresReason && reason.trim().length < 3) {
      toast.error("السبب مطلوب (٣ أحرف على الأقل) عند تغيير الحالة");
      return;
    }
    setSaving(true);
    try {
      await fn({
        data: { patientId: patient.id, status: next, reason: reason.trim() || undefined },
      });
      toast.success(`تم تحديث حالة ${patient.full_name_ar}`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card border shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-bold">تحديث حالة المريض</h2>
          <button onClick={onClose} aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <div className="font-medium">{patient.full_name_ar}</div>
            <div className="text-xs text-muted-foreground">
              رقم الملف: {patient.mrn} — الحالة الحالية:{" "}
              <span className="font-medium">{STATUS_META[patient.status].ar}</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">الحالة الجديدة</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_LIST.map((s) => {
                const M = STATUS_META[s];
                return (
                  <button
                    key={s}
                    onClick={() => setNext(s)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      next === s
                        ? `${M.className} ring-2 ring-primary/40`
                        : "border-input hover:bg-muted"
                    }`}
                  >
                    <M.icon className="h-4 w-4" />
                    {M.ar}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              السبب {requiresReason && <span className="text-destructive">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={
                next === "deceased"
                  ? "أدخل ملاحظة (مثال: إبلاغ من ذوي المريض)"
                  : next === "archived"
                    ? "أدخل سبب الأرشفة"
                    : next === "inactive"
                      ? "سبب الإيقاف"
                      : "ملاحظة اختيارية"
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="mt-1 text-left text-xs text-muted-foreground">{reason.length}/500</div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            إلغاء
          </button>
          <button
            onClick={save}
            disabled={saving || !changed}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ التغييرات
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkStatusDialog({
  status,
  ids,
  onClose,
  onSaved,
}: {
  status: PatientStatus;
  ids: string[];
  onClose: () => void;
  onSaved: (n: number) => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const fn = useServerFn(bulkUpdatePatientStatus);
  const M = STATUS_META[status];

  const save = async () => {
    if (reason.trim().length < 3) {
      toast.error("السبب مطلوب للتغييرات الجماعية");
      return;
    }
    setSaving(true);
    try {
      const res = await fn({ data: { patientIds: ids, status, reason: reason.trim() } });
      onSaved(res.updated);
    } catch (e) {
      toast.error((e as Error).message ?? "تعذّر التحديث");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-bold">تغيير جماعي للحالة</h2>
          <button onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <div>
            سيتم تحديث <b>{ids.length}</b> مريضًا إلى الحالة:{" "}
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${M.className}`}
            >
              <M.icon className="h-3 w-3" /> {M.ar}
            </span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              السبب <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            سيتم تسجيل هذا التغيير في سجل التدقيق مع المعرّفات كاملة.
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            إلغاء
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            تأكيد التحديث
          </button>
        </div>
      </div>
    </div>
  );
}

function TagsEditorDialog({
  patient,
  existing,
  onClose,
  onSaved,
}: {
  patient: PatientRow;
  existing: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tags, setTags] = useState<string[]>([...patient.tags]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const fn = useServerFn(updatePatientTags);

  const addTag = (t: string) => {
    const v = t.trim();
    if (!v || tags.includes(v) || v.length > 40 || tags.length >= 20) return;
    setTags((prev) => [...prev, v]);
    setInput("");
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const save = async () => {
    setSaving(true);
    try {
      await fn({ data: { patientId: patient.id, tags } });
      toast.success("تم حفظ الوسوم");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const suggestions = existing.filter((t) => !tags.includes(t)).slice(0, 12);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card border shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-bold">وسوم المريض</h2>
          <button onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="text-sm">
            <div className="font-medium">{patient.full_name_ar}</div>
            <div className="text-xs text-muted-foreground">رقم الملف: {patient.mrn}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">الوسوم الحالية</label>
            <div className="flex flex-wrap gap-1 min-h-8">
              {tags.length === 0 && <span className="text-xs text-muted-foreground">لا يوجد</span>}
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary"
                >
                  {t}
                  <button onClick={() => removeTag(t)} aria-label="حذف">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">إضافة وسم</label>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(input);
                  }
                }}
                maxLength={40}
                placeholder="مثال: VIP، مزمن، حساسية…"
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => addTag(input)}
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
              >
                إضافة
              </button>
            </div>
          </div>
          {suggestions.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">اقتراحات:</div>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((t) => (
                  <button
                    key={t}
                    onClick={() => addTag(t)}
                    className="rounded-md border border-input px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            إلغاء
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ
          </button>
        </div>
      </div>
    </div>
  );
}
