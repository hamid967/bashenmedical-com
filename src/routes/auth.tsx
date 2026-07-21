import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useState, useEffect, useId } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { z } from "zod";
import { logAuthEvent } from "@/lib/auth-log.functions";
import { bmcOgImageMeta } from "@/lib/og-meta";
import {
  Mail,
  Lock,
  User as UserIcon,
  Sparkles,
  Loader2,
  Eye,
  EyeOff,
  Phone,
  KeyRound,
  ArrowRight,
} from "lucide-react";

// Normalize a Saudi phone input to E.164 (+9665XXXXXXXX).
// Accepts: 05XXXXXXXX, 5XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX
function normalizeSaPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let n = digits;
  if (n.startsWith("00")) n = "+" + n.slice(2);
  if (n.startsWith("+9665") && n.length === 13) return n;
  if (n.startsWith("9665") && n.length === 12) return "+" + n;
  if (n.startsWith("05") && n.length === 10) return "+966" + n.slice(1);
  if (n.startsWith("5") && n.length === 9) return "+966" + n;
  return null;
}

const search = z.object({ redirect: z.string().optional() });

function safeLog(input: {
  action: "login_success" | "login_failed" | "logout" | "signup_success" | "signup_failed";
  user_id?: string | null;
  email?: string | null;
  metadata?: Record<string, any> | null;
}) {
  (logAuthEvent as any)({ data: input }).catch(() => {});
}

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "تسجيل الدخول | مجمع باعشن الطبي" },
      {
        name: "description",
        content: "بوابة المريض في مجمع باعشن الطبي — سجل دخولك بأمان لإدارة مواعيدك وسجلاتك الطبية.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

async function resolveDefaultDestination(userId: string): Promise<string> {
  // Staff go to /admin; patients go to /portal
  try {
    const { data } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin" as any,
    });
    if (data === true) return "/admin";
  } catch {
    /* ignore */
  }
  try {
    const { data } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "reception" as any,
    });
    if (data === true) return "/admin";
  } catch {
    /* ignore */
  }
  return "/portal/dashboard";
}

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [channel, setChannel] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<null | "google" | "apple">(null);
  // OTP state — supports both email (default) and SMS
  const [otpChannel, setOtpChannel] = useState<"email" | "sms">("email");
  const [otpEmail, setOtpEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<"enter" | "verify">("enter");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [resetLoading, setResetLoading] = useState(false);

  async function handlePasswordReset() {
    if (!email || !email.includes("@")) {
      toast.error("أدخل بريدك الإلكتروني أولًا");
      return;
    }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("أرسلنا رابط استعادة كلمة المرور إلى بريدك");
    } catch (err: any) {
      toast.error(err?.message ?? "تعذر إرسال رابط الاستعادة");
    } finally {
      setResetLoading(false);
    }
  }

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

  function safeRedirectTarget(): string | null {
    if (!redirect) return null;
    if (!redirect.startsWith("/") || redirect.startsWith("//")) return null;
    return redirect;
  }

  async function goToDestination(userId?: string | null) {
    const explicit = safeRedirectTarget();
    if (explicit) {
      if (explicit.includes("?") || explicit.startsWith("/.")) {
        window.location.assign(explicit);
      } else {
        navigate({ to: explicit });
      }
      return;
    }
    const target = userId ? await resolveDefaultDestination(userId) : "/portal/dashboard";
    navigate({ to: target });
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) goToDestination(data.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") goToDestination(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, redirect]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const target = safeRedirectTarget() ?? "/portal/dashboard";
        const { data: signup, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + target,
            data: { full_name: fullName },
          },
        });
        if (error) {
          safeLog({ action: "signup_failed", email, metadata: { error: error.message } });
          throw error;
        }
        safeLog({ action: "signup_success", email, user_id: signup.user?.id ?? null });
        toast.success("تم إنشاء الحساب. تحقق من بريدك الإلكتروني إن لزم.");
      } else {
        const { data: signin, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          safeLog({ action: "login_failed", email, metadata: { error: error.message } });
          throw error;
        }
        safeLog({ action: "login_success", email, user_id: signin.user?.id ?? null });
        toast.success("مرحبًا بعودتك");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setOauthLoading(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) {
        toast.error(
          (result.error as any)?.message ??
            (provider === "apple"
              ? "تسجيل الدخول عبر Apple غير متاح حاليًا."
              : "تعذر تسجيل الدخول عبر Google"),
        );
        setOauthLoading(null);
      }
      // On success the OAuth flow either redirects the browser
      // or the tokens are set — onAuthStateChange handles navigation.
    } catch (err: any) {
      toast.error(err?.message ?? "حدث خطأ في تسجيل الدخول");
      setOauthLoading(null);
    }
  }

  async function handleSendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setOtpLoading(true);
    try {
      if (otpChannel === "email") {
        const value = otpEmail.trim();
        if (!value || !value.includes("@")) {
          toast.error("أدخل بريدًا إلكترونيًا صحيحًا");
          setOtpLoading(false);
          return;
        }
        const { error } = await supabase.auth.signInWithOtp({
          email: value,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: window.location.origin + "/auth",
          },
        });
        if (error) {
          safeLog({ action: "login_failed", email: value, metadata: { via: "email_otp", error: error.message } });
          throw error;
        }
        setOtpStep("verify");
        setOtpCooldown(45);
        toast.success("أُرسل رمز التحقق إلى بريدك الإلكتروني");
      } else {
        const e164 = normalizeSaPhone(phone);
        if (!e164) {
          toast.error("رقم الجوال غير صحيح. أدخل رقمًا سعوديًا (مثال: 05XXXXXXXX)");
          setOtpLoading(false);
          return;
        }
        const { error } = await supabase.auth.signInWithOtp({
          phone: e164,
          options: { channel: "sms" },
        });
        if (error) {
          safeLog({ action: "login_failed", metadata: { via: "phone", error: error.message } });
          throw error;
        }
        setOtpStep("verify");
        setOtpCooldown(45);
        toast.success("أُرسل رمز التحقق إلى جوالك");
      }
    } catch (err: any) {
      const msg = err?.message ?? "تعذر إرسال الرمز";
      toast.error(
        /provider|sms|not.*configured|unsupported/i.test(msg) && otpChannel === "sms"
          ? "خدمة الرسائل غير مفعّلة حاليًا. استخدم البريد الإلكتروني بدلًا من الجوال."
          : msg,
      );
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length < 4) {
      toast.error("أدخل رمز التحقق كاملًا");
      return;
    }
    setOtpLoading(true);
    try {
      let result;
      if (otpChannel === "email") {
        result = await supabase.auth.verifyOtp({
          email: otpEmail.trim(),
          token: otp.trim(),
          type: "email",
        });
      } else {
        const e164 = normalizeSaPhone(phone);
        if (!e164) return;
        result = await supabase.auth.verifyOtp({
          phone: e164,
          token: otp.trim(),
          type: "sms",
        });
      }
      const { data, error } = result;
      if (error) {
        safeLog({ action: "login_failed", metadata: { via: otpChannel === "email" ? "email_otp" : "phone", error: error.message } });
        throw error;
      }
      safeLog({
        action: "login_success",
        user_id: data.user?.id ?? null,
        email: otpChannel === "email" ? otpEmail.trim() : null,
        metadata: { via: otpChannel === "email" ? "email_otp" : "phone" },
      });
      // Best-effort: persist phone into profiles when SMS OTP is used.
      if (otpChannel === "sms" && data.user?.id) {
        const e164 = normalizeSaPhone(phone);
        if (e164) {
          supabase
            .from("profiles")
            .update({ phone: e164 })
            .eq("id", data.user.id)
            .then(() => {}, () => {});
        }
      }
      toast.success("تم تسجيل الدخول بنجاح");
    } catch (err: any) {
      toast.error(err?.message ?? "رمز غير صحيح أو منتهي الصلاحية");
    } finally {
      setOtpLoading(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="min-h-dvh w-full flex flex-col-reverse lg:flex-row-reverse bg-[#081b2d] text-white font-['Cairo',_system-ui,_sans-serif] overflow-hidden selection:bg-[#1FAEFF]/30 relative"
    >
      {/* Ambient background glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#1FAEFF]/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#0D3B66]/40 blur-[100px] rounded-full" />
      </div>

      {/* HERO (right in RTL / visual left) */}
      <div className="hidden lg:flex lg:w-7/12 relative items-center justify-center overflow-hidden border-r border-white/5 bg-[#0D3B66]">
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,#1FAEFF_0%,transparent_50%)]" />
          <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-[#081b2d] to-transparent" />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(rgba(31,174,255,0.18) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="relative z-10 text-center px-12 max-w-2xl">
          <div className="mb-8 inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-[#48C7FF] animate-pulse" />
            <span className="text-xs font-semibold tracking-[0.2em] text-[#48C7FF] uppercase">
              Trusted Medical Excellence
            </span>
          </div>

          <div className="relative">
            <h1 className="text-[12rem] font-black leading-none tracking-tighter opacity-[0.07] select-none absolute -top-20 left-1/2 -translate-x-1/2 pointer-events-none">
              40
            </h1>
            <div className="relative flex flex-col items-center">
              <span className="text-2xl font-light mb-2 text-white/70">أكثر من</span>
              <span className="text-[10rem] leading-none font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-[#1FAEFF] drop-shadow-[0_0_30px_rgba(31,174,255,0.4)]">
                40
              </span>
              <span className="text-3xl font-bold mt-4 tracking-wide">
                عاماً من العطاء المستمر
              </span>
            </div>
          </div>

          <p className="mt-8 text-lg text-white/60 max-w-lg mx-auto font-light leading-relaxed">
            أربعة عقود من الخبرة الطبية الراسخة، والريادة في تقديم أفضل الرعاية الصحية وفق أعلى المعايير العالمية.
          </p>

          {/* Pulse Animation */}
          <div className="mt-12 h-24 w-full flex items-center justify-center">
            <svg className="w-full max-w-md h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
              <path
                d="M0 50 L120 50 L135 30 L150 70 L170 10 L190 90 L210 40 L225 55 L400 50"
                fill="none"
                stroke="#1FAEFF"
                strokeWidth="2"
                strokeLinecap="round"
                style={{
                  strokeDasharray: 900,
                  strokeDashoffset: 900,
                  animation: "authPulseDash 3.2s linear infinite",
                }}
              />
            </svg>
          </div>
        </div>

        {/* Bottom stats */}
        <div className="absolute bottom-10 right-10 flex gap-6 opacity-70 rtl:right-auto rtl:left-10">
          <div className="flex flex-col items-end">
            <span className="text-[10px] tracking-widest text-[#48C7FF]">HOSPITAL CAPACITY</span>
            <span className="text-xl font-mono">98.4%</span>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] tracking-widest text-[#48C7FF]">PATIENT CARE</span>
            <span className="text-xl font-mono">24/7</span>
          </div>
        </div>
      </div>

      {/* AUTH CARD (left in RTL / visual right) */}
      <div className="w-full lg:w-5/12 flex items-center justify-center p-6 lg:p-10 relative z-10">
        <div className="w-full max-w-md bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-[2rem] p-7 md:p-9 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-52 h-52 bg-[#1FAEFF]/25 blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-52 h-52 bg-[#48C7FF]/10 blur-[80px] pointer-events-none" />

          {/* Header */}
          <div className="relative text-center mb-8">
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 bg-gradient-to-br from-[#1FAEFF] to-[#48C7FF] rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(31,174,255,0.55)]">
                <span className="text-white text-3xl font-black">ب</span>
              </div>
            </div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#1FAEFF]/40 bg-[#1FAEFF]/10 px-3 py-1 text-[11px] font-semibold text-[#48C7FF]">
              بوابة المراجعين
            </div>
            <h2 className="text-2xl font-bold">
              {mode === "signin" ? "مرحباً بك مجدداً" : "أنشئ حسابك"}
            </h2>
            <p className="text-white/50 text-sm font-light mt-1">
              سجّل دخولك للوصول إلى لوحة تحكمك الخاصة
            </p>
          </div>

          {/* Social Auth */}
          <div className="relative grid grid-cols-2 gap-3 mb-4">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={!!oauthLoading}
              className="flex items-center justify-center gap-2 h-11 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#1FAEFF]/40 transition-all disabled:opacity-60 text-sm font-medium"
            >
              {oauthLoading === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("apple")}
              disabled={!!oauthLoading}
              className="flex items-center justify-center gap-2 h-11 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#1FAEFF]/40 transition-all disabled:opacity-60 text-sm font-medium"
            >
              {oauthLoading === "apple" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AppleIcon />
              )}
              Apple
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center mb-5">
            <div className="flex-grow border-t border-white/10" />
            <span className="mx-4 text-[10px] text-white/40 uppercase tracking-[0.2em]">
              {channel === "email" ? "أو عبر البريد وكلمة المرور" : "أو عبر رمز تحقق (OTP)"}
            </span>
            <div className="flex-grow border-t border-white/10" />
          </div>

          {/* Channel tabs */}
          <div className="relative mb-5 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.03] border border-white/10 p-1">
            <button
              type="button"
              onClick={() => setChannel("email")}
              className={`h-9 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition ${
                channel === "email"
                  ? "bg-[#1FAEFF] text-white shadow-[0_4px_15px_rgba(31,174,255,0.35)]"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <Lock className="h-3.5 w-3.5" /> بريد + كلمة مرور
            </button>
            <button
              type="button"
              onClick={() => {
                setChannel("otp");
                setOtpStep("enter");
              }}
              className={`h-9 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition ${
                channel === "otp"
                  ? "bg-[#1FAEFF] text-white shadow-[0_4px_15px_rgba(31,174,255,0.35)]"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" /> رمز OTP
            </button>
          </div>


          {channel === "email" ? (
            <form onSubmit={handleSubmit} className="relative space-y-4">
              {mode === "signup" && (
                <Field
                  icon={<UserIcon className="h-4 w-4" />}
                  label="الاسم الكامل"
                  type="text"
                  value={fullName}
                  onChange={setFullName}
                  required
                />
              )}
              <Field
                icon={<Mail className="h-4 w-4" />}
                label="البريد الإلكتروني"
                type="email"
                value={email}
                onChange={setEmail}
                required
                dir="ltr"
              />
              <div>
                <div className="flex justify-between items-center px-1 mb-1.5">
                  <label htmlFor="auth-password" className="text-xs font-semibold text-[#48C7FF]">كلمة المرور</label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      disabled={resetLoading}
                      className="text-[10px] text-white/40 hover:text-white transition-colors"
                    >
                      {resetLoading ? "جارٍ الإرسال…" : "نسيت كلمة المرور؟"}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 start-3 grid place-items-center text-white/40">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    id="auth-password"
                    name="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    type={showPass ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    placeholder="••••••••"
                    className="w-full h-12 rounded-xl bg-white/5 border border-white/10 ps-10 pe-10 text-sm outline-none placeholder:text-white/20 focus:border-[#1FAEFF] focus:bg-white/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute inset-y-0 end-2 grid place-items-center text-white/40 hover:text-[#48C7FF] w-8"
                    aria-label={showPass ? "إخفاء" : "إظهار"}
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {mode === "signin" && (
                <div className="flex items-center gap-3 pt-1">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 accent-[#1FAEFF]"
                  />
                  <label htmlFor="remember" className="text-xs text-white/60 cursor-pointer">
                    تذكر بيانات الدخول
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 mt-2 rounded-xl bg-gradient-to-r from-[#1FAEFF] to-[#48C7FF] text-white font-bold text-base shadow-[0_8px_25px_rgba(31,174,255,0.3)] hover:shadow-[0_8px_35px_rgba(31,174,255,0.55)] active:scale-[0.98] transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}
              </button>
            </form>
          ) : otpStep === "enter" ? (
            <form onSubmit={handleSendOtp} className="relative space-y-4">
              {/* Sub-channel: email (default) or SMS */}
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.03] border border-white/10 p-1">
                <button
                  type="button"
                  onClick={() => setOtpChannel("email")}
                  className={`h-8 rounded-md text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition ${
                    otpChannel === "email"
                      ? "bg-[#1FAEFF]/90 text-white"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  <Mail className="h-3 w-3" /> عبر البريد
                </button>
                <button
                  type="button"
                  onClick={() => setOtpChannel("sms")}
                  className={`h-8 rounded-md text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition ${
                    otpChannel === "sms"
                      ? "bg-[#1FAEFF]/90 text-white"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  <Phone className="h-3 w-3" /> عبر الجوال (SMS)
                </button>
              </div>

              {otpChannel === "email" ? (
                <div>
                  <label htmlFor="otp-email" className="mb-1.5 block text-xs font-semibold text-[#48C7FF] px-1">
                    البريد الإلكتروني
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 start-3 grid place-items-center text-white/40">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      id="otp-email"
                      type="email"
                      required
                      inputMode="email"
                      autoComplete="email"
                      value={otpEmail}
                      onChange={(e) => setOtpEmail(e.target.value)}
                      placeholder="name@example.com"
                      dir="ltr"
                      className="w-full h-12 rounded-xl bg-white/5 border border-white/10 ps-10 pe-3 text-sm outline-none placeholder:text-white/20 focus:border-[#1FAEFF] focus:bg-white/10 transition-all"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-white/40 px-1">
                    سنرسل رمز تحقق مكوّن من 6 أرقام إلى بريدك، صالحًا لدقائق قليلة.
                  </p>
                </div>
              ) : (
                <div>
                  <label htmlFor="otp-phone" className="mb-1.5 block text-xs font-semibold text-[#48C7FF] px-1">
                    رقم الجوال
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 start-3 grid place-items-center text-white/40">
                      <Phone className="h-4 w-4" />
                    </span>
                    <input
                      id="otp-phone"
                      type="tel"
                      required
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="05XXXXXXXX"
                      dir="ltr"
                      className="w-full h-12 rounded-xl bg-white/5 border border-white/10 ps-10 pe-3 text-sm outline-none placeholder:text-white/20 focus:border-[#1FAEFF] focus:bg-white/10 transition-all"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-amber-300/80 px-1">
                    خدمة SMS قد لا تكون مفعّلة بعد — يمكنك استخدام البريد بدلًا منها.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={otpLoading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#1FAEFF] to-[#48C7FF] text-white font-bold text-base shadow-[0_8px_25px_rgba(31,174,255,0.3)] hover:shadow-[0_8px_35px_rgba(31,174,255,0.55)] active:scale-[0.98] transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {otpLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                إرسال رمز التحقق
              </button>
            </form>

          ) : (
            <form onSubmit={handleVerifyOtp} className="relative space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70 flex items-center justify-between">
                <span>
                  الرمز أُرسل إلى{" "}
                  <span dir="ltr" className="font-semibold text-white">
                    {otpChannel === "email" ? otpEmail : (normalizeSaPhone(phone) ?? phone)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOtp("");
                    setOtpStep("enter");
                  }}
                  className="text-[#48C7FF] font-semibold hover:underline"
                >
                  تغيير
                </button>
              </div>

              <div>
                <label htmlFor="otp-code" className="mb-1.5 block text-xs font-semibold text-[#48C7FF] px-1">
                  رمز التحقق
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 start-3 grid place-items-center text-white/40">
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <input
                    id="otp-code"
                    type="text"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="——————"
                    dir="ltr"
                    className="w-full h-12 rounded-xl bg-white/5 border border-white/10 ps-10 pe-3 text-center tracking-[0.4em] text-lg font-bold outline-none placeholder:text-white/20 focus:border-[#1FAEFF] focus:bg-white/10 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={otpLoading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#1FAEFF] to-[#48C7FF] text-white font-bold text-base shadow-[0_8px_25px_rgba(31,174,255,0.3)] hover:shadow-[0_8px_35px_rgba(31,174,255,0.55)] active:scale-[0.98] transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {otpLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                تحقق ودخول
              </button>

              <button
                type="button"
                disabled={otpCooldown > 0 || otpLoading}
                onClick={() => handleSendOtp()}
                className="w-full text-xs text-white/40 hover:text-[#48C7FF] disabled:opacity-60 transition-colors"
              >
                {otpCooldown > 0
                  ? `إعادة الإرسال خلال ${otpCooldown} ثانية`
                  : "لم يصلك الرمز؟ إعادة الإرسال"}
              </button>
            </form>
          )}

          {/* Switch mode */}
          <div className="relative mt-8 text-center">
            <p className="text-sm text-white/50">
              {mode === "signin" ? (
                <>
                  ليس لديك حساب؟{" "}
                  <button
                    className="text-[#48C7FF] font-bold hover:underline underline-offset-4"
                    onClick={() => setMode("signup")}
                  >
                    أنشئ حساباً جديداً
                  </button>
                </>
              ) : (
                <>
                  لديك حساب؟{" "}
                  <button
                    className="text-[#48C7FF] font-bold hover:underline underline-offset-4"
                    onClick={() => setMode("signin")}
                  >
                    سجّل الدخول
                  </button>
                </>
              )}
            </p>
          </div>

          <div className="mt-4 text-center">
            <div className="mb-3 rounded-xl bg-[color:var(--portal-gradient-soft)] px-3 py-2 text-[11px] text-[color:var(--portal-ink-2)]">
              بعد الدخول يمكنك متابعة الحجوزات والتقارير الطبية ونتائج المختبر والأشعة والوصفات.
            </div>
            <Link
              to="/"
              className="text-xs text-[color:var(--portal-ink-3)] hover:text-[color:var(--portal-primary)]"
            >
              ← العودة للموقع الرئيسي
            </Link>
          </div>
        </div>

        {/* Bottom-corner meta */}
        <div className="absolute bottom-6 left-6 hidden md:flex items-center gap-3 text-[10px] text-white/70 uppercase tracking-[0.2em]">
          <span>ISO Certified</span>
          <span className="w-1 h-1 rounded-full bg-white/40" aria-hidden="true" />
          <span>Since 1984</span>
        </div>
      </div>

      <style>{`
        @keyframes authPulseDash {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

/* ---------------------------- Small components --------------------------- */

function Field({
  icon,
  label,
  type,
  value,
  onChange,
  required,
  dir,
}: {
  icon: React.ReactNode;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  dir?: "ltr" | "rtl";
}) {
  const inputId = useId();
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-[#48C7FF] px-1">
        {label}
      </label>
      <div className="relative">
        <span className="absolute inset-y-0 start-3 grid place-items-center text-white/40" aria-hidden="true">
          {icon}
        </span>
        <input
          id={inputId}
          type={type}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir={dir}
          autoComplete={type === "email" ? "email" : type === "text" ? "name" : undefined}
          className="w-full h-12 rounded-xl bg-white/5 border border-white/10 ps-10 pe-3 text-sm outline-none placeholder:text-white/20 focus:border-[#1FAEFF] focus:bg-white/10 transition-all"
        />
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.68l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.85 0-5.27-1.92-6.14-4.51H2.18v2.83C4 20.99 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.86 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.68-2.83z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 4 3.01 2.18 6.05l3.68 2.83C6.73 6.29 9.15 5.38 12 5.38z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-white" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.86-3.08.38-1.09-.5-2.08-.52-3.24 0-1.44.62-2.2.44-3.06-.38C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}
