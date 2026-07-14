/**
 * Post-booking guest → account linking via email OTP.
 *
 * Flow:
 *  1. Guest completes booking as anon with `patient_email` stored on row.
 *  2. If no session, we render this card on the success screen.
 *  3. User taps "Send code" → `supabase.auth.signInWithOtp({ email })`.
 *  4. User enters 6-digit code → `supabase.auth.verifyOtp(...)` establishes
 *     a session for that email.
 *  5. We then call the `linkGuestAppointments` server fn which finds/creates
 *     the patient row and attaches all matching appointments.
 *
 * If the user is already signed in when this mounts we call the link fn
 * immediately (idempotent) and just show a success line.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { linkGuestAppointments } from "@/lib/patient-link.functions";

type Phase = "idle" | "sending" | "code_sent" | "verifying" | "linking" | "linked" | "error";

export function EmailOtpLinker({
  email,
  lang,
}: {
  email: string | null;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState<string>(email?.trim().toLowerCase() ?? "");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [linkedCount, setLinkedCount] = useState<number>(0);
  const [cooldown, setCooldown] = useState(0);

  // Detect existing session — if signed in, auto-link and short-circuit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (data.user) {
        setSessionEmail(data.user.email ?? null);
        setPhase("linking");
        try {
          const res = await linkGuestAppointments();
          if (cancelled) return;
          if (res.ok) {
            setLinkedCount(res.linkedCount);
            setPhase("linked");
          } else {
            setPhase("error");
            setErrorMsg(res.message ?? (isAr ? "تعذّر ربط الحجوزات" : "Could not link bookings"));
          }
        } catch (e) {
          if (cancelled) return;
          setPhase("error");
          setErrorMsg((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpEmail.trim()),
    [otpEmail],
  );

  async function sendCode() {
    if (!emailValid) {
      setErrorMsg(isAr ? "بريد إلكتروني غير صالح" : "Invalid email");
      return;
    }
    setErrorMsg(null);
    setPhase("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: otpEmail.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    if (error) {
      setPhase("error");
      setErrorMsg(error.message);
      return;
    }
    setPhase("code_sent");
    setCooldown(45);
    toast.success(isAr ? "أُرسل الرمز إلى بريدك" : "Code sent to your email");
  }

  async function verifyCode() {
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setErrorMsg(isAr ? "الرمز يجب أن يكون 6 أرقام" : "Code must be 6 digits");
      return;
    }
    setErrorMsg(null);
    setPhase("verifying");
    const { data, error } = await supabase.auth.verifyOtp({
      email: otpEmail.trim(),
      token,
      type: "email",
    });
    if (error || !data.user) {
      setPhase("code_sent");
      setErrorMsg(error?.message ?? (isAr ? "رمز غير صحيح" : "Invalid code"));
      return;
    }
    setSessionEmail(data.user.email ?? null);
    setPhase("linking");
    try {
      const res = await linkGuestAppointments();
      if (res.ok) {
        setLinkedCount(res.linkedCount);
        setPhase("linked");
        toast.success(
          isAr
            ? `تم إنشاء حسابك وربط ${res.linkedCount} حجز`
            : `Account created and ${res.linkedCount} booking(s) linked`,
        );
      } else {
        setPhase("error");
        setErrorMsg(res.message ?? (isAr ? "تعذّر ربط الحجوزات" : "Could not link bookings"));
      }
    } catch (e) {
      setPhase("error");
      setErrorMsg((e as Error).message);
    }
  }

  // Success state
  if (phase === "linked") {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-900/10 p-4 text-start">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/40 grid place-items-center">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              {isAr ? "تم ربط حجزك بحسابك" : "Booking linked to your account"}
            </div>
            <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
              {sessionEmail && (isAr ? `مسجّل الدخول باسم ${sessionEmail}` : `Signed in as ${sessionEmail}`)}
              {linkedCount > 0 && (
                <span className="ms-1">
                  {isAr
                    ? `— تم ربط ${linkedCount} حجز.`
                    : `— ${linkedCount} booking(s) attached.`}
                </span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/portal"
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
              >
                <UserIcon className="h-3.5 w-3.5" />
                {isAr ? "افتح لوحة المريض" : "Open patient portal"}
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If no email captured during booking and no session, hide (nothing to link).
  if (
    !email &&
    !sessionEmail &&
    phase !== "code_sent" &&
    phase !== "verifying" &&
    phase !== "linking"
  ) {
    return null;
  }

  return (
    <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-start">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-primary/15 grid place-items-center">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {isAr ? "احفظ حجزك بحساب دائم" : "Save this booking to a permanent account"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "أنشئ حسابك بالتحقق من بريدك الإلكتروني لإدارة مواعيدك، تقاريرك، وفواتيرك من مكان واحد."
              : "Verify your email to create an account and manage your appointments, reports, and invoices in one place."}
          </p>

          {phase !== "code_sent" && phase !== "verifying" && phase !== "linking" && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                placeholder={isAr ? "بريدك الإلكتروني" : "you@example.com"}
                dir="ltr"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                autoComplete="email"
              />
              <Button size="sm" onClick={sendCode} disabled={!emailValid || phase === "sending"}>
                {phase === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isAr ? "إرسال الرمز" : "Send code"}
              </Button>
            </div>
          )}

          {(phase === "code_sent" || phase === "verifying" || phase === "linking") && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-muted-foreground">
                {isAr
                  ? `أدخل الرمز المرسل إلى ${otpEmail}`
                  : `Enter the 6-digit code sent to ${otpEmail}`}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  dir="ltr"
                  placeholder="123456"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono tracking-widest text-center"
                />
                <Button
                  size="sm"
                  onClick={verifyCode}
                  disabled={code.length !== 6 || phase === "verifying" || phase === "linking"}
                >
                  {(phase === "verifying" || phase === "linking") ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {isAr ? "تحقّق وربط" : "Verify & link"}
                </Button>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  className="text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                  onClick={sendCode}
                  disabled={cooldown > 0 || phase === "verifying" || phase === "linking"}
                >
                  {cooldown > 0
                    ? isAr
                      ? `إعادة الإرسال بعد ${cooldown}ث`
                      : `Resend in ${cooldown}s`
                    : isAr
                      ? "إعادة إرسال الرمز"
                      : "Resend code"}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => {
                    setPhase("idle");
                    setCode("");
                    setErrorMsg(null);
                  }}
                >
                  {isAr ? "تغيير البريد" : "Change email"}
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mt-2 text-xs text-destructive">{errorMsg}</div>
          )}
        </div>
      </div>
    </div>
  );
}
