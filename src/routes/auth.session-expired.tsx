/**
 * `/auth/session-expired` — landing when a protected session ends.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Clock } from "lucide-react";

const searchSchema = z.object({
  next: z.string().startsWith("/").optional().catch(undefined),
});

export const Route = createFileRoute("/auth/session-expired")({
  validateSearch: (input) => searchSchema.parse(input),
  head: () => ({
    meta: [
      { title: "انتهت الجلسة — باعشن الطبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SessionExpiredPage,
});

function SessionExpiredPage() {
  const { next } = Route.useSearch();
  const loginSearch = next ? { next } : undefined;
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Clock className="h-5 w-5" aria-hidden />
      </div>
      <h1 className="auth-title">انتهت الجلسة</h1>
      <p className="auth-subtitle">
        تم إنهاء جلستك لأسباب أمنية. الرجاء تسجيل الدخول مرة أخرى للمتابعة.
      </p>
      <Link
        to="/auth/login"
        search={loginSearch as never}
        className="auth-submit mt-6 inline-flex no-underline"
      >
        تسجيل الدخول
      </Link>
    </div>
  );
}
