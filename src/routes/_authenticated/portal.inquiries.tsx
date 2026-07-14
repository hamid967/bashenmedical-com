/**
 * Portal — My Service Inquiries
 *
 * Lists WhatsApp service-inquiry requests owned by the signed-in user
 * (linked via user_id). Also auto-claims any pending inquiries stored in
 * localStorage under `bmc:pending_inquiry_links` — items added by the
 * public FloatingWhatsAppButton confirmation flow.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  listMyInquiries,
  claimMyInquiry,
  type MyInquiry,
} from "@/lib/portal/inquiries.functions";
import {
  MessageCircle,
  RefreshCw,
  Copy,
  Clock,
  MapPin,
  Sparkles,
  Loader2,
  Link2,
  CheckCircle2,
  Circle,
  CircleDot,
  XCircle,
} from "lucide-react";

const LS_KEY = "bmc:pending_inquiry_links";

const searchSchema = z.object({ ref: z.string().optional() });

const inquiriesQuery = queryOptions({
  queryKey: ["portal", "my-inquiries"],
  queryFn: () => listMyInquiries(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/inquiries")({
  validateSearch: searchSchema,
  loader: async ({ context }) => context.queryClient.ensureQueryData(inquiriesQuery),
  head: () => ({
    meta: [
      { title: "استفساراتي | بوابة باعشن للخدمات الطبية" },
      { name: "description", content: "متابعة طلبات الاستفسار المرسلة عبر واتساب مجمع باعشن." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyInquiriesPage,
  errorComponent: ({ error }) => (
    <div className="portal-shell p-6">
      <div className="glass-card p-6 text-center">
        <p className="text-red-600 font-semibold">تعذّر تحميل استفساراتك</p>
        <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => null,
});

type Pending = { request_number: string; link_token: string };

function readPending(): Pending[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((r) => r?.request_number && r?.link_token) : [];
  } catch {
    return [];
  }
}
function removePending(reqNum: string) {
  try {
    const arr = readPending().filter((r) => r.request_number !== reqNum);
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

function MyInquiriesPage() {
  const { data: inquiries } = useSuspenseQuery(inquiriesQuery);
  const qc = useQueryClient();
  const { ref } = useSearch({ from: "/_authenticated/portal/inquiries" });
  const claim = useServerFn(claimMyInquiry);
  const [claiming, setClaiming] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // Auto-claim any pending inquiries stored locally after account creation.
  useEffect(() => {
    if (attempted) return;
    const pending = readPending();
    if (pending.length === 0) {
      setAttempted(true);
      return;
    }
    setAttempted(true);
    setClaiming(true);
    (async () => {
      let claimed = 0;
      for (const p of pending) {
        try {
          const r = await claim({ data: p });
          if (r.claimed) {
            claimed++;
            removePending(p.request_number);
          } else {
            // token invalid or already claimed — drop from local queue
            removePending(p.request_number);
          }
        } catch {
          /* keep the pending entry for a later retry */
        }
      }
      if (claimed > 0) {
        toast.success(`تم ربط ${claimed} من طلباتك السابقة بحسابك`);
        qc.invalidateQueries({ queryKey: ["portal", "my-inquiries"] });
        qc.invalidateQueries({ queryKey: ["portal", "my-notifications"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      }
      setClaiming(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Highlight a specific inquiry if the URL carried ?ref=BMC-WA-...
  const highlighted = ref ?? null;

  const manual = useMutation({
    mutationFn: async (input: Pending) => {
      const r = await claim({ data: input });
      if (!r.claimed) throw new Error("رقم الطلب أو الرمز غير صحيح، أو أن الطلب مرتبط بالفعل.");
      return r;
    },
    onSuccess: () => {
      toast.success("تم ربط الطلب بحسابك بنجاح");
      qc.invalidateQueries({ queryKey: ["portal", "my-inquiries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [manualRef, setManualRef] = useState("");
  const [manualTok, setManualTok] = useState("");

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-primary" />
            استفساراتي
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            طلبات الاستفسار التي أرسلتها عبر خدمة واتساب مجمع باعشن.
          </p>
        </div>
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ["portal", "my-inquiries"] })}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          تحديث
        </button>
      </header>

      {claiming && (
        <div className="glass-card p-3 text-sm flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ ربط الطلبات المعلّقة بحسابك…
        </div>
      )}

      {inquiries.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {inquiries.map((i) => (
            <InquiryCard key={i.id} i={i} highlighted={highlighted === i.request_number} />
          ))}
        </ul>
      )}

      {/* Manual link fallback (if localStorage was cleared / different device) */}
      <section className="glass-card p-4">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          ربط طلب سابق يدويًا
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          إن كنت قد أرسلت طلبًا من جهاز آخر، أدخل رقم الطلب ورمز الربط المرسل معه.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualRef.trim() || !manualTok.trim()) return;
            manual.mutate({ request_number: manualRef.trim(), link_token: manualTok.trim() });
          }}
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <input
            value={manualRef}
            onChange={(e) => setManualRef(e.target.value)}
            placeholder="رقم الطلب (BMC-WA-…)"
            dir="ltr"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={manualTok}
            onChange={(e) => setManualTok(e.target.value)}
            placeholder="رمز الربط (UUID)"
            dir="ltr"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={manual.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {manual.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            ربط
          </button>
        </form>
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass-card p-8 text-center">
      <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-3 font-bold">لا توجد استفسارات بعد</h3>
      <p className="text-sm text-muted-foreground mt-1">
        يمكنك إرسال استفسار جديد عبر زر واتساب في أي صفحة من موقع المجمع.
      </p>
      <a
        href="/"
        className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        الذهاب للموقع الرئيسي
      </a>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: "جديد",
  in_progress: "قيد المعالجة",
  contacted: "تم التواصل",
  scheduled: "تم الجدولة",
  closed: "مغلق",
  cancelled: "ملغى",
};
const HANDOFF_LABEL: Record<string, string> = {
  not_opened: "لم يُفتح",
  opened: "تم فتح واتساب",
  delivered: "تم التسليم",
  responded: "تم الرد",
};

function InquiryCard({ i, highlighted }: { i: MyInquiry; highlighted: boolean }) {
  const qc = useQueryClient();
  const created = useMemo(() => new Date(i.created_at).toLocaleString("ar-SA"), [i.created_at]);
  return (
    <li
      className={`glass-card p-4 ${highlighted ? "ring-2 ring-primary/60" : ""}`}
      aria-current={highlighted ? "true" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] text-muted-foreground">رقم الطلب</div>
          <div className="font-mono text-base font-bold tracking-wider">{i.request_number}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["portal", "my-inquiries"] })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary"
            title="تحديث الحالة"
          >
            <RefreshCw className="h-3 w-3" /> تحديث
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(i.request_number).then(
                () => toast.success("تم نسخ رقم الطلب"),
                () => toast.error("تعذّر النسخ"),
              );
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Copy className="h-3 w-3" /> نسخ
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        <div className="font-semibold">{i.service_label ?? "خدمة"}</div>
        {i.branch_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {i.branch_name}
          </div>
        )}
        {i.preferred_date && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            التاريخ المفضل: {i.preferred_date}
          </div>
        )}
        {i.notes && (
          <p className="text-xs text-muted-foreground line-clamp-3 mt-1">{i.notes}</p>
        )}
      </div>

      {/* شريط الحالة: قيد الربط → قيد المراجعة → مكتمل */}
      <StatusStepper inquiry={i} />

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <Badge tone="primary">{STATUS_LABEL[i.internal_status] ?? i.internal_status}</Badge>
        <Badge tone="muted">واتساب: {HANDOFF_LABEL[i.whatsapp_handoff_status] ?? i.whatsapp_handoff_status}</Badge>
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground">أُرسل في {created}</div>
    </li>
  );
}

type StepState = "done" | "current" | "pending" | "failed";
type Step = { key: string; label: string; state: StepState; date: string | null };

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("ar-SA-u-nu-latn", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function StatusStepper({ inquiry: i }: { inquiry: MyInquiry }) {
  const status = i.internal_status;
  const isCancelled = status === "cancelled";
  const isCompleted = status === "closed" || status === "completed" || status === "scheduled";
  const isReviewing =
    status === "in_progress" || status === "contacted";
  const isLinked = !!i.linked_at;

  const steps: Step[] = [
    {
      key: "submitted",
      label: "مُرسل",
      state: "done",
      date: fmtDate(i.created_at),
    },
    {
      key: "linked",
      label: isLinked ? "مرتبط بحسابك" : "قيد الربط",
      state: isLinked ? "done" : "current",
      date: fmtDate(i.linked_at),
    },
    {
      key: "review",
      label: "قيد المراجعة",
      state: isCancelled
        ? "failed"
        : isCompleted
          ? "done"
          : isReviewing
            ? "current"
            : isLinked
              ? "current"
              : "pending",
      date: null,
    },
    {
      key: "completed",
      label: isCancelled ? "ملغى" : "مكتمل",
      state: isCancelled ? "failed" : isCompleted ? "done" : "pending",
      date: null,
    },
  ];

  return (
    <ol className="mt-4 flex items-start justify-between gap-1" aria-label="مراحل الاستفسار">
      {steps.map((s, idx) => (
        <li key={s.key} className="flex-1 flex flex-col items-center text-center relative min-w-0">
          {idx > 0 && (
            <span
              aria-hidden
              className={
                "absolute top-3 h-0.5 ltr:left-0 ltr:right-1/2 rtl:right-0 rtl:left-1/2 " +
                (s.state === "done" || s.state === "current"
                  ? "bg-primary"
                  : s.state === "failed"
                    ? "bg-red-300"
                    : "bg-muted")
              }
            />
          )}
          <StepIcon state={s.state} />
          <span
            className={
              "mt-1 text-[10px] font-semibold truncate max-w-full px-0.5 " +
              (s.state === "done"
                ? "text-primary"
                : s.state === "current"
                  ? "text-foreground"
                  : s.state === "failed"
                    ? "text-red-600"
                    : "text-muted-foreground")
            }
          >
            {s.label}
          </span>
          {s.date && (
            <span className="text-[9px] text-muted-foreground tabular-nums leading-tight">
              {s.date}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const base = "relative h-6 w-6 rounded-full grid place-items-center bg-background border-2";
  if (state === "done")
    return (
      <span className={`${base} border-primary text-primary`}>
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  if (state === "current")
    return (
      <span className={`${base} border-primary text-primary`}>
        <CircleDot className="h-3.5 w-3.5" />
      </span>
    );
  if (state === "failed")
    return (
      <span className={`${base} border-red-400 text-red-500`}>
        <XCircle className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span className={`${base} border-muted text-muted-foreground`}>
      <Circle className="h-3.5 w-3.5" />
    </span>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "primary" | "muted" }) {
  const cls =
    tone === "primary"
      ? "bg-primary/10 text-primary border-primary/20"
      : "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${cls}`}>{children}</span>;
}
