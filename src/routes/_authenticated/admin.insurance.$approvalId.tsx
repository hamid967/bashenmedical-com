import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, RefreshCw, AlertTriangle, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  decideInsuranceApproval,
  getAdminInsuranceApproval,
} from "@/lib/admin/insurance.functions";

export const Route = createFileRoute("/_authenticated/admin/insurance/$approvalId")({
  head: () => ({
    meta: [
      { title: "تفاصيل طلب التأمين | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الطلب</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center text-muted-foreground">
      طلب التأمين غير موجود.
    </div>
  ),
  component: InsuranceDetailPage,
});

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtMoney(v: number | null, currency = "SAR"): string {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat("ar-SA", { style: "currency", currency }).format(Number(v));
  } catch {
    return `${v} ${currency}`;
  }
}

function InsuranceDetailPage() {
  const { approvalId } = Route.useParams();
  const getFn = useServerFn(getAdminInsuranceApproval);
  const decideFn = useServerFn(decideInsuranceApproval);
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState<null | "approved" | "rejected">(null);

  const q = useQuery({
    queryKey: ["admin-insurance", approvalId],
    queryFn: () => getFn({ data: { id: approvalId } }),
  });

  const decide = useMutation({
    mutationFn: (decision: "approved" | "rejected") =>
      decideFn({ data: { id: approvalId, decision, note: note.trim() || undefined } }),
    onSuccess: (_data, decision) => {
      setNote("");
      setConfirmOpen(null);
      queryClient.invalidateQueries({ queryKey: ["admin-insurance"] });
      toast.success(
        decision === "approved" ? "تم اعتماد طلب التأمين بنجاح" : "تم رفض طلب التأمين",
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "تعذّر تنفيذ الإجراء");
    },
  });

  if (q.isLoading) {
    return (
      <div className="container-app py-8">
        <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  if (q.isError) throw q.error;
  const r: any = q.data;
  if (!r) throw notFound();

  const patient = r.patient;
  const provider = r.provider;
  const appt = r.appointment;
  const branch = appt?.branch;
  const attachments: any[] = Array.isArray(r.attachments) ? r.attachments : [];
  const missingDocs: string[] = Array.isArray(r.missing_documents) ? r.missing_documents : [];

  return (
    <div className="container-app py-8">
      <div className="mb-4">
        <Link
          to="/admin/insurance"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" /> العودة إلى قائمة التأمين
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            {r.request_number ?? `طلب ${r.id.slice(0, 8)}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            الحالة: <span className="font-medium text-foreground">{r.status ?? "—"}</span>
            {r.is_mock ? (
              <span className="ms-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
                بيانات تجريبية
              </span>
            ) : null}
          </p>
        </div>
      </header>

      <section
        className="mt-6 rounded-lg border p-4"
        aria-label="إجراءات القرار"
      >
        <h2 className="text-sm font-semibold text-muted-foreground">إجراء على الطلب</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          سيتم تحديث حالة الطلب وتسجيل ملاحظة في السجل الزمني للطلب مع تدوين حدث في سجل التدقيق.
        </p>
        <label className="mt-3 block text-xs text-muted-foreground">
          ملاحظة القرار (اختيارية)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="سبب القرار، مستندات إضافية مطلوبة، ملاحظات للمريض…"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
            disabled={decide.isPending}
          />
        </label>
        {decide.isError ? (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {decide.error instanceof Error ? decide.error.message : "تعذّر تنفيذ الإجراء"}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen("approved")}
            disabled={decide.isPending || r.status === "approved"}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" /> اعتماد
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen("rejected")}
            disabled={decide.isPending || r.status === "rejected"}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-40"
          >
            <XCircle className="h-4 w-4" /> رفض
          </button>
          {decide.isPending ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> جارٍ الحفظ…
            </span>
          ) : null}
        </div>
      </section>

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد القرار"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !decide.isPending && setConfirmOpen(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">
              {confirmOpen === "approved" ? "تأكيد اعتماد الطلب" : "تأكيد رفض الطلب"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirmOpen === "approved"
                ? "سيتم تحديث حالة الطلب إلى معتمد وإضافة ملاحظتك إلى السجل الزمني."
                : "سيتم تحديث حالة الطلب إلى مرفوض وإضافة ملاحظتك إلى السجل الزمني."}
            </p>
            {note.trim() ? (
              <p className="mt-3 whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs">
                {note.trim()}
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">لم تُدخل ملاحظة.</p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(null)}
                disabled={decide.isPending}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => decide.mutate(confirmOpen)}
                disabled={decide.isPending}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 ${
                  confirmOpen === "approved" ? "bg-emerald-600" : "bg-destructive"
                }`}
              >
                {decide.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : confirmOpen === "approved" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                تأكيد
              </button>
            </div>
          </div>
        </div>
      ) : null}


      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">المريض</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">الاسم</dt>
              <dd className="font-medium">
                {patient?.full_name_ar || patient?.full_name_en || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">MRN</dt>
              <dd className="font-mono text-xs">{patient?.mrn ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">الجوال</dt>
              <dd className="font-mono text-xs">{patient?.phone ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">شركة التأمين</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">الشركة</dt>
              <dd className="font-medium">
                {provider?.name_ar || provider?.name_en || "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">الموعد والفرع</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">تاريخ الموعد</dt>
              <dd>{fmtDate(appt?.appointment_date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">الفرع</dt>
              <dd>{branch?.name_ar || branch?.name_en || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">معرّف الموعد</dt>
              <dd className="font-mono text-xs">{appt?.id ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">التفاصيل المالية</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">المبلغ المعتمد</dt>
              <dd className="font-medium">{fmtMoney(r.approved_amount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">حصة المريض</dt>
              <dd className="font-medium">{fmtMoney(r.patient_share)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">تاريخ التقديم</dt>
              <dd>{fmtDate(r.submitted_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">تاريخ المراجعة</dt>
              <dd>{fmtDate(r.reviewed_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">تاريخ الانتهاء</dt>
              <dd>{r.expires_at ?? "—"}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">وصف الخدمة</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm">
          {r.service_description || <span className="text-muted-foreground">—</span>}
        </p>
      </section>

      {r.notes ? (
        <section className="mt-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">ملاحظات</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{r.notes}</p>
        </section>
      ) : null}

      {missingDocs.length > 0 ? (
        <section className="mt-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">مستندات ناقصة</h2>
          <ul className="mt-2 list-disc space-y-1 ps-6 text-sm">
            {missingDocs.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {attachments.length > 0 ? (
        <section className="mt-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            المرفقات ({attachments.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {attachments.map((a, i) => (
              <li key={i} className="font-mono text-xs text-muted-foreground">
                {typeof a === "string" ? a : JSON.stringify(a)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
