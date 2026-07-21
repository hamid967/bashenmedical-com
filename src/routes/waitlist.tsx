import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";
import { Clock, CheckCircle2, AlertCircle, XCircle, Search, Loader2 } from "lucide-react";
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
  offered_date: string | null;
  offered_time: string | null;
  offered_expires_at: string | null;
};

function WaitlistStatusPage() {
  const initial = Route.useSearch();
  const [ref, setRef] = useState((initial.ref ?? "").toUpperCase());
  const [phone4, setPhone4] = useState(initial.phone4 ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatusRes | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [bookedRef, setBookedRef] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null); setData(null); setConfirmMsg(null); setBookedRef(null); setLoading(true);
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

  async function confirmOffer() {
    setConfirming(true);
    setConfirmMsg(null);
    try {
      const res = await fetch("/api/public/book/waitlist-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, phone4 }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setConfirmMsg(j.message ?? "تعذّر تأكيد الحجز.");
        // Refresh status in case the offer expired.
        void submit();
      } else {
        setBookedRef(j.reference ?? null);
        void submit();
      }
    } catch {
      setConfirmMsg("تعذّر الاتصال. حاول لاحقًا.");
    } finally {
      setConfirming(false);
    }
  }

  // Auto-run if both params present in URL (client-only to avoid SSR fetch).
  useEffect(() => {
    if (initial.ref && initial.phone4) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusUi = data && statusDisplay(data.status);
  const offerActive =
    data?.status === "notified" &&
    data.offered_expires_at &&
    new Date(data.offered_expires_at).getTime() > Date.now();

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

        {bookedRef && (
          <div className="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 p-5 md:p-6">
            <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8 shrink-0" />
              <div>
                <div className="font-bold text-lg">تم تأكيد الحجز بنجاح</div>
                <div className="text-sm">
                  رقم الحجز: <span className="font-mono font-bold">{bookedRef}</span>
                </div>
              </div>
            </div>
            <Link
              to="/track"
              search={{ ref: bookedRef ?? undefined, phone4: undefined }}
              className="mt-4 inline-flex items-center justify-center w-full gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 font-semibold hover:opacity-90"
            >
              متابعة الحجز
            </Link>
          </div>
        )}

        {data && statusUi && !bookedRef && (
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

            {offerActive && data.offered_date && data.offered_time && data.offered_expires_at && (
              <div className="mt-5 rounded-xl border-2 border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
                <div className="text-sm text-muted-foreground mb-1">فتحة موعد متاحة لك الآن</div>
                <div className="font-bold text-lg mb-2">
                  {data.offered_date} — {data.offered_time.slice(0, 5)}
                </div>
                <OfferCountdown expiresAt={data.offered_expires_at} onExpire={() => void submit()} />
                {confirmMsg && <p className="mt-2 text-sm text-destructive">{confirmMsg}</p>}
                <Button
                  onClick={confirmOffer}
                  disabled={confirming}
                  className="mt-3 w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {confirming ? "جارٍ التأكيد…" : "تأكيد الحجز الآن"}
                </Button>
              </div>
            )}

            {data.status === "notified" && !offerActive && (
              <p className="mt-4 text-sm text-amber-600">
                انتهت مدة العرض. سنُعلمك بأقرب فتحة جديدة.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OfferCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [ms, setMs] = useState(() => new Date(expiresAt).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      setMs(remaining);
      if (remaining <= 0) {
        clearInterval(t);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpire]);
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-2 text-sm">
      <Clock className="h-4 w-4 text-emerald-700" />
      <span>ينتهي العرض خلال:</span>
      <span className="font-mono font-bold text-emerald-700 tabular-nums">{mm}:{ss}</span>
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

