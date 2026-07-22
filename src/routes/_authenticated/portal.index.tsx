import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getDashboardSummary } from "@/lib/portal/portal.functions";
import { cancelMyAppointment } from "@/lib/slots.functions";
import {
  ArrowUpRight,
  CalendarCheck,
  Clock,
  MapPin,
  Stethoscope,
  FileText,
  ReceiptText,
  ShieldCheck,
  Bell,
  Users,
  Pill,
  MessageSquareWarning,
  AlertTriangle,
  RefreshCw,
  XCircle,
  Loader2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  FlaskConical,
} from "lucide-react";

const dashboardQuery = queryOptions({
  queryKey: ["portal", "dashboard-summary"],
  queryFn: () => getDashboardSummary(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/")({
  loader: async ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  head: () => ({
    meta: [
      { title: "نظرة عامة | بوابة باعشن للخدمات الطبية" },
      {
        name: "description",
        content: "نظرة سريعة على موعدك القادم، تقاريرك، فواتيرك، وحالة موافقات التأمين.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalOverview,
  errorComponent: OverviewError,
  notFoundComponent: () => null,
});

/* ─────────────────────────── i18n dictionary ─────────────────────────── */

const T = {
  kicker: { ar: "افتتاحية اليوم", en: "Today's cover" },
  hello_am: { ar: "صباح الخير", en: "Good morning" },
  hello_pm: { ar: "مساء الخير", en: "Good afternoon" },
  hello_night: { ar: "مساء الخير", en: "Good evening" },
  welcome: { ar: "أهلًا بك في بوابة باعشن", en: "Welcome to your Baeshen portal" },
  next_visit: { ar: "زيارتك القادمة", en: "Your next visit" },
  no_next: { ar: "لا يوجد موعد قادم", en: "No upcoming visit" },
  book_now: { ar: "احجز موعدًا جديدًا", en: "Book a new appointment" },
  book_new_cta: { ar: "احجز الآن", en: "Book now" },
  view_all: { ar: "عرض الكل", en: "View all" },
  new: { ar: "جديد", en: "New" },
  confirmed: { ar: "مؤكد", en: "Confirmed" },
  cancelled: { ar: "ملغى", en: "Cancelled" },
  completed: { ar: "منتهٍ", en: "Done" },
  reschedule: { ar: "إعادة جدولة", en: "Reschedule" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  confirm_cancel: { ar: "هل تريد إلغاء هذا الموعد؟", en: "Cancel this appointment?" },
  cancelled_ok: { ar: "تم إلغاء الموعد.", en: "Appointment cancelled." },
  cancel_fail: { ar: "تعذّر الإلغاء.", en: "Cancel failed." },
  // KPIs
  kpi_appts: { ar: "مواعيد قادمة", en: "Upcoming visits" },
  kpi_reports: { ar: "تقارير جديدة", en: "New reports" },
  kpi_invoices: { ar: "مبالغ مستحقة", en: "Amount due" },
  kpi_insurance: { ar: "موافقات معلّقة", en: "Pending approvals" },
  // sections
  quick: { ar: "خدمات سريعة", en: "Quick services" },
  s_book: { ar: "حجز موعد", en: "Book" },
  s_reports: { ar: "التقارير", en: "Reports" },
  s_prescriptions: { ar: "الوصفات", en: "Prescriptions" },
  s_invoices: { ar: "الفواتير", en: "Invoices" },
  s_insurance: { ar: "التأمين", en: "Insurance" },
  s_family: { ar: "أفراد العائلة", en: "Family" },
  s_complaints: { ar: "الشكاوى", en: "Complaints" },
  s_records: { ar: "السجل الطبي", en: "Records" },
  sec_reports: { ar: "أحدث التقارير", en: "Recent reports" },
  sec_notifs: { ar: "إشعاراتك", en: "Your notifications" },
  sec_pay: { ar: "الفواتير المستحقة", en: "Outstanding invoices" },
  sec_ins: { ar: "موافقات التأمين", en: "Insurance approvals" },
  sec_family: { ar: "أفراد العائلة", en: "Family members" },
  sec_doctors: { ar: "أطباؤنا", en: "Our doctors" },
  pay_now: { ar: "ادفع الآن", en: "Pay now" },
  amount_due_label: { ar: "الإجمالي المستحق", en: "Total due" },
  sar: { ar: "ر.س", en: "SAR" },
  empty_reports_t: { ar: "لا توجد تقارير بعد", en: "No reports yet" },
  empty_reports_b: {
    ar: "ستظهر تقاريرك المخبرية والإشعاعية هنا فور نشرها.",
    en: "Lab and radiology reports will appear here as soon as they're published.",
  },
  empty_notifs_t: { ar: "لا إشعارات جديدة", en: "You're all caught up" },
  empty_notifs_b: { ar: "سنعلمك بأي جديد فور حدوثه.", en: "We'll let you know when something happens." },
  empty_invoices_t: { ar: "لا فواتير مستحقة", en: "No amounts due" },
  empty_invoices_b: { ar: "كل فواتيرك مدفوعة. شكرًا لك.", en: "All invoices are settled. Thank you." },
  empty_ins_t: { ar: "لا موافقات معلّقة", en: "No pending approvals" },
  empty_ins_b: { ar: "لا توجد طلبات تأمين قيد المراجعة.", en: "No insurance requests are under review." },
  empty_family_t: { ar: "لم تُضف أفراد عائلة", en: "No family members added" },
  empty_family_b: { ar: "أضف معالًا لتحجز نيابةً عنه.", en: "Add a dependent to book on their behalf." },
  add_dep: { ar: "إضافة معال", en: "Add dependent" },
  browse_all: { ar: "استكشف الكل", en: "Browse all" },
  demo: { ar: "بيانات تجريبية", en: "Demo data" },
  // status badges
  st_submitted: { ar: "مُقدّم", en: "Submitted" },
  st_review: { ar: "قيد المراجعة", en: "Under review" },
  st_info: { ar: "بحاجة معلومات", en: "Info required" },
  st_draft: { ar: "مسودة", en: "Draft" },
  st_unpaid: { ar: "غير مدفوعة", en: "Unpaid" },
  st_partial: { ar: "مدفوعة جزئيًا", en: "Partial" },
  st_pending: { ar: "قيد الانتظار", en: "Pending" },
  retry: { ar: "إعادة المحاولة", en: "Try again" },
  load_fail: { ar: "تعذّر تحميل اللوحة", en: "Failed to load overview" },
} as const;

type Lang = "ar" | "en";
const tt = (k: keyof typeof T, l: Lang) => T[k][l];

/* ───────────────────────────── Error boundary ───────────────────────────── */

function OverviewError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="portal-magazine max-w-md mx-auto p-8 text-center rounded-[20px] bg-white border border-[color:var(--mag-line)] shadow-sm mt-10">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold text-[color:var(--mag-ink)]">تعذّر تحميل اللوحة</h3>
      <p className="text-sm text-[color:var(--mag-ink-2)] mt-2 break-words">
        {error.message || "خطأ غير متوقع."}
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-white bg-[color:var(--mag-ink)] hover:bg-[color:var(--mag-ink-2)] transition"
      >
        <RefreshCw className="h-4 w-4" />
        إعادة المحاولة
      </button>
    </div>
  );
}

/* ───────────────────────────── Page component ───────────────────────────── */

function PortalOverview() {
  const { data } = useSuspenseQuery(dashboardQuery);
  const lang: Lang = (data.profile?.preferred_language as string | undefined) === "en" ? "en" : "ar";
  const isAr = lang === "ar";
  const dir =(isAr ? "rtl" : "ltr");

  const firstName =
    data.profile?.full_name?.trim().split(/\s+/)[0] ?? (isAr ? "بك" : "there");

  const hour = new Date().getHours();
  const greetKey: "hello_am" | "hello_pm" | "hello_night" =
    hour < 12 ? "hello_am" : hour < 18 ? "hello_pm" : "hello_night";

  const today = new Date().toLocaleDateString(isAr ? "ar-SA-u-nu-latn" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelMyAppointment);
  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { appointmentId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "dashboard-summary"] });
      toast.success(tt("cancelled_ok", lang));
    },
    onError: (err: Error) => toast.error(err.message || tt("cancel_fail", lang)),
  });

  const next = data.upcoming[0] ?? null;
  const rest = data.upcoming.slice(1);

  return (
    <div dir={dir} className="portal-magazine -m-4 md:-m-6 lg:-m-8 p-4 md:p-6 lg:p-8 min-h-full">
      <div className="max-w-[1400px] mx-auto space-y-6 md:space-y-8">
        {/* ─── Editorial masthead ─── */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 pb-4 border-b border-[color:var(--mag-line)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--mag-muted)]">
              <span className="inline-block h-px w-6 bg-[color:var(--mag-muted)]" />
              {tt("kicker", lang)}
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-extrabold text-[color:var(--mag-ink)] leading-tight">
              {tt(greetKey, lang)}
              <span className="text-[color:var(--mag-accent)]">،&nbsp;</span>
              <span>{firstName}</span>
            </h1>
            <p className="mt-1 text-sm text-[color:var(--mag-ink-3)]">{today}</p>
          </div>
          <Link
            to="/portal/book"
            className="hidden sm:inline-flex items-center gap-2 rounded-full h-11 px-5 bg-[color:var(--mag-ink)] text-white text-sm font-semibold hover:bg-[color:var(--mag-ink-2)] transition shrink-0"
          >
            <CalendarPlus className="h-4 w-4" />
            {tt("book_new_cta", lang)}
          </Link>
        </header>

        {/* ─── FEATURE: next visit cover story ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
          {next ? (
            <FeatureNextVisit
              lang={lang}
              appt={next}
              onCancel={() => {
                if (confirm(tt("confirm_cancel", lang))) cancelM.mutate(next.id);
              }}
              cancelling={cancelM.isPending && cancelM.variables === next.id}
            />
          ) : (
            <FeatureEmpty lang={lang} />
          )}

          {/* KPI stack — bento */}
          <div className="grid grid-cols-2 gap-3">
            <KpiTile
              lang={lang}
              icon={<CalendarCheck className="h-4 w-4" />}
              label={tt("kpi_appts", lang)}
              value={String(data.upcomingCount)}
              to="/portal/orders"
              tone="accent"
            />
            <KpiTile
              lang={lang}
              icon={<FileText className="h-4 w-4" />}
              label={tt("kpi_reports", lang)}
              value={String(data.recentLabs.length)}
              to="/portal/reports"
              tone="ink"
            />
            <KpiTile
              lang={lang}
              icon={<ReceiptText className="h-4 w-4" />}
              label={tt("kpi_invoices", lang)}
              value={
                data.outstandingTotal > 0
                  ? `${formatMoney(data.outstandingTotal, lang)} ${tt("sar", lang)}`
                  : "0"
              }
              to="/portal/invoices"
              tone={data.outstandingTotal > 0 ? "warning" : "muted"}
              small
            />
            <KpiTile
              lang={lang}
              icon={<ShieldCheck className="h-4 w-4" />}
              label={tt("kpi_insurance", lang)}
              value={String(data.pendingInsuranceCount)}
              to="/portal/insurance"
              tone={data.pendingInsuranceCount > 0 ? "warning" : "muted"}
            />
          </div>
        </section>

        {/* ─── Quick services strip ─── */}
        <section aria-labelledby="quick-heading">
          <div className="flex items-baseline justify-between mb-3">
            <h2 id="quick-heading" className="text-sm font-bold uppercase tracking-wider text-[color:var(--mag-ink-3)]">
              {tt("quick", lang)}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            <QuickPill lang={lang} to="/portal/book" icon={<CalendarPlus className="h-4 w-4" />} label={tt("s_book", lang)} />
            <QuickPill lang={lang} to="/portal/reports" icon={<FileText className="h-4 w-4" />} label={tt("s_reports", lang)} />
            <QuickPill lang={lang} to="/portal/laboratory" icon={<FlaskConical className="h-4 w-4" />} label={(isAr ? "المختبر" : "Lab")} />
            <QuickPill lang={lang} to="/portal/prescriptions" icon={<Pill className="h-4 w-4" />} label={tt("s_prescriptions", lang)} />
            <QuickPill lang={lang} to="/portal/invoices" icon={<ReceiptText className="h-4 w-4" />} label={tt("s_invoices", lang)} />
            <QuickPill lang={lang} to="/portal/insurance" icon={<ShieldCheck className="h-4 w-4" />} label={tt("s_insurance", lang)} />
            <QuickPill lang={lang} to="/portal/family" icon={<Users className="h-4 w-4" />} label={tt("s_family", lang)} />
            <QuickPill lang={lang} to="/portal/complaints" icon={<MessageSquareWarning className="h-4 w-4" />} label={tt("s_complaints", lang)} />
          </div>
        </section>

        {/* ─── Editorial two-column: Reports + Notifications ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
          {/* Reports feature */}
          <article className="mag-card p-5 md:p-6">
            <SectionHeader
              lang={lang}
              icon={<FileText className="h-4 w-4" />}
              title={tt("sec_reports", lang)}
              to="/portal/reports"
            />
            {data.recentLabs.length === 0 ? (
              <EmptyBlock lang={lang} title={tt("empty_reports_t", lang)} body={tt("empty_reports_b", lang)} />
            ) : (
              <ol className="mt-5 divide-y divide-[color:var(--mag-line)]">
                {data.recentLabs.slice(0, 5).map((l, i) => (
                  <li key={l.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                      <span className="text-[11px] font-semibold text-[color:var(--mag-muted)] w-6 shrink-0 tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[color:var(--mag-ink)] truncate">{l.title}</div>
                        <div className="text-xs text-[color:var(--mag-ink-3)] truncate mt-0.5">
                          {l.test_type ?? (isAr ? "تقرير عام" : "Report")} ·{" "}
                          {l.report_date
                            ? new Date(l.report_date).toLocaleDateString(isAr ? "ar-SA-u-nu-latn" : "en-US",
                                { day: "2-digit", month: "short", year: "numeric" },
                              )
                            : "—"}
                        </div>
                      </div>
                      <LabStatusChip status={l.status} lang={lang} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </article>

          {/* Notifications */}
          <article className="mag-card p-5 md:p-6">
            <SectionHeader
              lang={lang}
              icon={<Bell className="h-4 w-4" />}
              title={tt("sec_notifs", lang)}
              to="/portal/notifications"
              badge={data.unreadCount > 0 ? String(data.unreadCount) : undefined}
            />
            {data.notifications.length === 0 ? (
              <EmptyBlock lang={lang} title={tt("empty_notifs_t", lang)} body={tt("empty_notifs_b", lang)} />
            ) : (
              <ul className="mt-5 space-y-3.5">
                {data.notifications.slice(0, 5).map((n) => (
                  <li key={n.id} className="flex items-start gap-3">
                    <span
                      className={
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full " +
                        (n.read_at ? "bg-[color:var(--mag-line-strong)]" : "bg-[color:var(--mag-accent)]")
                      }
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[color:var(--mag-ink)] truncate">{n.title}</div>
                      {n.body && (
                        <div className="text-xs text-[color:var(--mag-ink-3)] line-clamp-2 mt-0.5">{n.body}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>

        {/* ─── Editorial two-column: Invoices + Insurance ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <article className="mag-card p-5 md:p-6">
            <SectionHeader
              lang={lang}
              icon={<ReceiptText className="h-4 w-4" />}
              title={tt("sec_pay", lang)}
              to="/portal/invoices"
            />
            {data.outstandingInvoices.length === 0 ? (
              <EmptyBlock lang={lang} title={tt("empty_invoices_t", lang)} body={tt("empty_invoices_b", lang)} />
            ) : (
              <>
                <div className="mt-5 flex items-baseline justify-between rounded-2xl bg-[color:var(--mag-subtle)] px-4 py-3">
                  <div className="text-xs text-[color:var(--mag-ink-3)]">{tt("amount_due_label", lang)}</div>
                  <div className="text-xl font-bold text-[color:var(--mag-ink)] tabular-nums">
                    {formatMoney(data.outstandingTotal, lang)}{" "}
                    <span className="text-xs font-semibold text-[color:var(--mag-ink-3)]">{tt("sar", lang)}</span>
                  </div>
                </div>
                <ul className="mt-4 divide-y divide-[color:var(--mag-line)]">
                  {data.outstandingInvoices.slice(0, 4).map((inv) => (
                    <li key={inv.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[color:var(--mag-ink)] truncate">
                            {inv.invoice_number || `#${inv.id.slice(0, 8)}`}
                          </div>
                          <div className="text-xs text-[color:var(--mag-ink-3)] mt-0.5">
                            {new Date(inv.issued_at).toLocaleDateString(isAr ? "ar-SA-u-nu-latn" : "en-US",
                              { day: "2-digit", month: "short", year: "numeric" },
                            )}{" "}
                            · <InvoiceStatusChip status={inv.status} lang={lang} inline />
                          </div>
                        </div>
                        <div className="text-sm font-bold text-[color:var(--mag-ink)] tabular-nums">
                          {formatMoney(Number(inv.total ?? 0), lang)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/portal/invoices"
                  className="mt-4 inline-flex items-center justify-center w-full gap-2 rounded-full h-11 px-5 bg-[color:var(--mag-accent)] text-white text-sm font-semibold hover:bg-[color:var(--mag-accent-ink)] transition"
                >
                  {tt("pay_now", lang)}
                  {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Link>
              </>
            )}
          </article>

          <article className="mag-card p-5 md:p-6">
            <SectionHeader
              lang={lang}
              icon={<ShieldCheck className="h-4 w-4" />}
              title={tt("sec_ins", lang)}
              to="/portal/insurance"
            />
            {data.pendingInsurance.length === 0 ? (
              <EmptyBlock lang={lang} title={tt("empty_ins_t", lang)} body={tt("empty_ins_b", lang)} />
            ) : (
              <ul className="mt-5 space-y-3">
                {data.pendingInsurance.slice(0, 4).map((r) => (
                  <li key={r.id} className="rounded-2xl border border-[color:var(--mag-line)] p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[color:var(--mag-ink)] truncate">
                          {r.service_description}
                        </div>
                        <div className="text-[11px] text-[color:var(--mag-ink-3)] mt-0.5">
                          {r.submitted_at
                            ? new Date(r.submitted_at).toLocaleDateString(isAr ? "ar-SA-u-nu-latn" : "en-US",
                                { day: "2-digit", month: "short", year: "numeric" },
                              )
                            : "—"}
                        </div>
                      </div>
                      <InsuranceStatusChip status={r.status} lang={lang} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>

        {/* ─── Additional upcoming appointments (if any beyond featured) ─── */}
        {rest.length > 0 && (
          <section className="mag-card p-5 md:p-6">
            <SectionHeader
              lang={lang}
              icon={<CalendarCheck className="h-4 w-4" />}
              title={(isAr ? "المواعيد التالية" : "Also coming up")}
              to="/portal/orders"
            />
            <ul className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {rest.map((a) => (
                <li key={a.id} className="rounded-2xl border border-[color:var(--mag-line)] p-3">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                    <MiniDateChip iso={a.appointment_date} lang={lang} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[color:var(--mag-ink)] truncate">
                        {a.doctor
                          ? isAr
                            ? a.doctor.name_ar
                            : a.doctor.name_en ?? a.doctor.name_ar
                          :(isAr ? "طبيب المجمع" : "Doctor")}
                      </div>
                      <div className="text-[11px] text-[color:var(--mag-ink-3)] truncate mt-0.5">
                        {a.appointment_time?.slice(0, 5)} ·{" "}
                        {a.reason ?? (isAr ? "استشارة عامة" : "Consultation")}
                      </div>
                    </div>
                    <ApptStatusChip status={a.status} lang={lang} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ─── Family strip ─── */}
        <section className="mag-card p-5 md:p-6">
          <SectionHeader
            lang={lang}
            icon={<Users className="h-4 w-4" />}
            title={tt("sec_family", lang)}
            to="/portal/family"
          />
          {data.family.length === 0 ? (
            <EmptyBlock
              lang={lang}
              title={tt("empty_family_t", lang)}
              body={tt("empty_family_b", lang)}
              ctaHref="/portal/family"
              ctaLabel={tt("add_dep", lang)}
            />
          ) : (
            <div className="mt-5 flex flex-wrap gap-3">
              {data.family.map((m) => (
                <Link
                  key={m.id}
                  to="/portal/family"
                  className="group flex items-center gap-3 rounded-full border border-[color:var(--mag-line)] hover:border-[color:var(--mag-line-strong)] hover:bg-[color:var(--mag-subtle)] px-3 py-2 transition"
                >
                  <span
                    aria-hidden
                    className="h-8 w-8 rounded-full grid place-items-center bg-[color:var(--mag-accent-soft)] text-[color:var(--mag-accent-ink)] text-xs font-bold"
                  >
                    {initials(m.full_name)}
                  </span>
                  <span className="text-sm min-w-0">
                    <span className="block font-semibold text-[color:var(--mag-ink)] truncate max-w-[140px]">
                      {m.full_name}
                    </span>
                    <span className="block text-[11px] text-[color:var(--mag-ink-3)] truncate">
                      {m.relationship}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ─── Doctors rail ─── */}
        {data.doctorsRail.length > 0 && (
          <section className="mag-card p-5 md:p-6">
            <SectionHeader
              lang={lang}
              icon={<Stethoscope className="h-4 w-4" />}
              title={tt("sec_doctors", lang)}
              to="/portal/doctors"
              actionLabel={tt("browse_all", lang)}
            />
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {data.doctorsRail.slice(0, 6).map((d) => (
                <Link
                  key={d.id}
                  to="/portal/doctors"
                  className="mag-card mag-card-hover p-3 text-center flex flex-col items-center"
                >
                  <span
                    className="w-14 h-14 rounded-full grid place-items-center bg-[color:var(--mag-accent-soft)] text-[color:var(--mag-accent-ink)] font-semibold text-sm"
                    aria-hidden
                  >
                    {initials(isAr ? d.name_ar : d.name_en ?? d.name_ar)}
                  </span>
                  <div className="mt-2 text-xs font-semibold text-[color:var(--mag-ink)] leading-tight truncate w-full">
                    {isAr ? d.name_ar : d.name_en ?? d.name_ar}
                  </div>
                  <div className="text-[10px] text-[color:var(--mag-ink-3)] truncate w-full mt-0.5">
                    {isAr ? d.title_ar ?? "استشاري" : d.title_en ?? "Consultant"}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── sub-components ─────────────────────────── */

function FeatureNextVisit({
  lang,
  appt,
  onCancel,
  cancelling,
}: {
  lang: Lang;
  appt: {
    id: string;
    appointment_date: string;
    appointment_time: string | null;
    status: string;
    reason: string | null;
    doctor: { name_ar: string; name_en: string | null } | null;
  };
  onCancel: () => void;
  cancelling: boolean;
}) {
  const isAr = lang === "ar";
  const dateObj = new Date(appt.appointment_date + "T00:00:00");
  const cancellable = appt.status === "new" || appt.status === "confirmed";

  return (
    <article className="relative overflow-hidden rounded-[24px] bg-[color:var(--mag-ink)] text-white p-6 md:p-8">
      {/* subtle bg pattern */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 10%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 90%, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px, 60px 60px",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/70">
          <Sparkles className="h-3.5 w-3.5" />
          {tt("next_visit", lang)}
        </div>

        <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-5">
          {/* Date block */}
          <div className="w-20 shrink-0 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 text-center py-3">
            <div className="text-[10px] uppercase tracking-wider text-white/70">
              {dateObj.toLocaleDateString(isAr ? "ar-SA-u-nu-latn" : "en-US", { month: "short" })}
            </div>
            <div className="text-3xl font-extrabold leading-none mt-1 tabular-nums">
              {dateObj.getDate()}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-white/70 mt-1">
              {dateObj.toLocaleDateString(isAr ? "ar-SA-u-nu-latn" : "en-US", { weekday: "short" })}
            </div>
          </div>

          {/* Body */}
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-bold leading-tight">
              {appt.doctor
                ? isAr
                  ? appt.doctor.name_ar
                  : appt.doctor.name_en ?? appt.doctor.name_ar
                :(isAr ? "طبيب مجمع باعشن" : "Baeshen doctor")}
            </h2>
            <p className="text-sm text-white/80 mt-1 line-clamp-2">
              {appt.reason ?? (isAr ? "استشارة طبية عامة" : "General consultation")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/85">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {appt.appointment_time?.slice(0, 5) ?? "—"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {(isAr ? "مجمع باعشن الطبي" : "Baeshen Medical")}
              </span>
              <ApptStatusChip status={appt.status} lang={lang} onDark />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="relative mt-6 flex flex-wrap items-center gap-2">
          <Link
            to="/portal/orders"
            className="inline-flex items-center gap-2 rounded-full bg-white text-[color:var(--mag-ink)] px-4 h-10 text-sm font-semibold hover:bg-white/95 transition"
          >
            {(isAr ? "التفاصيل" : "Details")}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            to="/portal/book"
            className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 px-4 h-10 text-sm font-semibold transition"
          >
            {tt("reschedule", lang)}
          </Link>
          {cancellable && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-2 rounded-full bg-transparent hover:bg-rose-500/20 border border-rose-300/40 text-rose-100 px-4 h-10 text-sm font-semibold transition disabled:opacity-50"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              {tt("cancel", lang)}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function FeatureEmpty({ lang }: { lang: Lang }) {
  const isAr = lang === "ar";
  return (
    <article className="relative overflow-hidden rounded-[24px] bg-[color:var(--mag-surface)] border border-[color:var(--mag-line)] p-6 md:p-8 flex flex-col justify-center">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--mag-muted)]">
        <Sparkles className="h-3.5 w-3.5" />
        {tt("next_visit", lang)}
      </div>
      <h2 className="mt-4 text-2xl font-bold text-[color:var(--mag-ink)]">
        {tt("no_next", lang)}
      </h2>
      <p className="mt-2 text-sm text-[color:var(--mag-ink-2)] max-w-md">
        {(isAr ? "ابدأ رحلتك مع أحد استشاريينا. الحجز يستغرق دقيقة واحدة فقط." : "Start with one of our consultants. Booking takes about a minute.")}
      </p>
      <div className="mt-5">
        <Link
          to="/portal/book"
          className="inline-flex items-center gap-2 rounded-full bg-[color:var(--mag-ink)] text-white px-5 h-11 text-sm font-semibold hover:bg-[color:var(--mag-ink-2)] transition"
        >
          <CalendarPlus className="h-4 w-4" />
          {tt("book_new_cta", lang)}
        </Link>
      </div>
    </article>
  );
}

function KpiTile({
  lang,
  icon,
  label,
  value,
  to,
  tone = "ink",
  small,
}: {
  lang: Lang;
  icon: React.ReactNode;
  label: string;
  value: string;
  to: string;
  tone?: "ink" | "accent" | "warning" | "muted";
  small?: boolean;
}) {
  const toneClass =
    tone === "accent"
      ? "text-[color:var(--mag-accent-ink)] bg-[color:var(--mag-accent-soft)]"
      : tone === "warning"
      ? "text-[color:var(--mag-warning)] bg-amber-50"
      : tone === "muted"
      ? "text-[color:var(--mag-ink-3)] bg-[color:var(--mag-subtle)]"
      : "text-[color:var(--mag-ink)] bg-[color:var(--mag-subtle)]";
  return (
    <Link
      to={to}
      className="mag-card mag-card-hover p-4 flex flex-col justify-between min-h-[110px] group"
      aria-label={label}
    >
      <div className="flex items-center justify-between">
        <span className={`h-8 w-8 grid place-items-center rounded-lg ${toneClass}`}>{icon}</span>
        <ArrowUpRight className="h-3.5 w-3.5 text-[color:var(--mag-muted)] opacity-0 group-hover:opacity-100 transition" />
      </div>
      <div>
        <div
          className={
            (small ? "text-lg" : "text-2xl") +
            " font-extrabold text-[color:var(--mag-ink)] tabular-nums leading-tight"
          }
        >
          {value}
        </div>
        <div className="text-[11px] text-[color:var(--mag-ink-3)] mt-1 leading-tight">{label}</div>
      </div>
    </Link>
  );
}

function QuickPill({
  lang: _lang,
  to,
  icon,
  label,
}: {
  lang: Lang;
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="mag-card mag-card-hover flex items-center gap-2 px-3.5 h-11 text-xs font-semibold text-[color:var(--mag-ink-2)] hover:text-[color:var(--mag-ink)]"
    >
      <span className="text-[color:var(--mag-accent-ink)]">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SectionHeader({
  lang,
  icon,
  title,
  to,
  badge,
  actionLabel,
}: {
  lang: Lang;
  icon: React.ReactNode;
  title: string;
  to?: string;
  badge?: string;
  actionLabel?: string;
}) {
  const isAr = lang === "ar";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-7 w-7 shrink-0 grid place-items-center rounded-lg bg-[color:var(--mag-subtle)] text-[color:var(--mag-ink-2)]">
          {icon}
        </span>
        <h3 className="truncate text-sm md:text-base font-bold text-[color:var(--mag-ink)]">{title}</h3>
        {badge && (
          <span className="mag-chip bg-[color:var(--mag-accent)] text-white">{badge}</span>
        )}
      </div>
      {to && (
        <Link
          to={to}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--mag-ink-2)] hover:text-[color:var(--mag-accent-ink)] transition shrink-0"
        >
          {actionLabel ?? tt("view_all", lang)}
          {isAr ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Link>
      )}
    </div>
  );
}

function EmptyBlock({
  lang: _lang,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  lang: Lang;
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-[color:var(--mag-line-strong)] p-6 text-center">
      <div className="text-sm font-semibold text-[color:var(--mag-ink)]">{title}</div>
      <p className="text-xs text-[color:var(--mag-ink-3)] mt-1.5 leading-relaxed">{body}</p>
      {ctaHref && ctaLabel && (
        <a
          href={ctaHref}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-xs font-semibold text-white bg-[color:var(--mag-ink)] hover:bg-[color:var(--mag-ink-2)] transition"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}

function MiniDateChip({ iso, lang }: { iso: string; lang: Lang }) {
  const isAr = lang === "ar";
  const d = new Date(iso + "T00:00:00");
  return (
    <div className="w-12 shrink-0 rounded-xl bg-[color:var(--mag-subtle)] text-center py-1.5 border border-[color:var(--mag-line)]">
      <div className="text-[9px] uppercase tracking-wider text-[color:var(--mag-ink-3)]">
        {d.toLocaleDateString(isAr ? "ar-SA-u-nu-latn" : "en-US", { month: "short" })}
      </div>
      <div className="text-base font-bold text-[color:var(--mag-ink)] leading-none tabular-nums">
        {d.getDate()}
      </div>
    </div>
  );
}

function ApptStatusChip({ status, lang, onDark }: { status: string; lang: Lang; onDark?: boolean }) {
  const map: Record<string, { l_ar: string; l_en: string; ring: string }> = {
    new: { l_ar: "جديد", l_en: "New", ring: "bg-amber-500/20 text-amber-100 border-amber-300/30" },
    confirmed: {
      l_ar: "مؤكد",
      l_en: "Confirmed",
      ring: "bg-emerald-500/20 text-emerald-100 border-emerald-300/30",
    },
    cancelled: { l_ar: "ملغى", l_en: "Cancelled", ring: "bg-rose-500/20 text-rose-100 border-rose-300/30" },
    completed: { l_ar: "منتهٍ", l_en: "Done", ring: "bg-slate-500/20 text-slate-100 border-slate-300/30" },
  };
  const c = map[status] ?? { l_ar: status, l_en: status, ring: "bg-slate-500/20 text-slate-100 border-slate-300/30" };
  const lightMap: Record<string, string> = {
    new: "bg-amber-50 text-amber-700 border-amber-200",
    confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
    completed: "bg-slate-50 text-slate-700 border-slate-200",
  };
  const cls = onDark ? c.ring : lightMap[status] ?? "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span className={`mag-chip border ${cls}`}>{lang === "ar" ? c.l_ar : c.l_en}</span>
  );
}

function LabStatusChip({ status, lang }: { status: string | null; lang: Lang }) {
  const s = (status ?? "normal").toLowerCase();
  const map: Record<string, { l_ar: string; l_en: string; cls: string }> = {
    normal: { l_ar: "طبيعي", l_en: "Normal", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    low: { l_ar: "منخفض", l_en: "Low", cls: "bg-teal-50 text-teal-700 border-teal-200" },
    high: { l_ar: "مرتفع", l_en: "High", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    critical: { l_ar: "حرج", l_en: "Critical", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  };
  const c = map[s] ?? map.normal;
  return <span className={`mag-chip border ${c.cls}`}>{lang === "ar" ? c.l_ar : c.l_en}</span>;
}

function InvoiceStatusChip({
  status,
  lang,
  inline,
}: {
  status: string;
  lang: Lang;
  inline?: boolean;
}) {
  const map: Record<string, { l_ar: string; l_en: string; cls: string }> = {
    unpaid: { l_ar: "غير مدفوعة", l_en: "Unpaid", cls: "text-rose-600" },
    partially_paid: { l_ar: "جزئي", l_en: "Partial", cls: "text-amber-600" },
    pending: { l_ar: "قيد الانتظار", l_en: "Pending", cls: "text-slate-600" },
  };
  const c = map[status] ?? map.pending;
  if (inline) return <span className={`font-semibold ${c.cls}`}>{lang === "ar" ? c.l_ar : c.l_en}</span>;
  return (
    <span className={`mag-chip border border-current/20 ${c.cls}`}>
      {lang === "ar" ? c.l_ar : c.l_en}
    </span>
  );
}

function InsuranceStatusChip({ status, lang }: { status: string; lang: Lang }) {
  const map: Record<string, { l_ar: string; l_en: string; cls: string }> = {
    submitted: { l_ar: "مُقدّم", l_en: "Submitted", cls: "bg-teal-50 text-teal-700 border-teal-200" },
    under_review: {
      l_ar: "قيد المراجعة",
      l_en: "Under review",
      cls: "bg-teal-50 text-teal-700 border-teal-200",
    },
    additional_info_required: {
      l_ar: "بحاجة معلومات",
      l_en: "Info required",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    },
    draft: { l_ar: "مسودة", l_en: "Draft", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  };
  const c = map[status] ?? map.draft;
  return <span className={`mag-chip border ${c.cls}`}>{lang === "ar" ? c.l_ar : c.l_en}</span>;
}

/* ─────────────────────────── helpers ─────────────────────────── */

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

function formatMoney(n: number, lang: Lang): string {
  const isAr = lang === "ar";
  return n.toLocaleString(isAr ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
