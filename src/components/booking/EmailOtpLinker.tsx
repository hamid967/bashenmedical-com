/**
 * Post-booking guest → account linking via email OTP.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  void lang;
  const { t } = useTranslation("booking");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState<string>(email?.trim().toLowerCase() ?? "");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [linkedCount, setLinkedCount] = useState<number>(0);
  const [cooldown, setCooldown] = useState(0);

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
            setErrorMsg(res.message ?? t("otp.linkFailed"));
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

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpEmail.trim()),
    [otpEmail],
  );

  async function sendCode() {
    if (!emailValid) {
      setErrorMsg(t("otp.invalidEmail"));
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
    toast.success(t("otp.sent"));
  }

  async function verifyCode() {
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setErrorMsg(t("otp.codeMustBe6"));
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
      setErrorMsg(error?.message ?? t("otp.invalidCode"));
      return;
    }
    setSessionEmail(data.user.email ?? null);
    setPhase("linking");
    try {
      const res = await linkGuestAppointments();
      if (res.ok) {
        setLinkedCount(res.linkedCount);
        setPhase("linked");
        toast.success(t("otp.linkedToast", { count: res.linkedCount }));
      } else {
        setPhase("error");
        setErrorMsg(res.message ?? t("otp.linkFailed"));
      }
    } catch (e) {
      setPhase("error");
      setErrorMsg((e as Error).message);
    }
  }

  if (phase === "linked") {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-900/10 p-4 text-start">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/40 grid place-items-center">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              {t("otp.linkedTitle")}
            </div>
            <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
              {sessionEmail && t("otp.signedInAs", { email: sessionEmail })}
              {linkedCount > 0 && (
                <span className="ms-1">{t("otp.linkedCount", { count: linkedCount })}</span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/portal"
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
              >
                <UserIcon className="h-3.5 w-3.5" />
                {t("otp.openPortal")}
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <div className="text-sm font-semibold">{t("otp.cardTitle")}</div>
          <p className="mt-1 text-xs text-muted-foreground">{t("otp.cardDesc")}</p>

          {phase !== "code_sent" && phase !== "verifying" && phase !== "linking" && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                placeholder={t("otp.emailPlaceholder")}
                dir="ltr"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                autoComplete="email"
                aria-label={t("otp.emailPlaceholder")}
              />
              <Button size="sm" onClick={sendCode} disabled={!emailValid || phase === "sending"}>
                {phase === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("otp.sendCode")}
              </Button>
            </div>
          )}

          {(phase === "code_sent" || phase === "verifying" || phase === "linking") && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-muted-foreground">
                {t("otp.codeSentTo", { email: otpEmail })}
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
                  aria-label={t("otp.codeSentTo", { email: otpEmail })}
                />
                <Button
                  size="sm"
                  onClick={verifyCode}
                  disabled={code.length !== 6 || phase === "verifying" || phase === "linking"}
                >
                  {(phase === "verifying" || phase === "linking") ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("otp.verifyLink")}
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
                    ? t("otp.resendIn", { seconds: cooldown })
                    : t("otp.resend")}
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
                  {t("otp.changeEmail")}
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mt-2 text-xs text-destructive" role="alert">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
