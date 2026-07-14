import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, RefreshCw } from "lucide-react";
import {
  listSecondOpinionRequests,
  updateSecondOpinionRequest,
  getSecondOpinionAttachmentUrls,
  type SecondOpinionStatus,
} from "@/lib/second-opinion-admin.functions";

export const Route = createFileRoute("/_authenticated/second-opinion-admin")({
  head: () => ({
    meta: [
      { title: "إدارة طلبات الرأي الطبي الثاني | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container mx-auto p-6">
      <p className="text-destructive">حدث خطأ: {error.message}</p>
      <button onClick={reset} className="mt-2 rounded-md border px-3 py-1.5 text-sm">إعادة المحاولة</button>
    </div>
  ),
  notFoundComponent: () => <div className="container mx-auto p-6">الصفحة غير موجودة</div>,
  component: SecondOpinionAdminPage,
});

const STATUS_LABELS: Record<SecondOpinionStatus, string> = {
  received: "مستلم",
  reviewing: "قيد المراجعة",
  accepted: "مقبول",
  rejected: "مرفوض",
};

const STATUS_STYLES: Record<SecondOpinionStatus, string> = {
  received: "bg-teal-100 text-teal-800",
  reviewing: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

type Row = {
  id: string;
  patient_name: string;
  phone: string;
  email: string | null;
  specialty: string | null;
  summary: string | null;
  upload_paths: string[] | null;
  status: SecondOpinionStatus;
  admin_notes: string | null;
  created_at: string;
};

function SecondOpinionAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSecondOpinionRequests);
  const updateFn = useServerFn(updateSecondOpinionRequest);
  const urlsFn = useServerFn(getSecondOpinionAttachmentUrls);

  const [filter, setFilter] = useState<SecondOpinionStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, { path: string; url: string | null }[]>>({});
  const [loadingAtt, setLoadingAtt] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["second-opinion-admin", filter],
    queryFn: () => listFn({ data: { status: filter } }) as Promise<Row[]>,
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; status?: SecondOpinionStatus; admin_notes?: string | null }) =>
      updateFn({ data: vars }),
    onSuccess: () => {
      toast.success("تم التحديث");
      qc.invalidateQueries({ queryKey: ["second-opinion-admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل التحديث"),
  });

  async function loadAttachments(row: Row) {
    if (!row.upload_paths?.length) return;
    if (attachments[row.id]) return;
    setLoadingAtt(row.id);
    try {
      const res = await urlsFn({ data: { paths: row.upload_paths } });
      setAttachments((s) => ({ ...s, [row.id]: res }));
    } catch (e: any) {
      toast.error(e?.message ?? "فشل جلب المرفقات");
    } finally {
      setLoadingAtt(null);
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6" dir="rtl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">طلبات الرأي الطبي الثاني</h1>
          <p className="text-sm text-muted-foreground">مراجعة الطلبات وتغيير حالتها وعرض المرفقات</p>
        </div>
        <Link to="/admin" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> رجوع
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["all", ...(Object.keys(STATUS_LABELS) as SecondOpinionStatus[])] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-md border px-3 py-1.5 text-sm ${filter === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {s === "all" ? "الكل" : STATUS_LABELS[s]}
          </button>
        ))}
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["second-opinion-admin"] })}
          className="ms-auto inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...
        </div>
      ) : listQ.isError ? (
        <p className="text-destructive">تعذّر جلب الطلبات: {(listQ.error as Error).message}</p>
      ) : !listQ.data?.length ? (
        <p className="text-muted-foreground">لا توجد طلبات مطابقة.</p>
      ) : (
        <div className="space-y-3">
          {listQ.data.map((row) => {
            const isOpen = openId === row.id;
            const notes = notesDraft[row.id] ?? row.admin_notes ?? "";
            return (
              <div key={row.id} className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{row.patient_name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[row.status]}`}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString("ar-SA")} · {row.phone}
                      {row.email ? ` · ${row.email}` : ""}
                      {row.specialty ? ` · ${row.specialty}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        updateMut.mutate({ id: row.id, status: e.target.value as SecondOpinionStatus })
                      }
                      disabled={updateMut.isPending}
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                    >
                      {(Object.keys(STATUS_LABELS) as SecondOpinionStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const next = isOpen ? null : row.id;
                        setOpenId(next);
                        if (next) loadAttachments(row);
                      }}
                      className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
                    >
                      {isOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    <div>
                      <div className="mb-1 text-sm font-medium">ملخص الحالة</div>
                      <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
                        {row.summary || "—"}
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 text-sm font-medium">
                        المرفقات ({row.upload_paths?.length ?? 0})
                      </div>
                      {loadingAtt === row.id ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل الروابط...
                        </div>
                      ) : !row.upload_paths?.length ? (
                        <p className="text-sm text-muted-foreground">لا توجد مرفقات</p>
                      ) : (
                        <ul className="space-y-1">
                          {(attachments[row.id] ?? []).map((a) => (
                            <li key={a.path}>
                              {a.url ? (
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                >
                                  <FileText className="h-4 w-4" />
                                  {a.path.split("/").pop()}
                                </a>
                              ) : (
                                <span className="text-sm text-muted-foreground">{a.path} (تعذّر إنشاء الرابط)</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">ملاحظات إدارية</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotesDraft((s) => ({ ...s, [row.id]: e.target.value }))}
                        rows={3}
                        maxLength={2000}
                        className="w-full rounded-md border bg-background p-2 text-sm"
                        placeholder="ملاحظات داخلية للفريق..."
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() =>
                            setNotesDraft((s) => ({ ...s, [row.id]: row.admin_notes ?? "" }))
                          }
                          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          إلغاء
                        </button>
                        <button
                          onClick={() =>
                            updateMut.mutate({ id: row.id, admin_notes: notes.trim() || null })
                          }
                          disabled={updateMut.isPending}
                          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                        >
                          حفظ الملاحظات
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
