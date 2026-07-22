import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquareWarning,
  Plus,
  RefreshCw,
  Radio,
  Copy,
  ChevronRight,
  X,
  Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  editMyComplaint,
  getMyComplaintAttachmentUrls,
  listMyComplaints,
  submitMyComplaint,
} from "@/lib/complaints.functions";
import { getMyProfile } from "@/lib/portal/portal.functions";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderProgressSteps } from "@/components/OrderProgressSteps";

export const Route = createFileRoute("/_authenticated/portal/complaints")({
  head: () => ({
    meta: [
      { title: "بلاغاتي — بوابة المريض" },
      { name: "description", content: "شكاواي ومقترحاتي وحالتها الحالية." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyComplaintsPage,
});

const TYPE_AR: Record<string, string> = {
  complaint: "شكوى",
  suggestion: "اقتراح",
  thanks: "شكر",
  inquiry: "استفسار",
};

function MyComplaintsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyComplaints);
  const submitFn = useServerFn(submitMyComplaint);
  const profileFn = useServerFn(getMyProfile);

  const listQuery = useQuery({
    queryKey: ["portal", "my-complaints"],
    queryFn: () => listFn(),
  });
  const profileQuery = useQuery({
    queryKey: ["portal", "my-profile"],
    queryFn: () => profileFn(),
    staleTime: 60_000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [live, setLive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // Realtime — refresh on any change to the user's complaints.
  useEffect(() => {
    const uid = profileQuery.data?.id;
    if (!uid) return;
    const ch = supabase
      .channel(`my-complaints-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
          filter: `patient_user_id=eq.${uid}`,
        },
        () => qc.invalidateQueries({ queryKey: ["portal", "my-complaints"] }),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(ch);
      setLive(false);
    };
  }, [profileQuery.data?.id, qc]);

  const rows = listQuery.data ?? [];
  const filteredRows = useMemo(() => {
    const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);
    const sorted = [...filtered].sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });
    return sorted;
  }, [rows, statusFilter, sortOrder]);
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareWarning className="h-6 w-6 text-primary" />
            بلاغاتي
          </h1>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
            <Radio className={`h-3 w-3 ${live ? "text-green-600 animate-pulse" : ""}`} />
            {live ? "تحديث مباشر" : "غير متصل"} · {filteredRows.length} من {rows.length} بلاغ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => listQuery.refetch()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> بلاغ جديد
          </button>
        </div>
      </header>

      {listQuery.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState onNew={() => setShowForm(true)} />
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap rounded-xl border border-border bg-card p-3">
            <label className="text-xs text-muted-foreground">الحالة</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="all">الكل</option>
              <option value="submitted">تم الإرسال</option>
              <option value="under_review">تحت المراجعة</option>
              <option value="waiting_patient">بانتظار إجراء منك</option>
              <option value="resolved">تم الحل</option>
              <option value="closed">مغلق</option>
            </select>
            <label className="text-xs text-muted-foreground ms-2">الترتيب</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="newest">الأحدث أولاً</option>
              <option value="oldest">الأقدم أولاً</option>
            </select>
            {statusFilter !== "all" && (
              <button
                onClick={() => setStatusFilter("all")}
                className="ms-auto text-xs text-primary hover:underline"
              >
                مسح الفلاتر
              </button>
            )}
          </div>
          {filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              لا توجد بلاغات مطابقة للفلتر الحالي.
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredRows.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="w-full text-start rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.reference}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                          {TYPE_AR[r.type] ?? r.type}
                        </span>
                        {r.department && (
                          <span className="text-xs text-muted-foreground">· {r.department}</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm line-clamp-2 text-muted-foreground">{r.message}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <OrderStatusBadge kind="complaint" status={r.status} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {selected && (
        <Modal onClose={() => setSelectedId(null)} title={`بلاغ ${selected.reference}`}>
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <OrderStatusBadge kind="complaint" status={selected.status} />
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                {TYPE_AR[selected.type] ?? selected.type}
              </span>
              {selected.department && (
                <span className="text-xs text-muted-foreground">· {selected.department}</span>
              )}
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(selected.reference);
                  toast.success("تم نسخ الرقم");
                }}
                className="ms-auto inline-flex items-center gap-1 text-xs text-primary"
              >
                <Copy className="h-3.5 w-3.5" /> نسخ الرقم
              </button>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">مراحل معالجة البلاغ</p>
              <OrderProgressSteps kind="complaint" status={selected.status} />
              {selected.status === "waiting_patient" && (
                <p className="mt-2 text-xs text-orange-700 bg-orange-500/10 border border-orange-500/30 rounded p-2">
                  يحتاج البلاغ إجراءً منك — يرجى مراجعة تفاصيلك أو التواصل مع فريق تجربة المريض.
                </p>
              )}
            </div>

            <EditableMessage
              id={selected.id}
              status={selected.status}
              message={selected.message}
              department={selected.department}
              onSaved={() => qc.invalidateQueries({ queryKey: ["portal", "my-complaints"] })}
            />

            <AttachmentsList
              complaintId={selected.id}
              attachments={
                Array.isArray((selected as unknown as { attachments?: unknown }).attachments)
                  ? (
                      selected as unknown as {
                        attachments: Array<{
                          path: string;
                          name: string;
                          type?: string;
                          size?: number;
                        }>;
                      }
                    ).attachments
                  : []
              }
            />

            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div>
                <p>تاريخ الإرسال</p>
                <p className="text-foreground mt-0.5">
                  {new Date(selected.created_at).toLocaleString("ar-SA")}
                </p>
              </div>
              <div>
                <p>آخر تحديث</p>
                <p className="text-foreground mt-0.5">
                  {new Date(selected.updated_at).toLocaleString("ar-SA")}
                </p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* New complaint modal */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} title="إرسال بلاغ جديد">
          <NewComplaintForm
            defaultName={profileQuery.data?.full_name ?? ""}
            defaultPhone={profileQuery.data?.phone ?? ""}
            defaultEmail=""
            submitFn={submitFn}
            onDone={() => {
              setShowForm(false);
              qc.invalidateQueries({ queryKey: ["portal", "my-complaints"] });
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <MessageSquareWarning className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-3 font-bold">لا توجد بلاغات بعد</h3>
      <p className="text-sm text-muted-foreground mt-1">
        شاركنا شكواك أو اقتراحك — نتواصل معك خلال 48 ساعة عمل.
      </p>
      <button
        onClick={onNew}
        className="mt-4 inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        <Plus className="h-4 w-4" /> إرسال بلاغ
      </button>
    </div>
  );
}

function NewComplaintForm({
  defaultName,
  defaultPhone,
  defaultEmail,
  submitFn,
  onDone,
}: {
  defaultName: string;
  defaultPhone: string;
  defaultEmail: string;
  submitFn: ReturnType<typeof useServerFn<typeof submitMyComplaint>>;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: defaultName,
    phone: defaultPhone,
    email: defaultEmail,
    type: "complaint" as "complaint" | "suggestion" | "thanks" | "inquiry",
    department: "",
    message: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const MAX_FILES = 5;
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB per file

  async function uploadAll(): Promise<
    Array<{ path: string; name: string; type: string; size: number }>
  > {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid || files.length === 0) return [];
    const uploaded: Array<{ path: string; name: string; type: string; size: number }> = [];
    for (const f of files) {
      if (f.size > MAX_SIZE) throw new Error(`الملف "${f.name}" يتجاوز 10 ميجابايت.`);
      const safeName = f.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
      const path = `${uid}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage
        .from("complaint-attachments")
        .upload(path, f, { contentType: f.type || "application/octet-stream" });
      if (error) throw new Error(`تعذّر رفع "${f.name}".`);
      uploaded.push({ path, name: f.name, type: f.type || "", size: f.size });
    }
    return uploaded;
  }

  const mut = useMutation({
    mutationFn: async (input: typeof form) => {
      setUploading(true);
      try {
        const attachments = await uploadAll();
        return await submitFn({ data: { ...input, attachments } });
      } finally {
        setUploading(false);
      }
    },
    onSuccess: (res) => {
      toast.success(`تم إرسال البلاغ — رقم ${res.reference}`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message || "تعذّر الإرسال."),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate(form);
      }}
      className="grid gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium">الاسم</span>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">رقم الجوال</span>
          <input
            required
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium">النوع</span>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="complaint">شكوى</option>
            <option value="suggestion">اقتراح</option>
            <option value="thanks">شكر</option>
            <option value="inquiry">استفسار</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">القسم (اختياري)</span>
          <input
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            placeholder="الاستقبال، المختبر، الأشعة…"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="text-sm">
        <span className="font-medium">التفاصيل</span>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <div className="text-sm">
        <span className="font-medium">مرفقات (اختياري)</span>
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []).slice(0, MAX_FILES);
            setFiles(list);
          }}
          className="mt-1 w-full text-xs file:me-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-primary"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          حتى {MAX_FILES} ملفات، الحد الأقصى 10 ميجابايت لكل ملف (صور أو PDF).
        </p>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-xs rounded border border-border px-2 py-1"
              >
                <span className="truncate">{f.name}</span>
                <span className="text-muted-foreground shrink-0 ms-2">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        disabled={mut.isPending || uploading}
        className="rounded-md bg-primary text-primary-foreground font-semibold py-2.5 disabled:opacity-60"
      >
        {uploading ? "جارٍ رفع المرفقات…" : mut.isPending ? "جارٍ الإرسال…" : "إرسال البلاغ"}
      </button>
    </form>
  );
}

function EditableMessage({
  id,
  status,
  message,
  department,
  onSaved,
}: {
  id: string;
  status: string;
  message: string;
  department: string | null;
  onSaved: () => void;
}) {
  const editFn = useServerFn(editMyComplaint);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState(message);
  const [dept, setDept] = useState(department ?? "");
  const canEdit = status === "submitted";

  // Reset local state when the selected complaint changes.
  useEffect(() => {
    setMsg(message);
    setDept(department ?? "");
    setEditing(false);
  }, [id, message, department]);

  const mut = useMutation({
    mutationFn: () => editFn({ data: { id, message: msg, department: dept } }),
    onSuccess: () => {
      toast.success("تم تعديل البلاغ");
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message || "تعذّر التعديل."),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">الرسالة</p>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" /> تعديل
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <input
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            placeholder="القسم (اختياري)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            rows={5}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              disabled={mut.isPending || msg.trim().length < 10}
              onClick={() => mut.mutate()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {mut.isPending ? "جارٍ الحفظ…" : "حفظ التعديل"}
            </button>
            <button
              onClick={() => {
                setMsg(message);
                setDept(department ?? "");
                setEditing(false);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs"
            >
              إلغاء
            </button>
            <span className="text-[11px] text-muted-foreground ms-auto">
              متاح حتى تبدأ المراجعة
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-muted/30 p-3 whitespace-pre-wrap">
          {message}
        </div>
      )}
      {!canEdit && (
        <p className="mt-1 text-[11px] text-muted-foreground">لا يمكن التعديل بعد بدء المراجعة.</p>
      )}
    </div>
  );
}

function Modal({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function AttachmentsList({
  complaintId,
  attachments,
}: {
  complaintId: string;
  attachments: Array<{ path: string; name: string; type?: string; size?: number }>;
}) {
  const signFn = useServerFn(getMyComplaintAttachmentUrls);
  const q = useQuery({
    queryKey: ["portal", "complaint-attachments", complaintId],
    queryFn: () => signFn({ data: { id: complaintId } }),
    enabled: attachments.length > 0,
    staleTime: 5 * 60_000,
  });

  if (attachments.length === 0) return null;

  const items = q.data ?? attachments.map((a) => ({ ...a, url: null as string | null }));

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">المرفقات ({attachments.length})</p>
      <ul className="space-y-1">
        {items.map((a, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-2 rounded border border-border bg-muted/30 px-3 py-2 text-xs"
          >
            <span className="truncate">{a.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              {typeof a.size === "number" && (
                <span className="text-muted-foreground">{(a.size / 1024).toFixed(0)} KB</span>
              )}
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  عرض
                </a>
              ) : (
                <span className="text-muted-foreground">{q.isLoading ? "…" : "غير متاح"}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
