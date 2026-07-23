import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  RefreshCw,
  UserCog,
  MessageSquarePlus,
  BellRing,
  CheckCircle2,
  XCircle,
  Link2,
  History,
  X,
} from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import {
  listAdminInquiries,
  getInquiryDetail,
  listAssignableStaff,
  assignInquiry,
  updateInquiryStatus,
  addInquiryNote,
  notifyInquiryPatient,
  closeInquiry,
} from "@/lib/admin/service-inquiries.functions";
import { InquiryAttachments } from "@/components/inquiry/InquiryAttachments";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const Route = createFileRoute("/_authenticated/admin/service-inquiries")({
  head: () => ({
    meta: [
      { title: "طلبات الواتساب واستفسارات الخدمات — لوحة الإدارة" },
      {
        name: "description",
        content: "متابعة استفسارات الخدمات الواردة من الواتساب وإدارة الحالات والتعيين.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf={["patients.view", "settings.manage"]}>
      <ServiceInquiriesAdminPage />
    </RequirePermission>
  ),
});

const STATUS_AR: Record<string, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  awaiting_patient: "بانتظار المريض",
  appointment_created: "تم إنشاء موعد",
  completed: "مكتمل",
  cancelled: "ملغى",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  contacted: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  awaiting_patient: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  appointment_created: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  completed: "bg-green-500/10 text-green-700 border-green-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};
const WA_AR: Record<string, string> = {
  not_opened: "لم يُفتح",
  opened: "فُتح",
  delivery_unverified: "غير مؤكد",
  delivered: "وُصل",
  failed: "فشل",
};
const SOURCE_AR: Record<string, string> = {
  website: "الموقع",
  mobile_web: "الجوال",
  patient_portal: "بوابة المريض",
  campaign: "حملة",
  direct_link: "رابط مباشر",
};
const STATUSES = [
  "new",
  "contacted",
  "awaiting_patient",
  "appointment_created",
  "completed",
  "cancelled",
] as const;
const UPDATE_TYPE_AR: Record<string, string> = {
  created: "إنشاء",
  status_change: "تغيير حالة",
  assignment: "تعيين",
  note: "ملاحظة داخلية",
  public_message: "رسالة للمريض",
  whatsapp_handoff: "تحويل واتساب",
  info_requested: "طلب معلومة",
  attachment: "مرفق",
  closed: "إغلاق",
  linked_appointment: "ربط موعد",
};

type Row = Awaited<ReturnType<typeof listAdminInquiries>>[number];

function ServiceInquiriesAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminInquiries);
  const staffFn = useServerFn(listAssignableStaff);

  const [filters, setFilters] = useState<{
    status?: string;
    whatsapp_status?: string;
    source?: string;
    assigned_to?: string;
    linked?: "linked" | "unlinked";
    search: string;
  }>({ search: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cleanFilters = useMemo(() => {
    const f: any = { limit: 200 };
    if (filters.status) f.status = filters.status;
    if (filters.whatsapp_status) f.whatsapp_status = filters.whatsapp_status;
    if (filters.source) f.source = filters.source;
    if (filters.assigned_to) f.assigned_to = filters.assigned_to;
    if (filters.linked) f.linked = filters.linked;
    if (filters.search.trim()) f.search = filters.search.trim();
    return f;
  }, [filters]);

  const listQuery = useQuery({
    queryKey: ["admin", "service-inquiries", cleanFilters],
    queryFn: () => listFn({ data: cleanFilters }),
    staleTime: 15_000,
  });

  const staffQuery = useQuery({
    queryKey: ["admin", "assignable-staff"],
    queryFn: () => staffFn(),
    staleTime: 60_000,
  });

  const rows = (listQuery.data ?? []) as Row[];
  const staffMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staffQuery.data ?? []) m.set(s.user_id, s.name ?? s.user_id.slice(0, 8));
    return m;
  }, [staffQuery.data]);

  return (
    <div className="admin-console p-4 lg:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">طلبات الواتساب واستفسارات الخدمات</h1>
          <p className="text-sm text-[color:var(--ac-muted)]">
            متابعة الاستفسارات القادمة من زر الواتساب وإدارتها من إنشاء الطلب إلى الإغلاق.
          </p>
        </div>
        <button
          onClick={() => listQuery.refetch()}
          className="inline-flex items-center gap-2 px-3 h-10 rounded-lg border border-[color:var(--ac-line)] text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[color:var(--ac-line)] bg-[color:var(--ac-surface)] p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="absolute top-3 start-3 h-4 w-4 text-[color:var(--ac-muted)]" />
          <input
            className="w-full h-10 ps-9 pe-3 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm"
            placeholder="رقم الطلب، الاسم، الجوال أو البريد"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <select
          className="h-10 px-2 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm"
          value={filters.status ?? ""}
          onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
        >
          <option value="">كل الحالات</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_AR[s]}
            </option>
          ))}
        </select>
        <select
          className="h-10 px-2 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm"
          value={filters.whatsapp_status ?? ""}
          onChange={(e) => setFilters({ ...filters, whatsapp_status: e.target.value || undefined })}
        >
          <option value="">حالة الواتساب</option>
          {Object.entries(WA_AR).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="h-10 px-2 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm"
          value={filters.assigned_to ?? ""}
          onChange={(e) => setFilters({ ...filters, assigned_to: e.target.value || undefined })}
        >
          <option value="">كل التعيينات</option>
          <option value="unassigned">— غير معيّن —</option>
          {(staffQuery.data ?? []).map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {s.name ?? s.user_id.slice(0, 8)}
            </option>
          ))}
        </select>
        <select
          className="h-10 px-2 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm"
          value={filters.linked ?? ""}
          onChange={(e) =>
            setFilters({
              ...filters,
              linked: (e.target.value as "linked" | "unlinked") || undefined,
            })
          }
        >
          <option value="">الحساب</option>
          <option value="linked">مرتبط بحساب</option>
          <option value="unlinked">غير مرتبط</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[color:var(--ac-line)] bg-[color:var(--ac-surface)] overflow-hidden">
        {listQuery.isLoading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ac-muted)]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[color:var(--ac-muted)]">
            لا توجد استفسارات مطابقة للفلاتر الحالية.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--ac-subtle)] text-[color:var(--ac-ink-3)]">
                <tr className="text-right">
                  <th className="px-3 py-2">#الطلب</th>
                  <th className="px-3 py-2">الاسم والجوال</th>
                  <th className="px-3 py-2">الخدمة</th>
                  <th className="px-3 py-2">الفرع</th>
                  <th className="px-3 py-2">المصدر</th>
                  <th className="px-3 py-2">واتساب</th>
                  <th className="px-3 py-2">الحساب</th>
                  <th className="px-3 py-2">مُعيَّن إلى</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">أُنشئ في</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="border-t border-[color:var(--ac-line)] cursor-pointer hover:bg-[color:var(--ac-subtle)]/50"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.request_number}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-[color:var(--ac-muted)] font-mono">
                        {r.mobile_e164}
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.service_name_ar ?? r.service_label}</td>
                    <td className="px-3 py-2">{r.branch_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{SOURCE_AR[r.source] ?? r.source}</td>
                    <td className="px-3 py-2 text-xs">
                      {WA_AR[r.whatsapp_handoff_status] ?? r.whatsapp_handoff_status}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.user_id ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <Link2 className="h-3 w-3" /> مرتبط
                        </span>
                      ) : (
                        <span className="text-[color:var(--ac-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.assigned_to ? (staffMap.get(r.assigned_to) ?? "…") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${
                          STATUS_COLOR[r.internal_status] ?? ""
                        }`}
                      >
                        {STATUS_AR[r.internal_status] ?? r.internal_status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("ar-SA")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId && (
        <InquiryDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["admin", "service-inquiries"] });
          }}
          staff={staffQuery.data ?? []}
        />
      )}
    </div>
  );
}

function InquiryDrawer({
  id,
  onClose,
  onChanged,
  staff,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  staff: Array<{ user_id: string; name: string | null; roles: string[] }>;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getInquiryDetail);
  const assignFn = useServerFn(assignInquiry);
  const statusFn = useServerFn(updateInquiryStatus);
  const noteFn = useServerFn(addInquiryNote);
  const notifyFn = useServerFn(notifyInquiryPatient);
  const closeFn = useServerFn(closeInquiry);

  const detailKey = ["admin", "service-inquiries", "detail", id] as const;
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => detailFn({ data: { id } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: detailKey });
    onChanged();
  };

  const assignMut = useMutation({
    mutationFn: (assigned_to: string | null) => assignFn({ data: { id, assigned_to } }),
    onSuccess: () => {
      toast.success("تم تحديث التعيين");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر التعيين"),
  });
  const statusMut = useMutation({
    mutationFn: (v: { status: (typeof STATUSES)[number]; reason?: string }) =>
      statusFn({ data: { id, ...v } }),
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر التحديث"),
  });
  const noteMut = useMutation({
    mutationFn: (v: { text: string; visibility: "internal" | "public" }) =>
      noteFn({ data: { id, ...v } }),
    onSuccess: () => {
      toast.success("تمت إضافة الملاحظة");
      setNoteText("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر حفظ الملاحظة"),
  });
  const notifyMut = useMutation({
    mutationFn: (v: { title: string; body: string }) => notifyFn({ data: { id, ...v } }),
    onSuccess: () => {
      toast.success("تم إرسال الإشعار");
      setNotifyTitle("");
      setNotifyBody("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إرسال الإشعار"),
  });
  const closeMut = useMutation({
    mutationFn: (v: { outcome: "completed" | "cancelled"; reason?: string }) =>
      closeFn({ data: { id, ...v } }),
    onSuccess: () => {
      toast.success("تم إغلاق الطلب");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إغلاق الطلب"),
  });

  const [noteText, setNoteText] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"internal" | "public">("internal");
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [reason, setReason] = useState("");

  const d = detailQuery.data;
  const inquiry: any = d?.inquiry ?? null;
  const timeline: any[] = d?.timeline ?? [];
  const isClosed = inquiry?.closed_at != null;
  const { can } = usePermissions();
  const branchId: string | null = inquiry?.branch_id ?? null;
  const canAssign = can(PERMISSIONS.ApptAssign, branchId);
  const canCancel = can(PERMISSIONS.ApptCancel, branchId);

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-full max-w-2xl h-full bg-[color:var(--ac-surface)] border-s border-[color:var(--ac-line)] overflow-y-auto">
        <header className="h-14 px-4 border-b border-[color:var(--ac-line)] flex items-center justify-between sticky top-0 bg-[color:var(--ac-surface)] z-10">
          <div className="text-sm font-semibold">
            {inquiry ? (
              <>
                طلب <span className="font-mono">{inquiry.request_number}</span>
              </>
            ) : (
              "تحميل…"
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-[color:var(--ac-subtle)]">
            <X className="h-5 w-5" />
          </button>
        </header>

        {detailQuery.isLoading || !inquiry ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ac-muted)]" />
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {/* Summary */}
            <section className="grid grid-cols-2 gap-3 text-sm">
              <Field label="المريض" value={inquiry.full_name} />
              <Field label="الجوال" value={inquiry.mobile_e164} mono />
              <Field label="البريد" value={inquiry.email ?? "—"} />
              <Field label="الخدمة" value={inquiry.service?.name_ar ?? inquiry.service_label} />
              <Field label="الفرع" value={inquiry.branches?.name_ar ?? "—"} />
              <Field label="المصدر" value={SOURCE_AR[inquiry.source] ?? inquiry.source} />
              <Field label="طريقة التواصل" value={inquiry.preferred_contact_method ?? "—"} />
              <Field label="التاريخ المفضّل" value={inquiry.preferred_date ?? "—"} />
              <Field
                label="حالة الواتساب"
                value={WA_AR[inquiry.whatsapp_handoff_status] ?? inquiry.whatsapp_handoff_status}
              />
              <Field label="الحساب" value={inquiry.user_id ? "مرتبط" : "غير مرتبط"} />
              <Field
                label="أُنشئ في"
                value={new Date(inquiry.created_at).toLocaleString("ar-SA")}
              />
              <Field
                label="أُغلق في"
                value={
                  inquiry.closed_at ? new Date(inquiry.closed_at).toLocaleString("ar-SA") : "—"
                }
              />
            </section>

            {inquiry.notes && (
              <div className="rounded-lg border border-[color:var(--ac-line)] p-3 text-sm bg-[color:var(--ac-subtle)]/40">
                <div className="text-xs text-[color:var(--ac-muted)] mb-1">ملاحظة المريض</div>
                <div>{inquiry.notes}</div>
              </div>
            )}

            {/* Actions */}
            <section className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UserCog className="h-4 w-4" /> التعيين والحالة
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs">
                  <span className="block mb-1 text-[color:var(--ac-muted)]">تعيين موظف</span>
                  <select
                    disabled={isClosed || assignMut.isPending || !canAssign}
                    title={!canAssign ? "لا تملك صلاحية تعيين الطلبات لهذا الفرع" : undefined}
                    className="w-full h-10 px-2 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm disabled:opacity-60"
                    value={inquiry.assigned_to ?? ""}
                    onChange={(e) => assignMut.mutate(e.target.value || null)}
                  >
                    <option value="">— غير معيّن —</option>
                    {staff.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.name ?? s.user_id.slice(0, 8)} · {s.roles.join(", ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="block mb-1 text-[color:var(--ac-muted)]">تغيير الحالة</span>
                  <select
                    disabled={isClosed || statusMut.isPending}
                    className="w-full h-10 px-2 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm disabled:opacity-60"
                    value={inquiry.internal_status}
                    onChange={(e) =>
                      statusMut.mutate({
                        status: e.target.value as (typeof STATUSES)[number],
                        reason: reason || undefined,
                      })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_AR[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className="sm:col-span-2 h-10 px-3 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm"
                  placeholder="سبب/ملاحظة اختيارية لتغيير الحالة"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isClosed}
                />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4" /> إضافة ملاحظة
              </h3>
              <textarea
                rows={3}
                className="w-full p-3 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm"
                placeholder="نص الملاحظة"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                disabled={isClosed}
              />
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="vis"
                    checked={noteVisibility === "internal"}
                    onChange={() => setNoteVisibility("internal")}
                  />
                  داخلية فقط
                </label>
                <label className="text-xs inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="vis"
                    checked={noteVisibility === "public"}
                    onChange={() => setNoteVisibility("public")}
                  />
                  ظاهرة للمريض
                </label>
                <button
                  onClick={() =>
                    noteMut.mutate({ text: noteText.trim(), visibility: noteVisibility })
                  }
                  disabled={isClosed || noteMut.isPending || !noteText.trim()}
                  className="ms-auto inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-[color:var(--ac-accent)] text-white text-sm disabled:opacity-50"
                >
                  {noteMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquarePlus className="h-4 w-4" />
                  )}
                  حفظ الملاحظة
                </button>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <BellRing className="h-4 w-4" /> إشعار داخل التطبيق للمريض
              </h3>
              {!inquiry.user_id && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  لم يتم ربط الاستفسار بحساب مريض بعد؛ لا يمكن إرسال إشعار داخل التطبيق.
                </div>
              )}
              <input
                className="w-full h-10 px-3 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm"
                placeholder="عنوان الإشعار"
                value={notifyTitle}
                onChange={(e) => setNotifyTitle(e.target.value)}
                disabled={isClosed || !inquiry.user_id}
              />
              <textarea
                rows={2}
                className="w-full p-3 rounded-lg border border-[color:var(--ac-line)] bg-transparent text-sm"
                placeholder="نص الإشعار"
                value={notifyBody}
                onChange={(e) => setNotifyBody(e.target.value)}
                disabled={isClosed || !inquiry.user_id}
              />
              <div className="flex justify-end">
                <button
                  onClick={() =>
                    notifyMut.mutate({ title: notifyTitle.trim(), body: notifyBody.trim() })
                  }
                  disabled={
                    isClosed ||
                    !inquiry.user_id ||
                    notifyMut.isPending ||
                    !notifyTitle.trim() ||
                    !notifyBody.trim()
                  }
                  className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-[color:var(--ac-accent)] text-white text-sm disabled:opacity-50"
                >
                  {notifyMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BellRing className="h-4 w-4" />
                  )}
                  إرسال الإشعار
                </button>
              </div>
            </section>

            <section className="flex gap-2">
              <button
                onClick={() =>
                  closeMut.mutate({ outcome: "completed", reason: reason || undefined })
                }
                disabled={isClosed || closeMut.isPending || !canCancel}
                title={!canCancel ? "لا تملك صلاحية إغلاق الطلبات لهذا الفرع" : undefined}
                className="inline-flex items-center gap-2 px-3 h-10 rounded-lg border border-emerald-500/40 text-emerald-700 text-sm disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> إغلاق كمكتمل
              </button>
              <button
                onClick={() =>
                  closeMut.mutate({ outcome: "cancelled", reason: reason || undefined })
                }
                disabled={isClosed || closeMut.isPending || !canCancel}
                title={!canCancel ? "لا تملك صلاحية إغلاق الطلبات لهذا الفرع" : undefined}
                className="inline-flex items-center gap-2 px-3 h-10 rounded-lg border border-red-500/40 text-red-700 text-sm disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" /> إغلاق كملغى
              </button>
              {!canCancel && !isClosed && (
                <span className="ms-auto text-xs text-[color:var(--ac-muted)] self-center">
                  لا تملك صلاحية الإغلاق لهذا الفرع.
                </span>
              )}
              {isClosed && (
                <span className="ms-auto text-xs text-[color:var(--ac-muted)] self-center">
                  الطلب مغلق — الإجراءات معطّلة.
                </span>
              )}
            </section>

            <section className="space-y-2">
              <InquiryAttachments inquiryId={id} />
            </section>

            {/* Audit timeline */}
            <section className="space-y-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <History className="h-4 w-4" /> سجل التدقيق
              </h3>
              {timeline.length === 0 ? (
                <div className="text-xs text-[color:var(--ac-muted)]">لا توجد أحداث بعد.</div>
              ) : (
                <ol className="space-y-2">
                  {timeline.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-lg border border-[color:var(--ac-line)] p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[color:var(--ac-ink-2)]">
                          {UPDATE_TYPE_AR[t.update_type] ?? t.update_type}
                        </span>
                        <span className="text-xs text-[color:var(--ac-muted)]">
                          {new Date(t.created_at).toLocaleString("ar-SA")}
                        </span>
                      </div>
                      {t.public_message && (
                        <div className="mt-1 whitespace-pre-wrap">{t.public_message}</div>
                      )}
                      {t.internal_note && (
                        <div className="mt-1 text-[color:var(--ac-ink-2)] whitespace-pre-wrap">
                          {t.internal_note}
                        </div>
                      )}
                      {t.metadata && Object.keys(t.metadata).length > 0 && (
                        <div className="mt-1 text-xs text-[color:var(--ac-muted)] font-mono break-all">
                          {formatMetadata(t.metadata)}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-[color:var(--ac-muted)]">
                        بواسطة:{" "}
                        {t.actor_name ?? (t.created_by ? t.created_by.slice(0, 8) : "النظام")}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[color:var(--ac-muted)] mb-0.5">{label}</div>
      <div className={mono ? "font-mono text-sm" : "text-sm"}>{value}</div>
    </div>
  );
}

function formatMetadata(m: Record<string, any>): string {
  return Object.entries(m)
    .map(
      ([k, v]) =>
        `${k}: ${v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}`,
    )
    .join(" · ");
}
