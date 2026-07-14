import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Star,
  ArrowLeft,
  Trash2,
  Filter,
  Building2,
  Stethoscope,
  MessageSquare,
  Plus,
  QrCode,
  Download,
  Reply,
  CheckCircle2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getRatingsSummary,
  listRatings,
  deleteRating,
  replyToRating,
  listBranchesForRatings,
  listDoctorsForRatings,
} from "@/lib/ratings.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/ratings")({
  head: () => ({
    meta: [
      { title: "تقييمات المرضى | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RatingsPage,
});

function RatingsPage() {
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [days, setDays] = useState<number>(90);

  const summaryFn = useServerFn(getRatingsSummary);
  const listFn = useServerFn(listRatings);
  const deleteFn = useServerFn(deleteRating);
  const replyFn = useServerFn(replyToRating);
  const branchesFn = useServerFn(listBranchesForRatings);
  const doctorsFn = useServerFn(listDoctorsForRatings);

  const branchesQ = useQuery({ queryKey: ["ratings-branches"], queryFn: () => branchesFn(), staleTime: 60_000 });
  const doctorsQ = useQuery({ queryKey: ["ratings-doctors"], queryFn: () => doctorsFn(), staleTime: 60_000 });

  const summaryQ = useQuery({
    queryKey: ["ratings-summary", branchId, doctorId, days],
    queryFn: () => summaryFn({ data: { branchId, doctorId, days } }),
  });

  const listQ = useQuery({
    queryKey: ["ratings-list", branchId, doctorId, minRating],
    queryFn: () => listFn({ data: { branchId, doctorId, minRating, limit: 100 } }),
  });

  const filteredDoctors = useMemo(() => {
    const all = doctorsQ.data ?? [];
    return branchId ? all.filter((d) => d.branch_id === branchId) : all;
  }, [doctorsQ.data, branchId]);

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ratings-list"] });
      qc.invalidateQueries({ queryKey: ["ratings-summary"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replyM = useMutation({
    mutationFn: (v: { id: string; reply: string | null }) => replyFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ratings-list"] });
      toast.success("تم حفظ الرد");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const overall = useMemo(() => {
    const rows = summaryQ.data ?? [];
    if (rows.length === 0) return { avg: 0, count: 0 };
    const total = rows.reduce((s, r) => s + Number(r.avg_rating) * Number(r.ratings_count), 0);
    const count = rows.reduce((s, r) => s + Number(r.ratings_count), 0);
    return { avg: count ? total / count : 0, count };
  }, [summaryQ.data]);

  const listStats = useMemo(() => {
    const rows = listQ.data ?? [];
    const total = rows.length;
    const replied = rows.filter((r) => !!r.staff_reply).length;
    const negative = rows.filter((r) => r.rating <= 2).length;
    return { total, replied, negative, replyRate: total ? (replied / total) * 100 : 0 };
  }, [listQ.data]);

  return (
    <div className="container-app py-10 space-y-8" dir="rtl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Star className="h-6 w-6 shrink-0 text-amber-500" />
            <span className="truncate">تقييمات المرضى</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نتائج التقييمات العامة والداخلية — {overall.count} تقييم بمتوسط{" "}
            <span className="font-semibold text-foreground">{overall.avg.toFixed(2)}</span> نجمة.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/qr-cards"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 text-primary px-3 py-1.5 text-sm hover:bg-primary/10"
          >
            <QrCode className="h-4 w-4" /> بطاقات QR
          </Link>
          <Link to="/admin" className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
            <ArrowLeft className="h-4 w-4" /> لوحة التحكم
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="المتوسط العام" value={overall.avg.toFixed(2)} icon={<Star className="h-5 w-5 fill-amber-400 text-amber-400" />} tone="amber" />
        <KpiCard label="إجمالي التقييمات" value={String(overall.count)} icon={<MessageSquare className="h-5 w-5" />} tone="blue" />
        <KpiCard label="تقييمات سلبية (≤ 2)" value={String(listStats.negative)} icon={<Star className="h-5 w-5" />} tone="red" />
        <KpiCard label="معدل الرد" value={`${listStats.replyRate.toFixed(0)}%`} icon={<Reply className="h-5 w-5" />} tone="green" />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-muted-foreground">
          <Filter className="h-4 w-4" />
          الفلاتر
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
            <select value={branchId ?? ""} onChange={(e) => { setBranchId(e.target.value || null); setDoctorId(null); }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">كل الفروع</option>
              {(branchesQ.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الطبيب</label>
            <select value={doctorId ?? ""} onChange={(e) => setDoctorId(e.target.value || null)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">كل الأطباء</option>
              {filteredDoctors.map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الحد الأدنى للتقييم</label>
            <select value={minRating ?? ""} onChange={(e) => setMinRating(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">الكل</option>
              <option value="4">4 نجوم فأكثر</option>
              <option value="3">3 نجوم فأكثر</option>
              <option value="1">1-2 نجوم (سلبية)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الفترة</label>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {[30, 90, 180, 365].map((d) => <option key={d} value={d}>آخر {d} يوم</option>)}
            </select>
          </div>
        </div>
      </div>

      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="summary">الملخص</TabsTrigger>
          <TabsTrigger value="list">التقييمات ({(listQ.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="add">إضافة داخلية</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          {summaryQ.isLoading ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : (summaryQ.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
              لا توجد تقييمات ضمن الفلاتر المحددة.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(summaryQ.data ?? []).map((row) => (
                <SummaryCard key={`${row.scope}-${row.entity_id}`} row={row} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list">
          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : (listQ.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
              لا توجد تقييمات.
            </div>
          ) : (
            <div className="space-y-3">
              {(listQ.data ?? []).map((r) => (
                <RatingCard
                  key={r.id}
                  r={r}
                  onDelete={() => { if (confirm("حذف هذا التقييم؟")) deleteM.mutate(r.id); }}
                  onReply={(reply) => replyM.mutate({ id: r.id, reply })}
                  isReplying={replyM.isPending}
                />
              ))}
              <button
                onClick={() => exportRatingsCsv(listQ.data ?? [])}
                disabled={(listQ.data ?? []).length === 0}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
              >
                <Download className="h-4 w-4" /> تصدير CSV
              </button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="add">
          <StaffAddRating
            branches={branchesQ.data ?? []}
            doctors={doctorsQ.data ?? []}
            defaultBranchId={branchId}
            defaultDoctorId={doctorId}
            onSubmitted={() => {
              qc.invalidateQueries({ queryKey: ["ratings-list"] });
              qc.invalidateQueries({ queryKey: ["ratings-summary"] });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ row }: { row: import("@/lib/ratings.functions").RatingSummaryRow }) {
  const total = row.ratings_count;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">
            {row.scope === "doctor" ? "طبيب" : "فرع"}
          </p>
          <p className="text-sm font-bold truncate flex items-center gap-1.5">
            {row.scope === "doctor" ? <Stethoscope className="h-3.5 w-3.5 text-primary shrink-0" /> : <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />}
            {row.entity_name}
          </p>
        </div>
        <div className="text-left shrink-0">
          <p className="text-2xl font-bold text-amber-500">{Number(row.avg_rating).toFixed(2)}</p>
          <p className="text-[11px] text-muted-foreground">{total} تقييم</p>
        </div>
      </div>
      <div className="space-y-1" dir="ltr">
        {[5, 4, 3, 2, 1].map((n) => {
          const key = `stars_${n}` as `stars_${1 | 2 | 3 | 4 | 5}`;
          const count = Number(row[key]);
          const pct = total ? (count / total) * 100 : 0;
          return (
            <div key={n} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-right tabular-nums text-muted-foreground">{n}★</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 tabular-nums text-muted-foreground">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StaffAddRating({
  branches,
  doctors,
  defaultBranchId,
  defaultDoctorId,
  onSubmitted,
}: {
  branches: { id: string; name_ar: string }[];
  doctors: { id: string; name_ar: string; branch_id: string | null }[];
  defaultBranchId: string | null;
  defaultDoctorId: string | null;
  onSubmitted: () => void;
}) {
  const [branchId, setBranchId] = useState<string | null>(defaultBranchId);
  const [doctorId, setDoctorId] = useState<string | null>(defaultDoctorId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const filtered = branchId ? doctors.filter((d) => d.branch_id === branchId) : doctors;

  const submit = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("submit_public_rating", {
        _branch_id: branchId,
        _doctor_id: doctorId,
        _rating: rating,
        _comment: comment || null,
        _patient_name: name || null,
        _patient_phone: phone || null,
        _appointment_ref: null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success("تم تسجيل التقييم");
      setRating(0); setComment(""); setName(""); setPhone("");
      onSubmitted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = rating > 0 && (branchId || doctorId) && !submit.isPending;

  return (
    <div className="rounded-xl border border-border bg-card p-5 max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        تسجيل تقييم داخلي بناءً على ملاحظات المريض شفهيًا. سيُوسم كتقييم عام في السجل.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
          <select value={branchId ?? ""} onChange={(e) => { setBranchId(e.target.value || null); setDoctorId(null); }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">—</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الطبيب</label>
          <select value={doctorId ?? ""} onChange={(e) => setDoctorId(e.target.value || null)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">—</option>
            {filtered.map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">التقييم</label>
        <div className="flex gap-1" dir="ltr">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)}
              className="p-1 hover:scale-110 transition-transform">
              <Star className={`h-8 w-8 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">تعليق</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 1000))} rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 100))} placeholder="اسم المريض (اختياري)"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <input value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 20))} placeholder="الجوال (اختياري)" dir="ltr"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>
      <button onClick={() => submit.mutate()} disabled={!canSubmit}
        className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40">
        <Plus className="h-4 w-4" />
        {submit.isPending ? "جارٍ الحفظ…" : "حفظ التقييم"}
      </button>
    </div>
  );
}

function exportRatingsCsv(rows: Awaited<ReturnType<typeof listRatings>>) {
  const headers = ["التاريخ", "المصدر", "التقييم", "الفرع", "الطبيب", "الاسم", "الجوال", "التعليق"];
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) =>
    [
      new Date(r.created_at).toISOString(),
      r.source === "public" ? "عام" : "داخلي",
      r.rating,
      r.branch_name ?? "",
      r.doctor_name ?? "",
      r.patient_name ?? "",
      r.patient_phone ?? "",
      r.comment ?? "",
    ].map(esc).join(","),
  );
  const csv = "\uFEFF" + [headers.map(esc).join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `patient-ratings_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* -------------------------------- KPI Card -------------------------------- */

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "amber" | "blue" | "red" | "green";
}) {
  const toneMap = {
    amber: "from-amber-500/15 to-amber-500/5 text-amber-600 border-amber-500/30",
    blue: "from-teal-500/15 to-teal-500/5 text-teal-600 border-teal-500/30",
    red: "from-red-500/15 to-red-500/5 text-red-600 border-red-500/30",
    green: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 border-emerald-500/30",
  } as const;
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${toneMap[tone]} p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="opacity-80">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

/* ------------------------------ Rating Card ------------------------------ */

function RatingCard({
  r,
  onDelete,
  onReply,
  isReplying,
}: {
  r: import("@/lib/ratings.functions").RatingRow;
  onDelete: () => void;
  onReply: (reply: string | null) => void;
  isReplying: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(r.staff_reply ?? "");

  const save = () => {
    const clean = draft.trim();
    onReply(clean.length ? clean : null);
    setEditing(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
            ))}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${r.source === "public" ? "bg-teal-500/10 text-teal-700 border-teal-500/30" : "bg-teal-500/10 text-teal-700 border-teal-500/30"}`}>
              {r.source === "public" ? "عام" : "داخلي"}
            </span>
            {r.staff_reply && !editing && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3" /> تم الرد
              </span>
            )}
          </div>
          {(r.doctor_name || r.branch_name) && (
            <p className="text-xs text-muted-foreground">
              {r.doctor_name && <>الطبيب: <span className="font-medium text-foreground">{r.doctor_name}</span></>}
              {r.doctor_name && r.branch_name && " · "}
              {r.branch_name && <>الفرع: <span className="font-medium text-foreground">{r.branch_name}</span></>}
            </p>
          )}
          {r.comment && (
            <p className="mt-2 text-sm leading-relaxed flex items-start gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              {r.comment}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {r.patient_name || "مجهول"}
            {r.patient_phone && <> · <span dir="ltr">{r.patient_phone}</span></>}
            {" · "}
            <span dir="ltr">{new Date(r.created_at).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!editing && (
            <button
              onClick={() => { setDraft(r.staff_reply ?? ""); setEditing(true); }}
              title={r.staff_reply ? "تعديل الرد" : "الرد"}
              className="rounded-md border border-border p-2 hover:bg-primary/10 text-primary"
            >
              <Reply className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            title="حذف"
            className="rounded-md border border-border p-2 hover:bg-destructive/10 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Existing reply */}
      {r.staff_reply && !editing && (
        <div className="mt-3 rounded-lg border-r-4 border-r-emerald-500 bg-emerald-500/5 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
              <Reply className="h-3 w-3" /> رد إدارة العيادة
            </span>
            {r.staff_reply_at && (
              <span className="text-[10px] text-muted-foreground" dir="ltr">
                {new Date(r.staff_reply_at).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.staff_reply}</p>
        </div>
      )}

      {/* Reply editor */}
      {editing && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="اكتب ردًا لطيفًا ومهنيًا على هذا التقييم…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">{draft.length}/1000</span>
            <div className="flex items-center gap-1.5">
              {r.staff_reply && (
                <button
                  onClick={() => { onReply(null); setEditing(false); }}
                  disabled={isReplying}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" /> حذف الرد
                </button>
              )}
              <button
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" /> إلغاء
              </button>
              <button
                onClick={save}
                disabled={isReplying || draft.trim().length === 0}
                className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-40"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> حفظ الرد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
