import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";
import { Clock, CheckCircle2, AlertCircle, XCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";
import { bmcOgImageMeta } from "@/lib/og-meta";

const search = z.object({
  ref: fallback(z.string().optional(), undefined),
  phone4: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/waitlist")({
  validateSearch: search,
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "حالة قائمة الانتظار | مجمع باعشن الطبي" },
      { name: "description", content: "تحقّق من حالة تسجيلك في قائمة الانتظار للحصول على موعد شاغر." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaitlistStatusPage,
});

type StatusRes = {
  ok: true;
  status: "waiting" | "notified" | "fulfilled" | "expired" | "cancelled";
  notified_at: string | null;
  preferred_from: string;
  preferred_to: string;
  created_at: string;
  doctor_name: string | null;
};

function WaitlistStatusPage() {
  const initial = Route.useSearch();
  const [ref, setRef] = useState((initial.ref ?? "").toUpperCase());
  const [phone4, setPhone4] = useState(initial.phone4 ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatusRes | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null); setData(null); setLoading(true);
    try {
      const p = new URLSearchParams({ ref, phone4 });
      const res = await fetch(`/api/public/book/waitlist?${p.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? "خطأ غير متوقع");
      } else {
        setData(json as StatusRes);
      }
    } catch {
      setError("تعذّر الاتصال. حاول لاحقًا.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-run if both params present in URL
  useState(() => {
    if (initial.ref && initial.phone4) void submit();
  });

  const statusUi = data && statusDisplay(data.status);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container-app py-10 md:py-14 max-w-xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl md:text-3xl font-bold">حالة قائمة الانتظار</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            استخدم رقم الطلب وآخر ٤ أرقام من جوالك لمتابعة الحالة.
          </p>
        </header>

        <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-5 md:p-6 space-y-3">
          <div>
            <Label htmlFor="ref">رقم الطلب</Label>
            <Input id="ref" placeholder="WL-XXXXXXXX" value={ref}
              onChange={(e) => setRef(e.target.value.toUpperCase())} className="mt-1 font-mono" />
          </div>
          <div>
            <Label htmlFor="p4">آخر ٤ أرقام من الجوال</Label>
            <Input id="p4" inputMode="numeric" maxLength={4} value={phone4}
              onChange={(e) => setPhone4(e.target.value.replace(/\D/g, ""))} className="mt-1" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full gap-2">
            <Search className="h-4 w-4" />
            {loading ? "جارٍ التحقق…" : "عرض الحالة"}
          </Button>
        </form>

        {data && statusUi && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 md:p-6">
            <div className={`flex items-center gap-3 ${statusUi.color}`}>
              <statusUi.Icon className="h-8 w-8 shrink-0" />
              <div>
                <div className="font-bold text-lg">{statusUi.title}</div>
                <div className="text-sm text-muted-foreground">{statusUi.hint}</div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {data.doctor_name && (
                <div>
                  <dt className="text-muted-foreground">الطبيب</dt>
                  <dd className="font-medium">{data.doctor_name}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">نطاق التاريخ</dt>
                <dd className="font-medium">{data.preferred_from} → {data.preferred_to}</dd>
              </div>
              {data.notified_at && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">تم إعلامك بالفرصة في</dt>
                  <dd className="font-medium">{new Date(data.notified_at).toLocaleString("ar-SA")}</dd>
                </div>
              )}
            </dl>
            {data.status === "notified" && (
              <Link
                to="/book"
                className="mt-4 inline-flex items-center justify-center w-full gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 font-semibold hover:opacity-90"
              >
                احجز الفتحة الآن
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function statusDisplay(s: StatusRes["status"]) {
  switch (s) {
    case "waiting":   return { Icon: Clock,         color: "text-amber-600",   title: "قيد الانتظار",         hint: "سنُعلمك فور شغور فتحة مناسبة." };
    case "notified":  return { Icon: AlertCircle,   color: "text-emerald-600", title: "توفّرت فتحة!",         hint: "أسرع في تأكيد الحجز — الأولوية لأول من يحجز." };
    case "fulfilled": return { Icon: CheckCircle2,  color: "text-emerald-600", title: "تم إتمام الحجز",       hint: "شكرًا لاستخدامك خدمة الانتظار." };
    case "expired":   return { Icon: XCircle,       color: "text-muted-foreground", title: "انتهت مدة الطلب", hint: "يمكنك تسجيل طلب جديد في أي وقت." };
    case "cancelled": return { Icon: XCircle,       color: "text-muted-foreground", title: "طلب ملغى",         hint: "تم إلغاء هذا الطلب من قائمة الانتظار." };
  }
}
