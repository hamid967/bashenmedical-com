/**
 * `/auth/update-mobile` — signed-in mobile-number change with OTP on the
 * new number. Sits at top level (not under `_authenticated/`) so the URL
 * stays under `/auth/*` per the Phase 2 spec, but the beforeLoad gate
 * requires an active Supabase session.
 */
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { issueOtp } from "@/lib/auth/otp.functions";

export const Route = createFileRoute("/auth/update-mobile")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/auth/login", search: { next: location.pathname } });
    }
  },
  head: () => ({
    meta: [
      { title: "تحديث رقم الجوال — باعشن الطبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UpdateMobilePage,
});

function UpdateMobilePage() {
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
      data: { channel: "whatsapp", destination: mobile, purpose: "mobile_change", locale: "ar" },
    });
    setBusy(false);
    if (!res.ok) {
      setError("تعذّر إرسال الرمز. الرجاء المحاولة لاحقًا.");
      return;
    }
    navigate({
      to: "/auth/verify",
      search: {
        challengeId: res.challengeId,
        expiresAt: res.expiresAt,
        purpose: "mobile_change",
      },
    });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>تحديث رقم الجوال</CardTitle>
        <CardDescription>
          أدخل الرقم الجديد. سنرسل رمز تحقق لتأكيد ملكيته قبل التبديل.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="mobile">رقم الجوال الجديد</Label>
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
          <div className="text-center text-sm">
            <Link to="/patient" className="text-muted-foreground underline">
              إلغاء
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
