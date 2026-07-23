/**
 * Phase 5 — /patient/profile.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/portal/portal.functions";
import { ErrorState, SkeletonList } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Phone, Mail, IdCard, ArrowLeft } from "lucide-react";

const profileQuery = queryOptions({
  queryKey: ["patient", "profile"],
  queryFn: () => getMyProfile(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/patient/profile")({
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  head: () => ({
    meta: [
      { title: "الملف الشخصي | بوابة المريض" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProfilePage,
  pendingComponent: () => <SkeletonList rows={3} />,
  errorComponent: ({ error, reset }) => <ErrorState description={error.message} onRetry={reset} />,
});

function ProfilePage() {
  const { data: p } = useSuspenseQuery(profileQuery);
  if (!p) return null;
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">الملف الشخصي</h1>
        <Button asChild size="sm" variant="outline">
          <a href="/portal/profile">
            تعديل
            <ArrowLeft className="ms-1 h-3 w-3" aria-hidden />
          </a>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" aria-hidden />
            المعلومات الأساسية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="الاسم" value={p.full_name ?? "—"} icon={User} />
          <Row label="الجوال" value={p.phone ?? "—"} icon={Phone} />
          <Row label="البريد" value={(p as { email?: string | null }).email ?? "—"} icon={Mail} />
          <Row label="الهوية / الإقامة" value={p.national_id ?? "—"} icon={IdCard} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
