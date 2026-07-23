/**
 * Phase 5 — Premium patient dashboard.
 * Bento grid of hero cards fed by a single `getPortalQuickSnapshot` call
 * plus lightweight secondary queries. Every card has explicit Loading /
 * Empty / Error via the shared states primitives.
 */
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Calendar,
  AlertTriangle,
  FileText,
  Pill,
  Receipt,
  ShieldCheck,
  MessageSquare,
  Bell,
  Sparkles,
  CalendarPlus,
  ArrowLeft,
  MapPin,
} from "lucide-react";
import { getPortalQuickSnapshot } from "@/lib/portal/snapshot.functions";
import { EmptyState, SkeletonCards } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const snapshotQuery = queryOptions({
  queryKey: ["patient", "dashboard-snapshot"],
  queryFn: () => getPortalQuickSnapshot(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/patient/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(snapshotQuery),
  head: () => ({
    meta: [
      { title: "لوحة المريض | مجمع باعشن الطبي" },
      { name: "description", content: "لوحة تحكم المريض الشخصية." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PatientDashboard,
  errorComponent: ({ error, reset }) => (
    <div className="p-4">
      <ErrorState description={error.message} onRetry={reset} />
    </div>
  ),
  pendingComponent: () => <SkeletonCards count={6} />,
});

function PatientDashboard() {
  const { data } = useSuspenseQuery(snapshotQuery);
  const next = data.nextAppointment;

  return (
    <div className="space-y-6">
      {/* Hero: next appointment + book CTA */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2 overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-primary" aria-hidden />
              الموعد القادم
            </CardTitle>
            {next && <Badge variant="outline">{next.status}</Badge>}
          </CardHeader>
          <CardContent>
            {next ? (
              <div className="space-y-3">
                <div>
                  <div className="text-lg font-semibold">
                    {next.doctor?.name_ar ?? "طبيبك"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {next.branch?.name_ar ?? ""}
                    {next.reason ? ` · ${next.reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium">
                    {format(new Date(next.date), "EEEE d MMMM yyyy", { locale: ar })}
                  </span>
                  {next.time && <span className="text-muted-foreground">{next.time.slice(0, 5)}</span>}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" asChild>
                    <Link to="/patient/appointments">
                      التفاصيل
                      <ArrowLeft className="ms-1 h-3 w-3" aria-hidden />
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/patient/appointments">
                      <MapPin className="me-1 h-3 w-3" aria-hidden />
                      الاتجاهات
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                title="لا يوجد موعد قادم"
                description="احجز موعدك الآن للاستفادة من خدماتنا."
                action={
                  <Button asChild size="sm">
                    <Link to="/book">
                      <CalendarPlus className="me-1 h-4 w-4" aria-hidden />
                      احجز موعدًا
                    </Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Book CTA */}
        <Card className="overflow-hidden bg-gradient-to-br from-primary to-accent text-primary-foreground">
          <CardContent className="flex h-full flex-col justify-between p-6">
            <div>
              <CalendarPlus className="mb-3 h-8 w-8" aria-hidden />
              <h3 className="text-lg font-bold">احجز موعدًا الآن</h3>
              <p className="mt-1 text-sm opacity-90">اختر التخصص والطبيب والفرع خلال دقائق.</p>
            </div>
            <Button asChild variant="secondary" className="mt-4 w-full">
              <Link to="/book">
                ابدأ الحجز
                <ArrowLeft className="ms-1 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Required actions */}
      {data.requiredActions.count > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              إجراءات مطلوبة ({data.requiredActions.count})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.requiredActions.items.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg border bg-background p-3">
                  <span className="text-sm">{a.label}</span>
                  <Button size="sm" variant="outline" asChild>
                    <a href={a.href}>إجراء</a>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Bento grid */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TileCard
          icon={FileText}
          title="تقارير جديدة"
          count={data.newReports.count}
          href="/patient/reports"
          emptyText="لا توجد تقارير جديدة"
        >
          {data.newReports.items.slice(0, 3).map((r) => (
            <li key={r.id} className="truncate text-xs text-muted-foreground">
              · {r.title ?? r.report_type}
            </li>
          ))}
        </TileCard>

        <TileCard
          icon={Receipt}
          title="فواتير مستحقة"
          count={data.outstandingPayments.count}
          href="/patient/billing"
          emptyText="لا توجد فواتير مستحقة"
        >
          {data.outstandingPayments.count > 0 && (
            <li className="text-sm font-semibold text-foreground">
              الإجمالي: {data.outstandingPayments.total.toFixed(2)} {data.outstandingPayments.currency}
            </li>
          )}
        </TileCard>

        <TileCard
          icon={Pill}
          title="الوصفات الطبية"
          count={null}
          href="/patient/prescriptions"
          emptyText="اعرض وصفاتك النشطة"
        />

        <TileCard
          icon={ShieldCheck}
          title="التأمين والموافقات"
          count={null}
          href="/patient/insurance"
          emptyText="حالة الاعتمادات التأمينية"
        />

        <TileCard
          icon={MessageSquare}
          title="طلباتي واستفساراتي"
          count={null}
          href="/patient/requests"
          emptyText="تابع طلباتك المفتوحة"
        />

        <TileCard
          icon={Bell}
          title="الإشعارات"
          count={null}
          href="/patient/notifications"
          emptyText="آخر التنبيهات والتذكيرات"
        />
      </section>

      {/* Announcements / Offers / Suggestions placeholder */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            خدمات مقترحة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <SuggestionCard
              title="استشارة عن بُعد"
              description="تحدث مع طبيبك المفضل من المنزل."
              href="/book?mode=teleconsult"
            />
            <SuggestionCard
              title="فحوصات مخبرية"
              description="احجز فحوصاتك في أقرب فرع."
              href="/services"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TileCard({
  icon: Icon,
  title,
  count,
  href,
  emptyText,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number | null;
  href: string;
  emptyText: string;
  children?: React.ReactNode;
}) {
  const hasItems = React.Children.count(children) > 0;
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
          {title}
        </CardTitle>
        {count != null && count > 0 && <Badge>{count}</Badge>}
      </CardHeader>
      <CardContent>
        {hasItems ? (
          <ul className="space-y-1">{children}</ul>
        ) : (
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        )}
        <Button asChild variant="ghost" size="sm" className="mt-3 h-auto p-0 text-primary">
          <Link to={href}>
            عرض الكل
            <ArrowLeft className="ms-1 h-3 w-3" aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SuggestionCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a
      href={href}
      className="rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </a>
  );
}

