import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHero } from "@/components/PageShell";
import { MessageSquareWarning, ThumbsUp, Copy, Search, Loader2 } from "lucide-react";
import { submitComplaint, trackComplaint } from "@/lib/complaints.functions";
import { bmcOgImageMeta } from "@/lib/og-meta";

const STATUS_AR: Record<string, string> = {
  submitted: "تم الإرسال",
  under_review: "تحت المراجعة",
  waiting_patient: "بانتظار إجراء منك",
  resolved: "تم الحل",
  closed: "مغلق",
};

const TYPE_AR: Record<string, string> = {
  complaint: "شكوى",
  suggestion: "اقتراح",
  thanks: "شكر",
  inquiry: "استفسار",
};

export const Route = createFileRoute("/complaints")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "الشكاوى والمقترحات — مجمع باعشن الطبي" },
      { name: "description", content: "شاركنا ملاحظاتك، شكاواك، ومقترحاتك لتطوير خدماتنا." },
      { property: "og:title", content: "الشكاوى والمقترحات" },
      { property: "og:description", content: "شاركنا رأيك." },
    ],
  }),
  component: ComplaintsPage,
});

function ComplaintsPage() {
  const submitFn = useServerFn(submitComplaint);
  const trackFn = useServerFn(trackComplaint);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    type: "complaint" as "complaint" | "suggestion" | "thanks" | "inquiry",
    department: "",
    message: "",
  });
  const [receipt, setReceipt] = useState<{ reference: string } | null>(null);
  const [track, setTrack] = useState({ reference: "", phone: "" });
  const [tracked, setTracked] = useState<{
    reference: string;
    type: string;
    status: string;
    created_at: string;
    updated_at: string;
    message: string;
  } | null>(null);

  const submit = useMutation({
    mutationFn: (input: typeof form) => submitFn({ data: input }),
    onSuccess: (res) => {
      setReceipt({ reference: res.reference });
      toast.success("تم استلام رسالتك.");
    },
    onError: (e: Error) => toast.error(e.message || "تعذّر الإرسال."),
  });

  const lookup = useMutation({
    mutationFn: (input: typeof track) => trackFn({ data: input }),
    onSuccess: (row) => {
      setTracked({
        reference: row.reference,
        type: row.type,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        message: row.message,
      });
    },
    onError: (e: Error) => {
      setTracked(null);
      toast.error(e.message || "لم نعثر على البلاغ.");
    },
  });

  return (
    <>
      <PageHero
        eyebrow="صوت المريض"
        title="ملاحظاتك تصنع الفرق"
        subtitle="نقرأ كل رسالة بعناية — شكوى نبحث فيها فوراً، أو اقتراح لتحسين تجربتك."
      />
      <section className="container-app py-10 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
          {receipt ? (
            <div className="py-10 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                <ThumbsUp className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-xl font-bold">شكراً لك</h3>
              <p className="text-sm text-muted-foreground mt-1">
                تم استلام رسالتك وسيتواصل معك فريق تجربة المريض خلال 48 ساعة عمل.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span className="text-muted-foreground">رقم البلاغ:</span>
                <span className="font-mono font-bold">{receipt.reference}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(receipt.reference);
                    toast.success("تم نسخ الرقم");
                  }}
                  className="text-primary"
                  aria-label="نسخ"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                احفظ الرقم لتتبّع حالة البلاغ لاحقاً باستخدامه مع رقم جوالك.
              </p>
              <button
                onClick={() => {
                  setReceipt(null);
                  setForm({ ...form, message: "" });
                }}
                className="mt-5 text-sm text-primary underline"
              >
                إرسال رسالة أخرى
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit.mutate(form);
              }}
              className="grid gap-4"
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
              <label className="text-sm">
                <span className="font-medium">البريد الإلكتروني (اختياري)</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="font-medium">نوع الرسالة</span>
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
                  <span className="font-medium">القسم المعني (اختياري)</span>
                  <input
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    placeholder="مثال: الاستقبال، المختبر، الأشعة"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="text-sm">
                <span className="font-medium">تفاصيل الرسالة</span>
                <textarea
                  required
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <button
                disabled={submit.isPending}
                className="rounded-md bg-primary text-primary-foreground font-semibold py-2.5 disabled:opacity-60"
              >
                {submit.isPending ? "جارٍ الإرسال…" : "إرسال"}
              </button>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/40 p-6">
            <MessageSquareWarning className="h-8 w-8 text-primary" />
            <h4 className="mt-3 font-bold">ما بعد الإرسال</h4>
            <ul className="mt-2 text-sm text-muted-foreground space-y-2 list-disc ps-5">
              <li>يتم استلام الرسالة فوراً من قسم تجربة المريض.</li>
              <li>نتواصل معك خلال 48 ساعة عمل بأول رد.</li>
              <li>يُغلق البلاغ عند حل المشكلة وتأكيدك.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h4 className="font-bold flex items-center gap-2">
              <Search className="h-4 w-4" /> تتبّع بلاغك
            </h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                lookup.mutate(track);
              }}
              className="mt-3 grid gap-2"
            >
              <input
                required
                placeholder="رقم البلاغ CMP-XXXXXXXX"
                value={track.reference}
                onChange={(e) => setTrack({ ...track, reference: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              />
              <input
                required
                placeholder="رقم الجوال"
                value={track.phone}
                onChange={(e) => setTrack({ ...track, phone: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                disabled={lookup.isPending}
                className="rounded-md border border-primary/40 bg-primary/5 text-primary font-semibold py-2 text-sm disabled:opacity-60"
              >
                {lookup.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "بحث"}
              </button>
            </form>
            {tracked && (
              <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">النوع</span>
                  <span className="font-medium">{TYPE_AR[tracked.type] ?? tracked.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الحالة</span>
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold">
                    {STATUS_AR[tracked.status] ?? tracked.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">آخر تحديث</span>
                  <span>{new Date(tracked.updated_at).toLocaleString("ar-SA")}</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </section>
    </>
  );
}
