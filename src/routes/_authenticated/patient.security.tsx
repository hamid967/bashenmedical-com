/**
 * Phase 5 — /patient/security — sessions/devices + auth events.
 */
import { createFileRoute } from "@tanstack/react-router";
import { ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Smartphone, Key, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/patient/security")({
  head: () => ({
    meta: [
      { title: "الأمان | بوابة المريض" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SecurityPage,
  errorComponent: ({ error, reset }) => <ErrorState description={error.message} onRetry={reset} />,
});

function SecurityPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الأمان والخصوصية</h1>

      <SectionLink
        icon={Smartphone}
        title="الأجهزة النشطة"
        description="راجع الجلسات المسجّلة على حسابك وأغلق ما لا يخصك."
        href="/portal/sessions"
      />
      <SectionLink
        icon={Key}
        title="كلمة المرور والمصادقة"
        description="غيّر كلمة المرور وفعّل التحقق بخطوتين."
        href="/portal/settings"
      />
      <SectionLink
        icon={Shield}
        title="سجل الأمان"
        description="تتبع محاولات تسجيل الدخول والأحداث الحساسة."
        href="/portal/audit-log"
      />
    </div>
  );
}

function SectionLink({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
        <Button size="sm" variant="outline" asChild>
          <a href={href}>
            فتح
            <ArrowLeft className="ms-1 h-3 w-3" aria-hidden />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
