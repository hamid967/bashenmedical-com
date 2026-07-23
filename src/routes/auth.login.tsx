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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck } from "lucide-react";
import { issueOtp } from "@/lib/auth/otp.functions";
import { getMyRolesAndHome } from "@/lib/auth/resolve-home.functions";
import { sanitizeNext } from "@/lib/auth/redirect";

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

  // If already signed in, bounce out immediately.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      resolveHome({}).then((r) => {
        if (!active) return;
        navigate({ to: nextParam ?? r.home, replace: true });
      });
    });
    return () => {
      active = false;
    };
  }, [navigate, nextParam, resolveHome]);

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
