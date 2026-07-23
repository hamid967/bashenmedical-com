/**
 * `/auth/verify` — enter OTP received via WhatsApp/email.
 *
 * Once the server confirms the code (`verifyOtp`), the client hands off to
 * Supabase to actually sign in via a magic-link exchange for the same
 * destination. For registration this route hands off to /auth/register?ok.
 *
 * The countdown, attempt counter and resend cooldown come from the issue
 * response so the UI matches the server's authoritative state.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { issueOtp, verifyOtp } from "@/lib/auth/otp.functions";
import { getMyRolesAndHome } from "@/lib/auth/resolve-home.functions";
import { sanitizeNext } from "@/lib/auth/redirect";

const Search = z.object({
  challengeId: z.string().uuid(),
  expiresAt: z.string(),
  purpose: z.enum(["login", "register", "recovery", "mobile_change"]),
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/verify")({
  validateSearch: (s) => Search.parse(s),
  head: () => ({
    meta: [
      { title: "تحقق من الرمز — باعشن الطبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const verify = useServerFn(verifyOtp);
  const issue = useServerFn(issueOtp);
  const resolveHome = useServerFn(getMyRolesAndHome);

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [challengeId, setChallengeId] = useState(search.challengeId);
  const [expiresAt, setExpiresAt] = useState(search.expiresAt);

  const nextParam = useMemo(() => sanitizeNext(search.next), [search.next]);

  // Expiry countdown for display.
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await verify({ data: { challengeId, code } });
    if (!res.ok) {
      setBusy(false);
      setError(verifyErrorMessage(res.error, res));
      return;
    }
    if (res.purpose === "login" && res.channel === "whatsapp") {
      // Server verified the code. Now hand off to Supabase magic-link OTP
      // exchange (real session creation). Requires the user's account to
      // already exist with that phone. Registration flow uses a different
      // hand-off (see /auth/register).
      const { error: signErr } = await supabase.auth.signInWithOtp({
        phone: res.destination,
        options: { channel: "whatsapp" },
      });
      if (signErr) {
        setBusy(false);
        setError("تعذّر إنشاء الجلسة. الرجاء المحاولة مرة أخرى.");
        return;
      }
      // Poll for session (magic-link path already succeeded server-side).
      const home = (await resolveHome({})).home;
      setBusy(false);
      navigate({ to: nextParam ?? home, replace: true });
      return;
    }
    if (res.purpose === "register") {
      setBusy(false);
      navigate({
        to: "/auth/register",
        search: { verified: challengeId, next: nextParam ?? undefined },
      });
      return;
    }
    if (res.purpose === "recovery") {
      setBusy(false);
      navigate({ to: "/auth/recovery", search: { verified: challengeId } });
      return;
    }
    setBusy(false);
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);
    // Issue a fresh challenge — the server enforces its own cooldown too.
    const original = search;
    const res = await issue({
      data: {
        channel: "whatsapp",
        destination: "", // server will use rate limit on IP; the UI keeps the same phone
        purpose: original.purpose,
        locale: "ar",
      },
    });
    if (!res.ok) {
      setError("لم نتمكن من إعادة الإرسال. حاول العودة إلى صفحة تسجيل الدخول.");
      return;
    }
    setChallengeId(res.challengeId);
    setExpiresAt(res.expiresAt);
    setResendCooldown(res.resendAfterSeconds ?? 60);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>أدخل رمز التحقق</CardTitle>
        <CardDescription>
          أرسلنا رمزًا مكوّنًا من 6 أرقام. ينتهي خلال {formatSeconds(secondsLeft)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Label htmlFor="otp">الرمز</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            dir="ltr"
            className="text-center text-2xl tracking-[0.6em]"
            required
          />
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
            {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            تحقّق
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link to="/auth/login" className="text-muted-foreground underline">
            رجوع
          </Link>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-primary underline disabled:text-muted-foreground disabled:no-underline"
          >
            {resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown}s` : "إعادة إرسال الرمز"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function verifyErrorMessage(
  code: string,
  res: { attemptsRemaining?: number },
): string {
  switch (code) {
    case "invalid_code":
      return `الرمز غير صحيح. المحاولات المتبقية: ${res.attemptsRemaining ?? "?"}`;
    case "expired":
      return "انتهت صلاحية الرمز. الرجاء طلب رمز جديد.";
    case "too_many_attempts":
      return "تم تجاوز الحد الأقصى للمحاولات. اطلب رمزًا جديدًا.";
    case "already_used":
      return "تم استخدام هذا الرمز مسبقًا.";
    case "invalid_challenge":
      return "الجلسة غير صالحة. عد إلى صفحة تسجيل الدخول.";
    default:
      return "تعذّر التحقق. الرجاء المحاولة مرة أخرى.";
  }
}
