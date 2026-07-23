/**
 * `/auth/register` — minimal patient self-registration scaffold.
 *
 * This slice ships the phone-verified handoff and account creation via
 * Supabase phone auth; the full profile-completion form belongs to Phase 2B.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { issueOtp } from "@/lib/auth/otp.functions";

const Search = z.object({
  verified: z.string().uuid().optional(),
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/register")({
  validateSearch: (s) => Search.parse(s),
  head: () => ({
    meta: [
      { title: "إنشاء حساب — باعشن الطبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const issue = useServerFn(issueOtp);
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await issue({
      data: { channel: "whatsapp", destination: mobile, purpose: "register", locale: "ar" },
    });
    setBusy(false);
    if (!res.ok) {
      setError("تعذّر إرسال رمز التحقق. تأكد من رقم الجوال وحاول مرة أخرى.");
      return;
    }
    navigate({
      to: "/auth/verify",
      search: {
        challengeId: res.challengeId,
        expiresAt: res.expiresAt,
        purpose: "register",
        next: search.next,
      },
    });
  }

  if (search.verified) {
    // Post-OTP profile completion is Phase 2B. For now confirm and route home.
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle>تم التحقق من رقمك</CardTitle>
          <CardDescription>
            سنكمل بيانات حسابك قريبًا. يمكنك الآن تسجيل الدخول.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/auth/login">الذهاب لتسجيل الدخول</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>إنشاء حساب</CardTitle>
        <CardDescription>سجّل رقم جوالك للتحقق منه أولاً</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="mobile">رقم الجوال</Label>
            <Input
              id="mobile"
              type="tel"
              dir="ltr"
              placeholder="05XXXXXXXX"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            إرسال رمز التحقق
          </Button>
          <div className="text-sm text-center">
            <Link to="/auth/login" className="text-muted-foreground underline">
              لدي حساب بالفعل
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
