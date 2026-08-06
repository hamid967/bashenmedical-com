/**
 * `/auth/recovery` — password reset via email link.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
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
    <div>
      <h1 className="auth-title">استعادة كلمة المرور</h1>
      <p className="auth-subtitle">سنرسل رابط إعادة تعيين إلى بريدك الإلكتروني</p>

      {sent ? (
        <Alert className="mt-4">
          <AlertDescription>
            تم إرسال رابط إعادة التعيين إلى {email}. تحقق من صندوق الوارد.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
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
              />
            </div>
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              إرسال رابط الاستعادة
            </button>
          </form>
        </>
      )}
      <div className="auth-footer">
        <Link to="/auth/login">رجوع لتسجيل الدخول</Link>
      </div>
    </div>
  );
}
