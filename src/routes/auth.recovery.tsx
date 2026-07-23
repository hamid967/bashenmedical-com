/**
 * `/auth/recovery` — password reset via email link. Uses Supabase's
 * built-in recovery flow so we don't reinvent password reset.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

const Search = z.object({ verified: z.string().uuid().optional() });

export const Route = createFileRoute("/auth/recovery")({
  validateSearch: (s) => Search.parse(s),
  head: () => ({
    meta: [
      { title: "استعادة كلمة المرور — باعشن الطبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RecoveryPage,
});

function RecoveryPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>استعادة كلمة المرور</CardTitle>
        <CardDescription>سنرسل رابط إعادة تعيين إلى بريدك</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <Alert>
            <AlertDescription>
              تم إرسال رابط إعادة التعيين إلى {email}. تحقق من صندوق الوارد.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                إرسال رابط الاستعادة
              </Button>
            </form>
          </>
        )}
        <div className="mt-4 text-center text-sm">
          <Link to="/auth/login" className="text-muted-foreground underline">
            رجوع لتسجيل الدخول
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
