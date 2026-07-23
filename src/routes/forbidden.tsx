/**
 * `/forbidden` — accessible 403 shown when a signed-in user reaches a
 * route their role does not cover, or when `getMyRolesAndHome` maps them
 * to `unknown`. Focus lands on the primary action so screen readers
 * announce it immediately.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/forbidden")({
  head: () => ({
    meta: [
      { title: "غير مصرح — باعشن الطبي" },
      {
        name: "description",
        content: "لا تملك صلاحية الوصول إلى هذه الصفحة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ForbiddenPage,
});

function ForbiddenPage() {
  const primary = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    primary.current?.focus();
  }, []);
  return (
    <main
      role="main"
      aria-labelledby="forbidden-title"
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted/20"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden />
          </div>
          <CardTitle id="forbidden-title">غير مصرح بالوصول</CardTitle>
          <CardDescription>
            حسابك لا يملك الصلاحية اللازمة لعرض هذه الصفحة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full">
            <Link to="/" ref={primary}>
              العودة للصفحة الرئيسية
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth/login">تسجيل الدخول بحساب آخر</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
