import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RefreshCw,
  AlertTriangle,
  Inbox,
  FileText,
  Search,
  MoreHorizontal,
  Send,
  Ban,
  Eye,
  History,
} from "lucide-react";
import { listAdminReports } from "@/lib/admin/reports.functions";
import {
  publishMedicalReport,
  revokeMedicalReport,
  submitMedicalReportForReview,
  signMedicalReportUrl,
  listMedicalReportVersions,
} from "@/lib/admin/reports-lifecycle.functions";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [
      { title: "قائمة التقارير | لوحة الإدارة" },
      { name: "description", content: "متابعة التقارير الطبية والمخبرية والأشعة." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
        <RefreshCw className="inline h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center text-muted-foreground">غير موجود.</div>
  ),
  component: ReportsPage,
});

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  review: "bg-amber-50 text-amber-700",
  published: "bg-emerald-50 text-emerald-700",
  revoked: "bg-red-50 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  review: "مراجعة",
  published: "منشور",
  revoked: "مسحوب",
};

function ReportsPage() {
  const listFn = useServerFn(listAdminReports);
  const [kind, setKind] = useState<"medical" | "lab" | "radiology">("medical");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const size = 50;
  const query = useQuery({
    queryKey: ["admin-reports", kind, status, q, page],
    queryFn: () =>
      listFn({
        data: {
          kind,
          status: status || undefined,
          q: q || undefined,
          limit: size,
          offset: page * size,
        },
      }),
  });

  return (
    <div className="container-app py-6">
      <header className="flex items-center gap-3 mb-4">
        <FileText className="h-6 w-6" />
        <h1 className="text-2xl font-bold">التقارير</h1>
      </header>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["medical", "lab", "radiology"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setPage(0);
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${kind === k ? "bg-primary text-primary-foreground" : "border"}`}
          >
            {k === "medical" ? "طبية" : k === "lab" ? "مخبرية" : "أشعة"}
          </button>
        ))}
        <div className="relative">
          <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="بحث بالعنوان"
            className="h-9 ps-8 pe-2 rounded-md border bg-background text-sm w-64"
          />
        </div>
        <input
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          placeholder="الحالة (اختياري)"
          className="h-9 px-2 rounded-md border bg-background text-sm w-40"
        />
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {(query.error as Error).message}
        </div>
      ) : !query.data || query.data.rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          <Inbox className="mx-auto h-8 w-8 mb-2" /> لا توجد تقارير.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-start p-3">العنوان</th>
                <th className="text-start p-3">النوع</th>
                <th className="text-start p-3">المريض</th>
                <th className="text-start p-3">MRN</th>
                <th className="text-start p-3">التاريخ</th>
                <th className="text-start p-3">الحالة</th>
                {kind === "medical" && <th className="text-end p-3">إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {query.data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">{r.title_ar ?? r.title_en ?? r.title ?? "—"}</td>
                  <td className="p-3">{r.report_type ?? r.test_type ?? r.modality ?? "—"}</td>
                  <td className="p-3">
                    {r.patient?.full_name_ar ?? r.patient?.full_name_en ?? "—"}
                  </td>
                  <td className="p-3 font-mono text-xs">{r.patient?.mrn ?? "—"}</td>
                  <td className="p-3">
                    {r.report_date ??
                      r.published_at?.slice(0, 10) ??
                      r.created_at?.slice(0, 10) ??
                      "—"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[r.status] ?? "bg-muted"}`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status ?? "—"}
                    </span>
                  </td>
                  {kind === "medical" && (
                    <td className="p-3 text-end">
                      <MedicalReportActions id={r.id} status={r.status} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t p-2 text-xs text-muted-foreground">
            <span>الإجمالي: {query.data.total}</span>
            <div className="flex gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded border px-2 py-1 disabled:opacity-40"
              >
                السابق
              </button>
              <button
                disabled={(page + 1) * size >= query.data.total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border px-2 py-1 disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------- Row actions for medical_reports -------------
function MedicalReportActions({ id, status }: { id: string; status: string }) {
  const qc = useQueryClient();
  const submitFn = useServerFn(submitMedicalReportForReview);
  const publishFn = useServerFn(publishMedicalReport);
  const revokeFn = useServerFn(revokeMedicalReport);
  const signFn = useServerFn(signMedicalReportUrl);
  const listVersionsFn = useServerFn(listMedicalReportVersions);

  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<any[] | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-reports"] });
  const wrap = (p: Promise<any>, ok: string) =>
    p
      .then(() => {
        toast.success(ok);
        refresh();
      })
      .catch((e) => toast.error((e as Error).message));

  const submit = useMutation({
    mutationFn: () => submitFn({ data: { id } }),
    onSuccess: () => {
      toast.success("أُرسل للمراجعة.");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const publish = useMutation({
    mutationFn: () => publishFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم النشر.");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const revoke = useMutation({
    mutationFn: () => revokeFn({ data: { id, reason: revokeReason.trim() } }),
    onSuccess: () => {
      toast.success("تم السحب.");
      setRevokeOpen(false);
      setRevokeReason("");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const preview = () =>
    wrap(
      signFn({ data: { id, ttl_seconds: 300 } }).then((r) => {
        if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
        else throw new Error("لا يوجد ملف مرفق.");
      }),
      "تم فتح المعاينة.",
    );

  const openVersions = () => {
    setVersionsOpen(true);
    setVersions(null);
    listVersionsFn({ data: { id } })
      .then((r) => setVersions(r.versions ?? []))
      .catch((e) => toast.error((e as Error).message));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="إجراءات"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={preview}>
            <Eye className="me-2 h-4 w-4" /> معاينة (رابط موقّت)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openVersions}>
            <History className="me-2 h-4 w-4" /> سجل النسخ
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {status === "draft" && (
            <DropdownMenuItem onSelect={() => submit.mutate()} disabled={submit.isPending}>
              <Send className="me-2 h-4 w-4" /> إرسال للمراجعة
            </DropdownMenuItem>
          )}
          {(status === "draft" || status === "review") && (
            <DropdownMenuItem onSelect={() => publish.mutate()} disabled={publish.isPending}>
              <Send className="me-2 h-4 w-4" /> نشر
            </DropdownMenuItem>
          )}
          {status === "published" && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setRevokeOpen(true);
              }}
              className="text-destructive"
            >
              <Ban className="me-2 h-4 w-4" /> سحب
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>سحب التقرير</DialogTitle>
            <DialogDescription>
              يوثّق هذا الإجراء نسخة جديدة في السجل. يتطلب سبباً واضحاً.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            className="min-h-24 w-full rounded-md border p-2 text-sm"
            placeholder="سبب السحب…"
          />
          <DialogFooter>
            <button
              onClick={() => setRevokeOpen(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              إلغاء
            </button>
            <button
              onClick={() => revoke.mutate()}
              disabled={revoke.isPending || revokeReason.trim().length < 3}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-50"
            >
              تأكيد السحب
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>سجل النسخ</DialogTitle>
          </DialogHeader>
          {versions === null ? (
            <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>
          ) : versions.length === 0 ? (
            <div className="text-sm text-muted-foreground">لا يوجد سجل.</div>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {versions.map((v) => (
                <li key={v.id} className="rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">v{v.version_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.changed_at).toLocaleString("ar-SA")}
                    </span>
                  </div>
                  {v.summary && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-3">
                      {v.summary}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
