/**
 * Phase 5 — Premium patient dashboard.
 * Bento grid fed by a single `getPortalQuickSnapshot` server call that returns
 * next appointment, required actions, new reports, prescriptions, outstanding
 * invoices, insurance approvals, service requests, notifications,
 * announcements, and offers.
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
  Megaphone,
  Tag,
  CalendarPlus,
  ArrowLeft,
  MapPin,
} from "lucide-react";
import { getPortalQuickSnapshot } from "@/lib/portal/snapshot.functions";
import { ContentFeed } from "@/components/patient/ContentFeed";
import { EmptyState } from "@/components/states";
import { patientRouteStates } from "@/components/states/patient-route-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
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
  ...patientRouteStates({ skeleton: "cards", count: 6 }),
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
                  {next.time && (
                    <span className="text-muted-foreground">{next.time.slice(0, 5)}</span>
                  )}
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
              <p className="mt-1 text-sm opacity-90">
                اختر التخصص والطبيب والفرع خلال دقائق.
              </p>
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
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border bg-background p-3"
                >
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
              الإجمالي: {data.outstandingPayments.total.toFixed(2)}{" "}
              {data.outstandingPayments.currency}
            </li>
          )}
        </TileCard>

        <TileCard
          icon={Pill}
          title="الوصفات الطبية"
          count={data.prescriptions.count}
          href="/patient/prescriptions"
          emptyText="لا توجد وصفات نشطة"
        >
          {data.prescriptions.items.slice(0, 3).map((r) => (
            <li key={r.id} className="truncate text-xs text-muted-foreground">
              · {r.medication}
              {r.dosage ? ` — ${r.dosage}` : ""}
            </li>
          ))}
        </TileCard>

        <TileCard
          icon={ShieldCheck}
          title="التأمين والموافقات"
          count={data.insuranceApprovals.count}
          href="/patient/insurance"
          emptyText="لا توجد موافقات تأمينية"
        >
          {data.insuranceApprovals.count > 0 && (
            <li className="flex flex-wrap gap-1 text-xs">
              {data.insuranceApprovals.approved > 0 && (
                <Badge variant="secondary">معتمد {data.insuranceApprovals.approved}</Badge>
              )}
              {data.insuranceApprovals.pending > 0 && (
                <Badge variant="outline">قيد المراجعة {data.insuranceApprovals.pending}</Badge>
              )}
              {data.insuranceApprovals.needsInfo > 0 && (
                <Badge variant="destructive">
                  يحتاج معلومات {data.insuranceApprovals.needsInfo}
                </Badge>
              )}
            </li>
          )}
        </TileCard>

        <TileCard
          icon={MessageSquare}
          title="طلباتي واستفساراتي"
          count={data.serviceRequests.open}
          href="/patient/requests"
          emptyText="لا توجد طلبات مفتوحة"
        >
          {data.serviceRequests.items.slice(0, 3).map((r) => (
            <li key={r.id} className="truncate text-xs text-muted-foreground">
              · {r.request_number} — {r.service_label ?? r.internal_status}
            </li>
          ))}
        </TileCard>

        <TileCard
          icon={Bell}
          title="الإشعارات"
          count={data.notifications.unread}
          href="/patient/notifications"
          emptyText="لا توجد إشعارات جديدة"
        >
          {data.notifications.items.slice(0, 3).map((n) => (
            <li key={n.id} className="truncate text-xs text-muted-foreground">
              · {n.title ?? n.body ?? "إشعار"}
            </li>
          ))}
        </TileCard>
      </section>

      {/* Announcements */}
      {data.announcements.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-primary" aria-hidden />
              إعلانات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.announcements.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/${a.slug}`}
                    className="block rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="font-medium">{a.title_ar}</div>
                    {a.published_at && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.published_at), {
                          addSuffix: true,
                          locale: ar,
                        })}
                      </div>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Offers / Suggestions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {data.offers.length > 0 ? (
              <>
                <Tag className="h-4 w-4 text-primary" aria-hidden />
                عروض ومقالات صحية
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                خدمات مقترحة
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.offers.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.offers.map((o) => (
                <a
                  key={o.id}
                  href={`/health/${o.slug}`}
                  className="group overflow-hidden rounded-xl border transition-colors hover:border-primary/40"
                >
                  {o.cover_image_url && (
                    <div className="aspect-video overflow-hidden bg-muted">
                      <img
                        src={o.cover_image_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-medium">{o.title_ar}</div>
                    {o.excerpt_ar && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {o.excerpt_ar}
                      </p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          ) : (
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
          )}
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

function SuggestionCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
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
