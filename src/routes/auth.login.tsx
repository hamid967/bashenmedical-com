/**
 * `/auth/login` — unified sign-in with three tabs:
 *   1. Mobile OTP (WhatsApp) — patients and staff with a registered mobile
 *   2. Email + password fallback — for accounts that don't use OTP
 *   3. Nafath — disabled placeholder (adapter is not_configured)
 *
 * After a successful sign-in the client asks the server for the user's
 * primary role home (`getMyRolesAndHome`) and navigates there, unless a
 * sanitized `next` search param requested a specific same-origin path.
 * The client never trusts locally-decoded role claims for redirect.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui-v3";
import { Input } from "@/components/ui-v3";
import { Label } from "@/components/ui-v3";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui-v3";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-v3";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck, Apple } from "lucide-react";
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
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}


function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const issue = useServerFn(issueOtp);
  const resolveHome = useServerFn(getMyRolesAndHome);

  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextParam = sanitizeNext(search.next);

  // If already signed in, bounce out immediately. Honor a stashed post-SSO next.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      const stashed =
        typeof window !== "undefined" ? sessionStorage.getItem("auth:next") : null;
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
    // Stash intended destination — the OAuth round-trip drops URL search params.
    if (typeof window !== "undefined" && nextParam) {
      sessionStorage.setItem("auth:next", nextParam);
    }
    const res = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (res.redirected) return; // browser navigating to provider
    if (res.error) {
      setBusy(false);
      setError(res.error.message || "تعذّر تسجيل الدخول عبر مزوّد الهوية.");
      return;
    }
    // Popup/web_message flow: session already set — resolve home.
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

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <CardTitle>تسجيل الدخول</CardTitle>
        <CardDescription>مجمع باعشن الطبي — دخول موحّد آمن</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Single Sign-On */}
        <div className="space-y-2 mb-4">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={busy}
            onClick={() => handleSSO("google")}
            aria-label="تسجيل الدخول عبر Google"
          >
            <GoogleGlyph className="h-4 w-4" />
            متابعة عبر Google
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={busy}
            onClick={() => handleSSO("apple")}
            aria-label="تسجيل الدخول عبر Apple"
          >
            <Apple className="h-4 w-4" />
            متابعة عبر Apple
          </Button>
        </div>
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">أو</span>
          </div>
        </div>

        <Tabs defaultValue="mobile">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="mobile">جوال</TabsTrigger>
            <TabsTrigger value="email">إيميل</TabsTrigger>
            <TabsTrigger value="nafath" disabled>
              نفاذ (قريبًا)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mobile" className="mt-4">
            <form onSubmit={handleMobileSubmit} className="space-y-3">
              <div>
                <Label htmlFor="mobile">رقم الجوال</Label>
                <Input
                  id="mobile"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  placeholder="05XXXXXXXX"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  required
                  autoComplete="tel"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                إرسال رمز التحقق عبر واتساب
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="email" className="mt-4">
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div>
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                تسجيل الدخول
              </Button>
              <div className="text-sm text-center">
                <Link to="/auth/recovery" className="text-primary underline">
                  نسيت كلمة المرور؟
                </Link>
              </div>
            </form>
          </TabsContent>
        </Tabs>

        <div className="mt-6 pt-4 border-t text-center text-sm text-muted-foreground">
          مستخدم جديد؟{" "}
          <Link to="/auth/register" className="text-primary underline">
            إنشاء حساب
          </Link>
        </div>
      </CardContent>
    </Card>
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
