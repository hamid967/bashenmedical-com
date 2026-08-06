/**
 * `/auth/register` — Andalusia-style create-account panel (phone OTP first).
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
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
    meta: [{ title: "إنشاء حساب — باعشن الطبي" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const issue = useServerFn(issueOtp);
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bookingIntent =
    !!search.next && (search.next === "/book" || search.next.startsWith("/book?"));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (fullName.trim().length >= 2 && typeof window !== "undefined") {
      try {
        sessionStorage.setItem("auth:register-name", fullName.trim());
      } catch {
        /* ignore */
      }
    }
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
    return (
      <div>
        <h1 className="auth-title">تم التحقق من رقمك</h1>
        <p className="auth-subtitle">يمكنك الآن تسجيل الدخول ومتابعة خدمات المنصة.</p>
        <Link
          to="/auth/login"
          search={search.next ? { next: search.next } : undefined}
          className="auth-submit mt-6 inline-flex no-underline"
        >
          الذهاب لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="auth-title">إنشاء حساب</h1>
      <p className="auth-subtitle">
        {bookingIntent
          ? "أنشئ حسابك أولاً — حجز المواعيد متاح لأعضاء المنصة فقط"
          : "سجّل بياناتك وسنتحقق من رقم جوالك عبر واتساب"}
      </p>

      {/* Lightweight step hint (Andalusia-style progress cue) */}
      <ol className="mt-5 mb-2 grid grid-cols-3 gap-2 text-center text-[11px]">
        {[
          { n: "1", t: "الجوال", d: "تحقق واتساب" },
          { n: "2", t: "الرمز", d: "تأكيد الهوية" },
          { n: "3", t: "الدخول", d: "بدء الاستخدام" },
        ].map((s, i) => (
          <li
            key={s.n}
            className="rounded-xl border border-[color:var(--border)] bg-muted/20 px-2 py-2.5"
          >
            <div
              className={`mx-auto mb-1 grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                i === 0
                  ? "bg-[color:var(--brand-gold)] text-[color:var(--brand-deep)]"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s.n}
            </div>
            <div className="font-semibold text-foreground">{s.t}</div>
            <div className="text-muted-foreground">{s.d}</div>
          </li>
        ))}
      </ol>

      {bookingIntent && (
        <Alert className="mt-4 border-[color:var(--brand-gold-soft)] bg-[color:var(--brand-mist)]">
          <AlertDescription className="text-[color:var(--brand-deep)] text-sm leading-6">
            بعد إنشاء الحساب ستُعاد تلقائيًا إلى صفحة الحجز لإكمال موعدك.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="auth-label" htmlFor="fullName">
            الاسم الكامل
            <span className="req">*</span>
          </label>
          <input
            id="fullName"
            className="auth-input"
            type="text"
            placeholder="اكتب اسمك كما في الهوية"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            autoComplete="name"
          />
        </div>
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
              dir="ltr"
              placeholder="5XXXXXXXX"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
              autoComplete="tel"
            />
          </div>
        </div>
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          تحقق ومتابعة
        </button>
      </form>

      <div className="auth-footer">
        لديك حساب بالفعل؟{" "}
        <Link to="/auth/login" search={search.next ? { next: search.next } : undefined}>
          تسجيل الدخول
        </Link>
      </div>
    </div>
  );
}
