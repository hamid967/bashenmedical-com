/**
 * `/auth/login` — Andalusia-style welcome panel with email / phone tabs.
 * Logic preserved: WhatsApp OTP, email+password, Google/Apple SSO, next redirect.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Loader2, Apple } from "lucide-react";
import { issueOtp } from "@/lib/auth/otp.functions";
import { getMyRolesAndHome } from "@/lib/auth/resolve-home.functions";
import { sanitizeNext } from "@/lib/auth/redirect";
import { lovable } from "@/integrations/lovable";

const Search = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth/login")({
  validateSearch: (s) => Search.parse(s),
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — باعشن الطبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const issue = useServerFn(issueOtp);
  const resolveHome = useServerFn(getMyRolesAndHome);

  const [tab, setTab] = useState<"email" | "mobile">("email");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextParam = sanitizeNext(search.next);
  const bookingIntent = !!nextParam && (nextParam === "/book" || nextParam.startsWith("/book?"));

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      const stashed = typeof window !== "undefined" ? sessionStorage.getItem("auth:next") : null;
      if (stashed && typeof window !== "undefined") sessionStorage.removeItem("auth:next");
      const dest = nextParam ?? sanitizeNext(stashed ?? undefined);
      resolveHome({}).then((r) => {
        if (!active) return;
        navigate({ to: dest ?? r.home, replace: true });
      });
    });
    return () => {
      active = false;
    };
  }, [navigate, nextParam, resolveHome]);

  async function handleSSO(provider: "google" | "apple") {
    setError(null);
    setBusy(true);
    if (typeof window !== "undefined" && nextParam) {
      sessionStorage.setItem("auth:next", nextParam);
    }
    const res = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (res.redirected) return;
    if (res.error) {
      setBusy(false);
      setError(res.error.message || "تعذّر تسجيل الدخول عبر مزوّد الهوية.");
      return;
    }
    const r = await resolveHome({});
    setBusy(false);
    navigate({ to: nextParam ?? r.home, replace: true });
  }

  async function handleMobileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await issue({
      data: { channel: "whatsapp", destination: mobile, purpose: "login", locale: "ar" },
    });
    setBusy(false);
    if (!res.ok) {
      setError(errorMessage(res.error));
      return;
    }
    navigate({
      to: "/auth/verify",
      search: {
        challengeId: res.challengeId,
        expiresAt: res.expiresAt,
        purpose: "login",
        next: nextParam ?? undefined,
      },
    });
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (typeof window !== "undefined") {
      try {
        if (remember) localStorage.setItem("auth:remember-email", email);
        else localStorage.removeItem("auth:remember-email");
      } catch {
        /* ignore */
      }
    }
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signErr) {
      setBusy(false);
      setError(signErr.message);
      return;
    }
    const r = await resolveHome({});
    setBusy(false);
    navigate({ to: nextParam ?? r.home, replace: true });
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("auth:remember-email");
      if (saved) setEmail(saved);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div>
      <h1 className="auth-title">مرحبًا بعودتك</h1>
      <p className="auth-subtitle">مرحبًا بعودتك إلى حسابك في مجمع باعشن الطبي</p>

      {bookingIntent && (
        <Alert className="mt-4 border-[color:var(--brand-gold-soft)] bg-[color:var(--brand-mist)]">
          <AlertDescription className="text-[color:var(--brand-deep)] text-sm leading-6">
            حجز المواعيد متاح لأعضاء المنصة فقط. سجّل الدخول أو{" "}
            <Link
              to="/auth/register"
              search={{ next: nextParam ?? "/book" }}
              className="font-semibold underline"
            >
              أنشئ حسابًا
            </Link>{" "}
            للمتابعة.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="auth-tabs" role="tablist" aria-label="طريقة الدخول">
        <button
          type="button"
          role="tab"
          className="auth-tab"
          aria-selected={tab === "email"}
          onClick={() => setTab("email")}
        >
          البريد الإلكتروني
        </button>
        <button
          type="button"
          role="tab"
          className="auth-tab"
          aria-selected={tab === "mobile"}
          onClick={() => setTab("mobile")}
        >
          رقم الهاتف
        </button>
      </div>

      {tab === "email" ? (
        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <div>
            <label className="auth-label" htmlFor="email">
              البريد الإلكتروني
              <span className="req">*</span>
            </label>
            <input
              id="email"
              className="auth-input"
              type="email"
              dir="ltr"
              placeholder="اكتب عنوان بريدك الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="auth-label" htmlFor="password">
              كلمة المرور
              <span className="req">*</span>
            </label>
            <div className="relative">
              <input
                id="password"
                className="auth-input pe-11"
                type={showPassword ? "text" : "password"}
                placeholder="اكتب كلمة المرور هنا"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="auth-row">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-border"
              />
              تذكرني
            </label>
            <Link to="/auth/recovery" className="font-semibold text-[color:var(--brand)] underline">
              نسيت كلمة المرور؟
            </Link>
          </div>
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            تسجيل الدخول
          </button>
        </form>
      ) : (
        <form onSubmit={handleMobileSubmit} className="space-y-3">
          <div>
            <label className="auth-label" htmlFor="mobile">
              رقم الهاتف
              <span className="req">*</span>
            </label>
            <div className="flex gap-2" dir="ltr">
              <span className="inline-flex items-center rounded-xl border border-[color:var(--border)] bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
                +966
              </span>
              <input
                id="mobile"
                className="auth-input"
                type="tel"
                inputMode="tel"
                placeholder="5XXXXXXXX"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
                autoComplete="tel"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-5">
            سنرسل رمز تحقق عبر واتساب لتأكيد هويتك بأمان.
          </p>
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            إرسال رمز التحقق
          </button>
        </form>
      )}

      <div className="auth-divider">أو</div>

      <div className="auth-sso">
        <button
          type="button"
          className="auth-sso-btn"
          disabled={busy}
          onClick={() => handleSSO("google")}
        >
          <GoogleGlyph className="h-4 w-4" />
          متابعة عبر Google
        </button>
        <button
          type="button"
          className="auth-sso-btn"
          disabled={busy}
          onClick={() => handleSSO("apple")}
        >
          <Apple className="h-4 w-4" />
          متابعة عبر Apple
        </button>
      </div>

      <div className="auth-footer">
        ليس لديك حساب؟{" "}
        <Link to="/auth/register" search={nextParam ? { next: nextParam } : undefined}>
          سجّل الآن
        </Link>
      </div>
    </div>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case "rate_limited":
      return "تم تجاوز عدد المحاولات المسموح بها. الرجاء المحاولة لاحقًا.";
    case "cooldown_active":
      return "الرجاء الانتظار قبل طلب رمز جديد.";
    case "invalid_destination":
      return "رقم الجوال غير صحيح.";
    case "provider_unavailable":
      return "خدمة الرسائل غير متاحة حاليًا. الرجاء المحاولة لاحقًا أو استخدام البريد الإلكتروني.";
    case "storage_failed":
      return "حدث خطأ في الخادم. الرجاء المحاولة مرة أخرى.";
    default:
      return "تعذّر إرسال رمز التحقق. الرجاء المحاولة مرة أخرى.";
  }
}
