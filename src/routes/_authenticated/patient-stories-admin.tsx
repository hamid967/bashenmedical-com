import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  listPatientStoriesAdmin,
  setPatientStoryStatus,
  type PatientStoryStatus,
} from "@/lib/patient-stories-admin.functions";

export const Route = createFileRoute("/_authenticated/patient-stories-admin")({
  head: () => ({
    meta: [
      { title: "إدارة قصص المرضى | مجمع باعشن الطبي" },
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
  notFoundComponent: () => <div className="container mx-auto p-6">الصفحة غير موجودة</div>,
  component: PatientStoriesAdminPage,
});

const STATUS_LABELS: Record<PatientStoryStatus, string> = {
  pending_review: "تحت المراجعة",
  published: "منشور",
  rejected: "مرفوض",
};

const STATUS_STYLES: Record<PatientStoryStatus, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

type Row = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  excerpt: string | null;
  hero_image_url: string | null;
  specialty: string | null;
  status: PatientStoryStatus;
  published_at: string | null;
  display_order: number | null;
  created_at: string;
  updated_at: string;
};

function PatientStoriesAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPatientStoriesAdmin);
  const setStatusFn = useServerFn(setPatientStoryStatus);

  const [filter, setFilter] = useState<PatientStoryStatus | "all">("all");

  const listQ = useQuery({
    queryKey: ["patient-stories-admin", filter],
    queryFn: () => listFn({ data: { status: filter } }) as Promise<Row[]>,
  });

  const setStatusMut = useMutation({
    mutationFn: (vars: { id: string; status: PatientStoryStatus }) => setStatusFn({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(
        vars.status === "published"
          ? "تم نشر القصة"
          : vars.status === "rejected"
            ? "تم رفض القصة"
            : "أُعيدت القصة إلى المراجعة",
      );
      qc.invalidateQueries({ queryKey: ["patient-stories-admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل التحديث"),
  });

  return (
    <div className="container mx-auto p-4 md:p-6" dir="rtl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">إدارة قصص المرضى</h1>
          <p className="text-sm text-muted-foreground">
            راجع القصص المرسلة، وافق على النشر أو أعِدها للمراجعة أو ارفضها
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
        {(["all", ...(Object.keys(STATUS_LABELS) as PatientStoryStatus[])] as const).map((s) => (
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
          onClick={() => qc.invalidateQueries({ queryKey: ["patient-stories-admin"] })}
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
        <p className="text-destructive">تعذّر جلب القصص: {(listQ.error as Error).message}</p>
      ) : !listQ.data?.length ? (
        <p className="text-muted-foreground">لا توجد قصص مطابقة.</p>
      ) : (
        <div className="space-y-3">
          {listQ.data.map((row) => (
            <div key={row.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start gap-4">
                {row.hero_image_url && (
                  <img
                    src={row.hero_image_url}
                    alt=""
                    className="h-20 w-28 flex-shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{row.title_ar}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[row.status]}`}
                    >
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                    {row.status === "published" && (
                      <Link
                        to="/media/stories/$slug"
                        params={{ slug: row.slug }}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> عرض عام
                      </Link>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>slug: {row.slug}</span>
                    {row.specialty && <span>· {row.specialty}</span>}
                    <span>· أُنشئت {new Date(row.created_at).toLocaleDateString("ar-SA")}</span>
                    {row.published_at && (
                      <span>· نُشرت {new Date(row.published_at).toLocaleDateString("ar-SA")}</span>
                    )}
                  </div>
                  {row.excerpt && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.excerpt}</p>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-2">
                  {row.status !== "published" && (
                    <button
                      onClick={() => setStatusMut.mutate({ id: row.id, status: "published" })}
                      disabled={setStatusMut.isPending}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" /> اعتماد ونشر
                    </button>
                  )}
                  {row.status !== "pending_review" && (
                    <button
                      onClick={() => setStatusMut.mutate({ id: row.id, status: "pending_review" })}
                      disabled={setStatusMut.isPending}
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <Clock className="h-4 w-4" /> إعادة للمراجعة
                    </button>
                  )}
                  {row.status !== "rejected" && (
                    <button
                      onClick={() => setStatusMut.mutate({ id: row.id, status: "rejected" })}
                      disabled={setStatusMut.isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" /> رفض
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
