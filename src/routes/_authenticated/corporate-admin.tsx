import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Building2, Loader2, Mail, Phone, RefreshCw, Users } from "lucide-react";
import {
  listCorporateRequests,
  updateCorporateRequest,
  type CorporateRequestStatus,
} from "@/lib/corporate-admin.functions";

export const Route = createFileRoute("/_authenticated/corporate-admin")({
  head: () => ({
    meta: [
      { title: "إدارة طلبات الشركات | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container mx-auto p-6" dir="rtl">
      <p className="text-destructive">حدث خطأ: {error.message}</p>
      <button onClick={reset} className="mt-2 rounded-md border px-3 py-1.5 text-sm">
        إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container mx-auto p-6">الصفحة غير موجودة</div>
  ),
  component: CorporateAdminPage,
});

const STATUS_LABELS: Record<CorporateRequestStatus, string> = {
  received: "مستلم",
  reviewing: "قيد المراجعة",
  accepted: "مقبول",
  rejected: "مرفوض",
};

const STATUS_STYLES: Record<CorporateRequestStatus, string> = {
  received: "bg-teal-100 text-teal-800",
  reviewing: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

type Row = {
  id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string | null;
  employee_count: number | null;
  service_type: string | null;
  notes: string | null;
  status: CorporateRequestStatus;
  admin_notes: string | null;
  created_at: string;
};

function CorporateAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCorporateRequests);
  const updateFn = useServerFn(updateCorporateRequest);

  const [filter, setFilter] = useState<CorporateRequestStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const listQ = useQuery({
    queryKey: ["corporate-admin", filter],
    queryFn: () => listFn({ data: { status: filter } }) as Promise<Row[]>,
  });

  const updateMut = useMutation({
    mutationFn: (vars: {
      id: string;
      status?: CorporateRequestStatus;
      admin_notes?: string | null;
    }) => updateFn({ data: vars }),
    onSuccess: () => {
      toast.success("تم التحديث");
      qc.invalidateQueries({ queryKey: ["corporate-admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل التحديث"),
  });

  return (
    <div className="container mx-auto p-4 md:p-6" dir="rtl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">طلبات اتفاقيات الشركات</h1>
          <p className="text-sm text-muted-foreground">
            عرض الطلبات المرسلة، تفاصيلها، وتغيير حالتها مع تسجيل ملاحظات المراجعة
          </p>
        </div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> رجوع
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["all", ...(Object.keys(STATUS_LABELS) as CorporateRequestStatus[])] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              filter === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {s === "all" ? "الكل" : STATUS_LABELS[s]}
          </button>
        ))}
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["corporate-admin"] })}
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
        <p className="text-destructive">
          تعذّر جلب الطلبات: {(listQ.error as Error).message}
        </p>
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
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold">{row.company_name}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[row.status]}`}
                      >
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{new Date(row.created_at).toLocaleString("ar-SA")}</span>
                      <span>· جهة الاتصال: {row.contact_name}</span>
                      <span className="inline-flex items-center gap-1">
                        · <Phone className="h-3 w-3" /> {row.phone}
                      </span>
                      {row.email && (
                        <span className="inline-flex items-center gap-1">
                          · <Mail className="h-3 w-3" /> {row.email}
                        </span>
                      )}
                      {row.employee_count != null && (
                        <span className="inline-flex items-center gap-1">
                          · <Users className="h-3 w-3" /> {row.employee_count} موظف
                        </span>
                      )}
                      {row.service_type && <span>· {row.service_type}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        updateMut.mutate({
                          id: row.id,
                          status: e.target.value as CorporateRequestStatus,
                        })
                      }
                      disabled={updateMut.isPending}
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                    >
                      {(Object.keys(STATUS_LABELS) as CorporateRequestStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setOpenId(isOpen ? null : row.id)}
                      className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
                    >
                      {isOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    <div>
                      <div className="mb-1 text-sm font-medium">تفاصيل الطلب</div>
                      <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
                        {row.notes || "—"}
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 text-sm font-medium">
                        المرفقات
                      </div>
                      <p className="text-sm text-muted-foreground">
                        نموذج طلب الشركات الحالي لا يدعم رفع ملفات. لتفعيل ذلك، أضف عمود مرفقات
                        وحاوية تخزين مخصصة للطلبات.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">ملاحظات المراجعة</label>
                      <textarea
                        value={notes}
                        onChange={(e) =>
                          setNotesDraft((s) => ({ ...s, [row.id]: e.target.value }))
                        }
                        rows={4}
                        maxLength={2000}
                        className="w-full rounded-md border bg-background p-2 text-sm"
                        placeholder="ملاحظات داخلية للفريق حول هذا الطلب..."
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
                            updateMut.mutate({
                              id: row.id,
                              admin_notes: notes.trim() || null,
                            })
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
