/**
 * إدارة الحجز /reservations/manage
 *
 * صفحة عامة (بدون تسجيل) للمريض لتتبع حجزه بمرجع + آخر 4 أرقام من الجوال،
 * ثم إلغاؤه إذا رغب. تستخدم /api/public/book/track و /api/public/book/cancel.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";
import { ArrowRight, Search, CheckCircle2, XCircle, Loader2, AlertCircle, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSessionProfile } from "@/hooks/use-session-profile";

const searchSchema = z.object({
  ref: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/reservations/manage")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "إدارة حجزي | مجمع باعشن الطبي" },
      { name: "description", content: "تتبع حجزك أو ألغِه باستخدام رقم المرجع وآخر 4 أرقام من جوالك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManageReservationPage,
});

type TrackData = {
  ok: true; reference: string; status: string;
  appointment_date: string; appointment_time: string;
  doctor_name: string | null; specialty_name: string | null;
  patient_first_name: string | null;
};

async function trackBooking(payload: { reference: string; phone_last4: string }) {
  const res = await fetch("/api/public/book/track", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as TrackData | { ok: false; message: string };
}

async function cancelBooking(payload: { reference: string; phone: string; reason?: string }) {
  const res = await fetch("/api/public/book/cancel", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { ok: boolean; message?: string };
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  new: { label: "جديد — بانتظار التأكيد", color: "bg-blue-100 text-blue-700" },
  confirmed: { label: "مؤكَّد", color: "bg-green-100 text-green-700" },
  cancelled: { label: "ملغى", color: "bg-red-100 text-red-700" },
  completed: { label: "مكتمل", color: "bg-gray-100 text-gray-700" },
  no_show: { label: "لم يحضر", color: "bg-orange-100 text-orange-700" },
};

function ManageReservationPage() {
  const search = Route.useSearch();
  const [ref, setRef] = useState(search.ref || "");
  const [last4, setLast4] = useState("");
  const [phoneForCancel, setPhoneForCancel] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const { profile } = useSessionProfile();


  const track = useMutation({ mutationFn: trackBooking });
  const cancel = useMutation({ mutationFn: cancelBooking });

  const data = track.data && "ok" in track.data && track.data.ok ? (track.data as TrackData) : null;
  const trackError = track.data && !("ok" in track.data && track.data.ok)
    ? (track.data as { message: string }).message : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowCancel(false);
    cancel.reset();
    track.mutate({ reference: ref.trim().toUpperCase(), phone_last4: last4.trim() });
  };

  const doCancel = () => {
    if (!data) return;
    cancel.mutate({ reference: data.reference, phone: phoneForCancel.trim(), reason: cancelReason.trim() || undefined });
  };

  const canCancel = data && (data.status === "new" || data.status === "confirmed");

  const dateLabel = data ? new Date(data.appointment_date + "T00:00:00").toLocaleDateString(
    "ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  ) : "";

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="container-modern mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/reservations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
            <ArrowRight className="h-4 w-4" /> عودة للحجوزات
          </Link>
          <div className="text-sm font-semibold">إدارة حجزي</div>
        </div>
      </header>

      <div className="container-modern mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Lookup form */}
        <div className="bg-card border rounded-2xl p-6 md:p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-1">تتبّع حجزك</h1>
          <p className="text-sm text-muted-foreground mb-6">
            أدخل رقم المرجع (BAA-XXXXXXXX) وآخر 4 أرقام من جوالك.
          </p>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ref">رقم المرجع</Label>
              <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())}
                placeholder="BAA-XXXXXXXX" className="mt-1.5 font-mono" dir="ltr"
                pattern="BAA-[0-9A-F]{8}" required />
            </div>
            <div>
              <Label htmlFor="last4">آخر 4 أرقام من الجوال</Label>
              <Input id="last4" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                placeholder="XXXX" className="mt-1.5 font-mono" dir="ltr"
                inputMode="numeric" maxLength={4} minLength={4} required />
            </div>
            <Button type="submit" disabled={track.isPending} className="sm:col-span-2 h-11">
              {track.isPending ? <><Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري البحث…</>
                : <><Search className="h-4 w-4 ml-2" /> بحث</>}
            </Button>
          </form>

          {trackError && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/5 text-destructive text-sm p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" /> {trackError}
            </div>
          )}
        </div>

        {/* Result */}
        {data && (
          <div className="bg-card border rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">رقم المرجع</div>
                <div className="text-lg font-mono font-bold">{data.reference}</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_LABEL[data.status]?.color ?? "bg-gray-100 text-gray-700"}`}>
                {STATUS_LABEL[data.status]?.label ?? data.status}
              </span>
            </div>

            <div className="space-y-3 border-t pt-4">
              {data.patient_first_name && <InfoRow label="المريض" value={data.patient_first_name} />}
              {data.doctor_name && <InfoRow label="الطبيب" value={data.doctor_name} />}
              {data.specialty_name && <InfoRow label="التخصص" value={data.specialty_name} />}
              <InfoRow label="التاريخ" value={dateLabel} />
              <InfoRow label="الوقت" value={data.appointment_time.slice(0, 5)} />
            </div>

            {canCancel && !showCancel && (
              <div className="mt-6 pt-6 border-t">
                <Button variant="outline" onClick={() => setShowCancel(true)}
                  className="text-destructive hover:bg-destructive/5 border-destructive/30">
                  <XCircle className="h-4 w-4 ml-2" /> إلغاء الحجز
                </Button>
              </div>
            )}

            {canCancel && showCancel && (
              <div className="mt-6 pt-6 border-t space-y-4">
                <div className="text-sm font-semibold">تأكيد الإلغاء</div>
                <div>
                  <Label htmlFor="phone-cancel">رقم الجوال الكامل *</Label>
                  <Input id="phone-cancel" type="tel" dir="ltr" value={phoneForCancel}
                    onChange={(e) => setPhoneForCancel(e.target.value)}
                    placeholder="05XXXXXXXX" className="mt-1.5" required />
                </div>
                <div>
                  <Label htmlFor="reason-cancel">سبب الإلغاء (اختياري)</Label>
                  <Textarea id="reason-cancel" value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="اذكر السبب باختصار…" maxLength={500} className="mt-1.5" />
                </div>
                {cancel.data && cancel.data.ok && (
                  <div className="rounded-lg border border-green-500/50 bg-green-50 text-green-700 text-sm p-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> تم إلغاء حجزك بنجاح.
                  </div>
                )}
                {cancel.data && !cancel.data.ok && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/5 text-destructive text-sm p-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" /> {cancel.data.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setShowCancel(false)} disabled={cancel.isPending}>تراجع</Button>
                  <Button variant="destructive" onClick={doCancel}
                    disabled={cancel.isPending || (cancel.data?.ok ?? false)} className="flex-1">
                    {cancel.isPending ? <><Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري…</>
                      : "تأكيد الإلغاء"}
                  </Button>
                </div>
              </div>
            )}

            {!canCancel && (
              <div className="mt-6 pt-6 border-t text-sm text-muted-foreground">
                لا يمكن إلغاء هذا الحجز في حالته الحالية.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-left">{value}</span>
    </div>
  );
}
