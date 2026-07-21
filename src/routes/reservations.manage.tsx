/**
 * إدارة حجوزاتي — /reservations/manage
 *
 * Unified page: enter phone → receive 6-digit OTP → list all appointments
 * for that phone with actions to view / cancel / reschedule any active
 * one. Session is short-lived (30 min) and stored in-memory only.
 *
 * Backend endpoints:
 *   POST /api/public/reservations/otp/send
 *   POST /api/public/reservations/otp/verify
 *   POST /api/public/reservations/list
 *   POST /api/public/reservations/cancel
 *   POST /api/public/reservations/reschedule
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Phone,
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  CalendarClock,
  User2,
  Stethoscope,
  Building2,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/reservations/manage")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "إدارة حجوزاتي | مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "أدر حجوزاتك (تعديل، إلغاء، إعادة جدولة) عبر رقم جوالك ورمز تحقق سريع.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManagePage,
});

type Appointment = {
  id: string;
  reference: string;
  date: string;
  time: string;
  status: string;
  patient_name: string | null;
  doctor_name_ar: string | null;
  doctor_name_en: string | null;
  branch_name_ar: string | null;
  branch_name_en: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
};

const STATUS: Record<string, { label: string; color: string }> = {
  new: { label: "جديد — بانتظار التأكيد", color: "bg-blue-100 text-blue-700 border-blue-200" },
  confirmed: { label: "مؤكَّد", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "ملغى", color: "bg-red-100 text-red-700 border-red-200" },
  completed: { label: "مكتمل", color: "bg-gray-100 text-gray-700 border-gray-200" },
  no_show: { label: "لم يحضر", color: "bg-orange-100 text-orange-700 border-orange-200" },
};

const SESSION_KEY = "bmc-resv-session";

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { ok?: boolean; message?: string };
  return data;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("ar-SA-u-ca-gregory", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function ManagePage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "list">("phone");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string>("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeCancelId, setActiveCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [activeReschedId, setActiveReschedId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Restore session from sessionStorage after hydration
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        token: string;
        expires: string;
        phone_masked?: string;
      };
      if (new Date(s.expires).getTime() > Date.now()) {
        setSessionToken(s.token);
        setSessionExpiresAt(s.expires);
        setPhoneMasked(s.phone_masked ?? "");
        setStep("list");
      } else {
        window.sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const sendOtp = useMutation({
    mutationFn: async () => {
      setErrorMsg(null);
      setDevCode(null);
      return apiPost<{
        ok: boolean;
        message?: string;
        phone_masked?: string;
        dev_code?: string;
      }>("/api/public/reservations/otp/send", { phone });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        setErrorMsg(res.message ?? "تعذّر إرسال الرمز.");
        return;
      }
      setPhoneMasked(res.phone_masked ?? phone);
      if (res.dev_code) setDevCode(res.dev_code);
      setStep("code");
    },
    onError: () => setErrorMsg("خطأ في الشبكة."),
  });

  const verifyOtp = useMutation({
    mutationFn: async () => {
      setErrorMsg(null);
      return apiPost<{
        ok: boolean;
        message?: string;
        session_token?: string;
        session_expires_at?: string;
      }>("/api/public/reservations/otp/verify", { phone, code });
    },
    onSuccess: (res) => {
      if (!res.ok || !res.session_token || !res.session_expires_at) {
        setErrorMsg(res.message ?? "الرمز غير صحيح.");
        return;
      }
      setSessionToken(res.session_token);
      setSessionExpiresAt(res.session_expires_at);
      try {
        window.sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            token: res.session_token,
            expires: res.session_expires_at,
            phone_masked: phoneMasked,
          }),
        );
      } catch {
        /* ignore */
      }
      setStep("list");
    },
    onError: () => setErrorMsg("خطأ في الشبكة."),
  });

  const listAppts = useMutation({
    mutationFn: async (token: string) => {
      setErrorMsg(null);
      return apiPost<{
        ok: boolean;
        message?: string;
        appointments?: Appointment[];
      }>("/api/public/reservations/list", { session_token: token });
    },
    onSuccess: (res) => {
      if (res.ok && res.appointments) setAppointments(res.appointments);
      else if (!res.ok) {
        setErrorMsg(res.message ?? "تعذّر جلب الحجوزات.");
        if (res.message?.includes("انتهت الجلسة")) logout();
      }
    },
  });

  useEffect(() => {
    if (step === "list" && sessionToken) {
      listAppts.mutate(sessionToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionToken]);

  const cancelAppt = useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      if (!sessionToken) throw new Error("no session");
      return apiPost<{ ok: boolean; message?: string }>(
        "/api/public/reservations/cancel",
        {
          session_token: sessionToken,
          appointment_id: input.id,
          reason: input.reason || undefined,
        },
      );
    },
    onSuccess: (res) => {
      if (res.ok) {
        setToast("تم إلغاء الحجز.");
        setActiveCancelId(null);
        setCancelReason("");
        if (sessionToken) listAppts.mutate(sessionToken);
      } else {
        setErrorMsg(res.message ?? "تعذّر الإلغاء.");
      }
    },
  });

  const rescheduleAppt = useMutation({
    mutationFn: async (input: { id: string; date: string; time: string }) => {
      if (!sessionToken) throw new Error("no session");
      return apiPost<{ ok: boolean; message?: string }>(
        "/api/public/reservations/reschedule",
        {
          session_token: sessionToken,
          appointment_id: input.id,
          date: input.date,
          time: input.time,
        },
      );
    },
    onSuccess: (res) => {
      if (res.ok) {
        setToast("تم تحديث موعد الحجز.");
        setActiveReschedId(null);
        setRescheduleDate("");
        setRescheduleTime("");
        if (sessionToken) listAppts.mutate(sessionToken);
      } else {
        setErrorMsg(res.message ?? "تعذّر إعادة الجدولة.");
      }
    },
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const logout = () => {
    setSessionToken(null);
    setSessionExpiresAt(null);
    setAppointments([]);
    setCode("");
    setStep("phone");
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  const minDateIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="container-modern mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link
            to="/reservations"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <ArrowRight className="h-4 w-4" /> عودة للحجوزات
          </Link>
          <div className="text-sm font-semibold">إدارة حجوزاتي</div>
          {step === "list" ? (
            <button
              onClick={logout}
              className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
              aria-label="تسجيل الخروج من الجلسة"
            >
              <LogOut className="h-3.5 w-3.5" /> خروج
            </button>
          ) : (
            <span className="w-8" />
          )}
        </div>
      </header>

      <div className="container-modern mx-auto max-w-3xl px-4 py-8 space-y-6">
        {toast && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm p-3 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" /> {toast}
          </div>
        )}

        {step === "phone" && (
          <div className="bg-card border rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Phone className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">أدخل رقم جوالك</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              سنرسل إليك رمز تحقق مكوّن من 6 أرقام لعرض حجوزاتك.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendOtp.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="phone">رقم الجوال</Label>
                <Input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="mt-1.5 font-mono"
                  autoComplete="tel"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={sendOtp.isPending || phone.trim().length < 9}
                className="w-full h-11"
              >
                {sendOtp.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري الإرسال…
                  </>
                ) : (
                  "إرسال رمز التحقق"
                )}
              </Button>
              {errorMsg && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 text-destructive text-sm p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
                </div>
              )}
            </form>
          </div>
        )}

        {step === "code" && (
          <div className="bg-card border rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">أدخل رمز التحقق</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              أرسلنا رمزًا مكوّنًا من 6 أرقام إلى {phoneMasked || phone}. الرمز صالح لمدة 5 دقائق.
            </p>
            {devCode && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs p-2 font-mono">
                (وضع التطوير) الرمز: <strong>{devCode}</strong>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyOtp.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="code">الرمز</Label>
                <Input
                  id="code"
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  maxLength={6}
                  className="mt-1.5 font-mono text-lg tracking-widest text-center"
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStep("phone");
                    setCode("");
                    setErrorMsg(null);
                  }}
                >
                  تغيير الرقم
                </Button>
                <Button
                  type="submit"
                  disabled={verifyOtp.isPending || code.length !== 6}
                  className="flex-1 h-11"
                >
                  {verifyOtp.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التحقق…
                    </>
                  ) : (
                    "تأكيد"
                  )}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => sendOtp.mutate()}
                disabled={sendOtp.isPending}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" /> إعادة إرسال الرمز
              </button>
              {errorMsg && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 text-destructive text-sm p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
                </div>
              )}
            </form>
          </div>
        )}

        {step === "list" && (
          <>
            <div className="rounded-xl border bg-primary/5 px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              تم التحقق برقم {phoneMasked || "جوالك"}
              {sessionExpiresAt && (
                <span className="ms-auto text-xs">
                  الجلسة سارية حتى{" "}
                  {new Date(sessionExpiresAt).toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            {listAppts.isPending && appointments.length === 0 && (
              <div className="bg-card border rounded-2xl p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                جاري تحميل حجوزاتك…
              </div>
            )}

            {!listAppts.isPending && appointments.length === 0 && (
              <div className="bg-card border rounded-2xl p-8 text-center">
                <div className="text-sm text-muted-foreground mb-4">
                  لا توجد حجوزات مرتبطة بهذا الرقم.
                </div>
                <Link
                  to="/book"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 h-9 text-xs font-semibold hover:bg-primary/90"
                >
                  حجز موعد جديد
                </Link>
              </div>
            )}

            {appointments.map((a) => {
              const statusMeta = STATUS[a.status] ?? {
                label: a.status,
                color: "bg-gray-100 text-gray-700 border-gray-200",
              };
              const isActive = a.status === "new" || a.status === "confirmed";
              return (
                <div
                  key={a.id}
                  className="bg-card border rounded-2xl p-5 md:p-6 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">رقم المرجع</div>
                      <div className="font-mono font-bold text-sm">{a.reference}</div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusMeta.color}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 border-t pt-4 text-sm">
                    {a.patient_name && (
                      <Row icon={<User2 className="h-4 w-4" />} label="المريض" value={a.patient_name} />
                    )}
                    {a.doctor_name_ar && (
                      <Row
                        icon={<Stethoscope className="h-4 w-4" />}
                        label="الطبيب"
                        value={a.doctor_name_ar}
                      />
                    )}
                    {a.specialty_name_ar && (
                      <Row label="التخصص" value={a.specialty_name_ar} />
                    )}
                    {a.branch_name_ar && (
                      <Row
                        icon={<Building2 className="h-4 w-4" />}
                        label="الفرع"
                        value={a.branch_name_ar}
                      />
                    )}
                    <Row
                      icon={<CalendarClock className="h-4 w-4" />}
                      label="التاريخ"
                      value={`${formatDate(a.date)} — ${a.time}`}
                    />
                  </div>

                  {isActive && activeCancelId !== a.id && activeReschedId !== a.id && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveReschedId(a.id);
                          setActiveCancelId(null);
                          setRescheduleDate("");
                          setRescheduleTime(a.time || "10:00");
                          setErrorMsg(null);
                        }}
                      >
                        <CalendarClock className="h-4 w-4 ml-1" /> إعادة الجدولة
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/5 border-destructive/30"
                        onClick={() => {
                          setActiveCancelId(a.id);
                          setActiveReschedId(null);
                          setCancelReason("");
                          setErrorMsg(null);
                        }}
                      >
                        <XCircle className="h-4 w-4 ml-1" /> إلغاء
                      </Button>
                    </div>
                  )}

                  {activeCancelId === a.id && (
                    <div className="border-t pt-4 space-y-3">
                      <div className="text-sm font-semibold">تأكيد إلغاء الحجز</div>
                      <div>
                        <Label htmlFor={`reason-${a.id}`}>سبب الإلغاء (اختياري)</Label>
                        <Textarea
                          id={`reason-${a.id}`}
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="اذكر السبب باختصار…"
                          maxLength={500}
                          className="mt-1.5"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActiveCancelId(null);
                            setCancelReason("");
                          }}
                          disabled={cancelAppt.isPending}
                        >
                          تراجع
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          disabled={cancelAppt.isPending}
                          onClick={() =>
                            cancelAppt.mutate({ id: a.id, reason: cancelReason })
                          }
                        >
                          {cancelAppt.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري…
                            </>
                          ) : (
                            "تأكيد الإلغاء"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {activeReschedId === a.id && (
                    <div className="border-t pt-4 space-y-3">
                      <div className="text-sm font-semibold">اختر تاريخًا ووقتًا جديدًا</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label htmlFor={`date-${a.id}`}>التاريخ</Label>
                          <Input
                            id={`date-${a.id}`}
                            type="date"
                            min={minDateIso}
                            value={rescheduleDate}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            className="mt-1.5"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor={`time-${a.id}`}>الوقت</Label>
                          <Input
                            id={`time-${a.id}`}
                            type="time"
                            value={rescheduleTime}
                            onChange={(e) => setRescheduleTime(e.target.value)}
                            className="mt-1.5"
                            required
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        سيتم تحديث حالة الحجز إلى "جديد — بانتظار التأكيد" بعد
                        إعادة الجدولة، وقد يتواصل معك المجمّع لتأكيد الوقت.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActiveReschedId(null);
                            setRescheduleDate("");
                            setRescheduleTime("");
                          }}
                          disabled={rescheduleAppt.isPending}
                        >
                          تراجع
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={
                            rescheduleAppt.isPending ||
                            !rescheduleDate ||
                            !rescheduleTime
                          }
                          onClick={() =>
                            rescheduleAppt.mutate({
                              id: a.id,
                              date: rescheduleDate,
                              time: rescheduleTime,
                            })
                          }
                        >
                          {rescheduleAppt.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري…
                            </>
                          ) : (
                            "تأكيد إعادة الجدولة"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {errorMsg && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 text-destructive text-sm p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="text-muted-foreground mt-0.5">{icon}</span>}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium truncate">{value}</div>
      </div>
    </div>
  );
}
