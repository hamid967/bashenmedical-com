/**
 * `/auth/session-expired` — landing page when a protected server function
 * returns 401 while the tab is still open (session revoked from another
 * device, token expired past refresh window, etc.).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <Clock className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <CardTitle>انتهت الجلسة</CardTitle>
        <CardDescription>
          تم إنهاء جلستك لأسباب أمنية. الرجاء تسجيل الدخول مرة أخرى للمتابعة.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link to="/auth/login" search={loginSearch as never}>
            تسجيل الدخول
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

