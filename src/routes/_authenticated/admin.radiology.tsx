import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Scan, Search, Send, Trash2, Undo2, X } from "lucide-react";
import {
  listAdminRadiologyReports,
  upsertRadiologyReport,
  releaseRadiologyReport,
  unreleaseRadiologyReport,
  deleteRadiologyReport,
  type AdminRadiologyReport,
} from "@/lib/his/radiology.functions";
import { searchLabPatients } from "@/lib/his/lab.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/admin/radiology")({
  head: () => ({
    meta: [
      { title: "الأشعة | لوحة الإدارة" },
      { name: "description", content: "رفع تقارير الأشعة وإدارة إطلاقها في منظومة HIS." },
      { property: "og:title", content: "الأشعة | لوحة الإدارة" },
      { property: "og:description", content: "واجهة فني الأشعة لإدارة التقارير." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission role="admin" fallbackRole="doctor">
      <RadiologyAdminPage />
    </RequirePermission>
  ),
});

const MODALITIES = ["X-Ray", "CT", "MRI", "US", "Mammography", "PET", "Other"];
type StatusFilter = "all" | "pending" | "in_progress" | "released";

function RadiologyAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminRadiologyReports);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [modality, setModality] = useState<string>("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminRadiologyReport | "new" | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["his", "rad", status, modality, q],
    queryFn: () =>
      listFn({ data: { status, modality: modality || undefined, q: q || undefined } }),
    staleTime: 15_000,
  });

  const release = useServerFn(releaseRadiologyReport);
  const unrelease = useServerFn(unreleaseRadiologyReport);
  const del = useServerFn(deleteRadiologyReport);

  const releaseM = useMutation({
    mutationFn: (id: string) => release({ data: { id } }),
    onSuccess: () => {
      toast.success("تم إطلاق التقرير للمريض");
      qc.invalidateQueries({ queryKey: ["his", "rad"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unreleaseM = useMutation({
    mutationFn: (id: string) => unrelease({ data: { id } }),
    onSuccess: () => {
      toast.success("تم سحب الإطلاق");
      qc.invalidateQueries({ queryKey: ["his", "rad"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["his", "rad"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-4" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scan className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">الأشعة</h1>
          <span className="text-sm text-muted-foreground">({data?.total ?? 0} تقرير)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> تحديث
          </button>
          <button
            onClick={() => setEditing("new")}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm inline-flex items-center gap-1"
          >
            <Plus className="h-4 w-4" /> تقرير جديد
          </button>
        </div>
      </header>

      <div className="glass-card rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالنمط، الجزء، أو النتائج"
            className="w-full pr-8 pl-3 py-2 rounded-lg border bg-background text-sm"
          />
        </div>
        <select
          value={modality}
          onChange={(e) => setModality(e.target.value)}
          className="px-3 py-2 rounded-lg border bg-background text-sm"
        >
          <option value="">كل الأنماط</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="px-3 py-2 rounded-lg border bg-background text-sm"
        >
          <option value="all">كل الحالات</option>
          <option value="pending">قيد الانتظار</option>
          <option value="in_progress">قيد المعالجة</option>
          <option value="released">مُطلق</option>
        </select>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">لا توجد تقارير مطابقة.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="p-3 text-right">النمط</th>
                <th className="p-3 text-right">الجزء</th>
                <th className="p-3 text-right">المريض</th>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">{r.modality ?? "—"}</td>
                  <td className="p-3">{r.body_part ?? "—"}</td>
                  <td className="p-3">
                    {r.patient?.full_name_ar ?? "—"}
                    {r.patient?.mrn && <span className="text-xs text-muted-foreground"> · {r.patient.mrn}</span>}
                  </td>
                  <td className="p-3">{r.report_date ?? "—"}</td>
                  <td className="p-3">
                    {r.released_at ? (
                      <span className="text-xs bg-emerald-500/10 text-emerald-700 px-2 py-1 rounded">مُطلق</span>
                    ) : (
                      <span className="text-xs bg-amber-500/10 text-amber-700 px-2 py-1 rounded">{r.status ?? "pending"}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(r)} className="px-2 py-1 rounded border text-xs">تعديل</button>
                      {r.released_at ? (
                        <button
                          onClick={() => unreleaseM.mutate(r.id)}
                          className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"
                        >
                          <Undo2 className="h-3 w-3" /> سحب
                        </button>
                      ) : (
                        <button
                          onClick={() => releaseM.mutate(r.id)}
                          className="px-2 py-1 rounded bg-emerald-600 text-white text-xs inline-flex items-center gap-1"
                        >
                          <Send className="h-3 w-3" /> إطلاق
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm("حذف التقرير نهائياً؟")) deleteM.mutate(r.id);
                        }}
                        className="px-2 py-1 rounded border text-xs text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <RadEditor
          value={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["his", "rad"] });
          }}
        />
      )}
    </div>
  );
}

function RadEditor({
  value,
  onClose,
  onSaved,
}: {
  value: AdminRadiologyReport | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertRadiologyReport);
  const searchPatients = useServerFn(searchLabPatients);
  const [patientId, setPatientId] = useState(value?.patient_id ?? "");
  const [patientLabel, setPatientLabel] = useState(value?.patient?.full_name_ar ?? "");
  const [pq, setPq] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [modality, setModality] = useState(value?.modality ?? "X-Ray");
  const [bodyPart, setBodyPart] = useState(value?.body_part ?? "");
  const [findings, setFindings] = useState(value?.findings ?? "");
  const [status, setStatus] = useState<"pending" | "in_progress" | "released">(
    ((value?.status as any) ?? "pending"),
  );
  const [reportDate, setReportDate] = useState(value?.report_date ?? new Date().toISOString().slice(0, 10));
  const [filePath, setFilePath] = useState(value?.file_path ?? "");

  const patientQ = useQuery({
    queryKey: ["his", "rad", "patients", pq],
    queryFn: () => searchPatients({ data: { q: pq } }),
    enabled: pq.length >= 2,
    staleTime: 30_000,
  });

  const saveM = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: value?.id ?? null,
          patient_id: patientId,
          modality,
          body_part: bodyPart || null,
          findings: findings || null,
          status,
          report_date: reportDate || null,
          file_path: filePath || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = useMemo(
    () => patientId.length === 36 && modality.trim().length > 0,
    [patientId, modality],
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto" dir="rtl">
        <header className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">{value ? "تعديل تقرير أشعة" : "تقرير أشعة جديد"}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">المريض *</label>
            {patientId && patientLabel ? (
              <div className="flex items-center justify-between border rounded p-2">
                <span>{patientLabel}</span>
                <button
                  onClick={() => {
                    setPatientId("");
                    setPatientLabel("");
                    setShowPicker(true);
                  }}
                  className="text-xs text-primary"
                >
                  تغيير
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={pq}
                  onChange={(e) => {
                    setPq(e.target.value);
                    setShowPicker(true);
                  }}
                  placeholder="ابحث بالاسم / MRN / الجوال"
                  className="w-full px-3 py-2 rounded border bg-background text-sm"
                />
                {showPicker && patientQ.data?.rows?.length ? (
                  <ul className="absolute z-10 mt-1 w-full bg-background border rounded max-h-56 overflow-auto">
                    {patientQ.data.rows.map((p: any) => (
                      <li key={p.id}>
                        <button
                          className="w-full text-right px-3 py-2 hover:bg-muted text-sm"
                          onClick={() => {
                            setPatientId(p.id);
                            setPatientLabel(p.full_name_ar);
                            setShowPicker(false);
                          }}
                        >
                          {p.full_name_ar}
                          <span className="text-xs text-muted-foreground"> · {p.mrn ?? "بدون MRN"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">النمط *</label>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value)}
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              >
                {MODALITIES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">الجزء التشريحي</label>
              <input
                value={bodyPart}
                onChange={(e) => setBodyPart(e.target.value)}
                placeholder="الصدر، الرأس، ..."
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">تاريخ التقرير</label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">الحالة</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              >
                <option value="pending">قيد الانتظار</option>
                <option value="in_progress">قيد المعالجة</option>
                <option value="released">مكتمل</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">النتائج / التقرير</label>
            <textarea
              rows={5}
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">مسار الملف في التخزين (اختياري)</label>
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="radiology-reports/2026/..."
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
        </div>
        <footer className="p-4 border-t flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded border text-sm">إلغاء</button>
          <button
            onClick={() => saveM.mutate()}
            disabled={!canSave || saveM.isPending}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm inline-flex items-center gap-1 disabled:opacity-50"
          >
            {saveM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </button>
        </footer>
      </div>
    </div>
  );
}
