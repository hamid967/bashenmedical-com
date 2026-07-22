import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getMyPrescriptions,
  generateMedicationReminders,
  getMedicationReminderLog,
  getAdherenceStats,
  confirmMedicationReminder,
  getReminderPreferences,
  saveReminderPreferences,
  DEFAULT_REMINDER_PREFS,
  type PrescriptionItem,
  type ReminderPlan,
  type ReminderLogEntry,
  type UpcomingAppointment,
  type AdherenceStats,
  type ReminderPreferences,
} from "@/lib/portal/prescriptions.functions";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  BellRing,
  Calendar,
  CalendarClock,
  Check,
  Award,
  CalendarPlus,
  CheckCheck,
  Clock,
  History,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Pill,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  Smartphone,
  Sparkles,
  Stethoscope,
  Sunrise,
  Moon,
  XCircle,
} from "lucide-react";
import { format, parseISO, differenceInDays, formatDistanceToNow } from "date-fns";
import { ar as arLocale } from "date-fns/locale";

const rxQuery = queryOptions({
  queryKey: ["portal", "prescriptions"],
  queryFn: () => getMyPrescriptions(),
  staleTime: 30_000,
});

const prefsQuery = queryOptions({
  queryKey: ["portal", "reminder-prefs"],
  queryFn: () => getReminderPreferences(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/portal/prescriptions")({
  loader: async ({ context }) => context.queryClient.ensureQueryData(rxQuery),
  head: () => ({
    meta: [
      { title: "الوصفات الطبية | بوابة المريض" },
      {
        name: "description",
        content: "الوصفات الطبية النشطة مع مساعد ذكي لتذكيرات الأدوية والمواعيد.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrescriptionsPage,
  errorComponent: RxError,
  notFoundComponent: () => null,
});

function RxError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">تعذّر تحميل الوصفات</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">
        {error.message || "خطأ غير متوقع."}
      </p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-[color:var(--portal-on-primary)]"
        style={{ background: "var(--portal-gradient)" }}
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  );
}

/* --------------------------- helpers --------------------------- */

function statusStyle(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "active") return "bg-emerald-100 text-emerald-700";
  if (s === "completed") return "bg-slate-100 text-slate-700";
  if (s === "stopped" || s === "cancelled") return "bg-rose-100 text-rose-700";
  if (s === "on_hold" || s === "paused") return "bg-amber-100 text-amber-700";
  return "bg-teal-100 text-teal-700";
}

function daysLeft(end: string | null): number | null {
  if (!end) return null;
  const d = differenceInDays(parseISO(end), new Date());
  return d;
}

/* --------------------------- page --------------------------- */

function PrescriptionsPage() {
  const { data } = useSuspenseQuery(rxQuery);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"active" | "past">("active");

  const list = tab === "active" ? data.active : data.past;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (r) =>
        r.medication.toLowerCase().includes(needle) ||
        (r.dosage ?? "").toLowerCase().includes(needle) ||
        (r.instructions ?? "").toLowerCase().includes(needle),
    );
  }, [list, q]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[color:var(--portal-ink-2)] tracking-wider">
              PRESCRIPTIONS
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">الوصفات الطبية</h1>
            <p className="text-sm text-[color:var(--portal-ink-2)] mt-1">
              أدويتك النشطة مع مساعد ذكي يقترح تذكيرات مواعيد الجرعات ومواعيدك القادمة.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <KpiPill label="نشطة" value={data.active.length} tone="ok" />
            <KpiPill label="مواعيد قادمة" value={data.upcoming.length} tone="accent" />
            <KpiPill label="سابقة" value={data.past.length} tone="neutral" />
          </div>
        </div>

        <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--portal-ink-2)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم الدواء أو الجرعة…"
              className="w-full h-11 rounded-2xl bg-white/70 pr-10 pl-4 text-sm border border-white/60 outline-none focus:ring-2 focus:ring-[color:var(--portal-accent)]"
            />
          </div>
          <div className="inline-flex rounded-full bg-white/70 p-1 ring-1 ring-white/60">
            <TabBtn active={tab === "active"} onClick={() => setTab("active")}>
              النشطة ({data.active.length})
            </TabBtn>
            <TabBtn active={tab === "past"} onClick={() => setTab("past")}>
              السابقة ({data.past.length})
            </TabBtn>
          </div>
        </div>
      </div>

      {/* AI reminder assistant */}
      <AiReminderCard upcoming={data.upcoming} activeCount={data.active.length} />

      {/* Reminder preferences */}
      <PreferencesCard />

      {/* Upcoming appointments strip */}
      {data.upcoming.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-[color:var(--portal-accent)]" />
              <h3 className="font-bold">مواعيدك القادمة</h3>
            </div>
            <Link
              to="/portal/book"
              className="text-xs font-semibold text-[color:var(--portal-accent)] hover:underline"
            >
              حجز جديد
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.upcoming.slice(0, 6).map((a) => (
              <div
                key={a.id}
                className="rounded-2xl bg-gradient-to-br from-teal-50 to-teal-50 ring-1 ring-teal-100 p-4"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-[color:var(--portal-ink-2)] inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(parseISO(a.date), "PPP", { locale: arLocale })}
                    {a.time ? ` • ${a.time.slice(0, 5)}` : ""}
                  </div>
                  <Badge className="bg-white/80 text-[color:var(--portal-ink)] border-0">
                    {a.status}
                  </Badge>
                </div>
                <div className="font-semibold">
                  {a.doctor_name ? `د. ${a.doctor_name}` : "طبيب"}
                </div>
                {a.specialty && (
                  <div className="text-xs text-[color:var(--portal-ink-2)] mt-0.5">
                    {a.specialty}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly adherence */}
      <AdherenceCard />

      {/* Reminder log */}
      <ReminderLogSection />

      {/* Prescription list */}
      {filtered.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Pill className="h-10 w-10 mx-auto text-[color:var(--portal-ink-2)] mb-3" />
          <p className="text-sm text-[color:var(--portal-ink-2)]">
            {tab === "active" ? "لا توجد وصفات نشطة حالياً." : "لا توجد وصفات سابقة."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((r) => (
            <RxCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- subcomponents --------------------------- */

function KpiPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "neutral" | "accent";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "warn"
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : tone === "accent"
          ? "bg-teal-50 text-teal-700 ring-teal-200"
          : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <div className={`rounded-2xl px-4 py-2 ring-1 ${cls}`}>
      <div className="text-xs">{label}</div>
      <div className="text-lg font-bold leading-none mt-0.5">{value}</div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-9 rounded-full px-4 text-sm font-semibold transition-all ${
        active ? "bg-[color:var(--portal-ink)] text-white" : "text-[color:var(--portal-ink)]"
      }`}
    >
      {children}
    </button>
  );
}

function RxCard({ r }: { r: PrescriptionItem }) {
  const dl = daysLeft(r.end_date);
  return (
    <article className="rounded-3xl bg-white/80 ring-1 ring-white/60 p-5 shadow-sm hover:shadow-md transition-all backdrop-blur">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-teal-100 to-teal-100 grid place-items-center text-teal-600">
            <Pill className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold leading-tight">{r.medication}</h3>
            <p className="text-xs text-[color:var(--portal-ink-2)] mt-0.5">
              {[r.dosage, r.frequency, r.route].filter(Boolean).join(" • ") || "بدون تفاصيل جرعة"}
            </p>
          </div>
        </div>
        <Badge className={`${statusStyle(r.status)} border-0`}>{r.status ?? "—"}</Badge>
      </header>

      {r.instructions && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm mb-3">
          <span className="text-xs text-slate-500 block mb-0.5">التعليمات</span>
          {r.instructions}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2 text-xs">
        {r.start_date && (
          <Field
            label="البداية"
            value={format(parseISO(r.start_date), "PPP", { locale: arLocale })}
          />
        )}
        {r.end_date && (
          <Field
            label="النهاية"
            value={`${format(parseISO(r.end_date), "PPP", { locale: arLocale })}${
              dl !== null ? ` (${dl >= 0 ? `${dl} يوم متبقي` : "منتهية"})` : ""
            }`}
          />
        )}
        {r.refills_remaining !== null && (
          <Field label="إعادة الصرف" value={`${r.refills_remaining} مرة`} />
        )}
        {r.doctor_name && <Field label="الطبيب" value={`د. ${r.doctor_name}`} />}
      </dl>

      {r.notes && (
        <p className="mt-3 text-xs text-[color:var(--portal-ink-2)] line-clamp-3">{r.notes}</p>
      )}

      <footer className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[color:var(--portal-ink-2)]">
          {r.source === "prescription" ? "وصفة طبيب" : "دواء مسجل"}
        </span>
        {r.doctor_name && (
          <span className="text-xs text-[color:var(--portal-ink-2)] inline-flex items-center gap-1">
            <Stethoscope className="h-3.5 w-3.5" /> {r.doctor_name}
          </span>
        )}
      </footer>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50/70 px-2.5 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

/* --------------------------- AI assistant --------------------------- */

function AiReminderCard({
  upcoming,
  activeCount,
}: {
  upcoming: UpcomingAppointment[];
  activeCount: number;
}) {
  const qc = useQueryClient();
  const { data: prefs = DEFAULT_REMINDER_PREFS } = useQuery(prefsQuery);
  const [previewOpen, setPreviewOpen] = useState(false);
  const mut = useMutation({
    mutationFn: () =>
      generateMedicationReminders({
        data: { preferredWakeHour: prefs.wake_hour, preferredSleepHour: prefs.sleep_hour },
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذّر توليد الخطة"),
    onSuccess: () => {
      toast.success("تم توليد جدول التذكيرات.");
      qc.invalidateQueries({ queryKey: ["portal", "reminder-log"] });
    },
  });
  const plan = mut.data as ReminderPlan | undefined;

  const grouped = useMemo(() => {
    if (!plan) return [];
    const map = new Map<string, typeof plan.slots>();
    for (const s of plan.slots) {
      const key = s.time.slice(0, 5);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [plan]);

  return (
    <div
      className="rounded-3xl p-5 md:p-6 text-[color:var(--portal-on-primary)] shadow-lg relative overflow-hidden"
      style={{ background: "var(--portal-gradient)" }}
    >
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle at 80% 20%, white, transparent 40%)" }}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-white/20 grid place-items-center backdrop-blur">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs opacity-80 tracking-wider">AI ASSISTANT</div>
            <h3 className="text-lg md:text-xl font-bold mt-0.5">
              {plan?.headline ?? "مساعد التذكيرات الذكي"}
            </h3>
            <p className="text-sm opacity-90 mt-1 max-w-2xl">
              {plan?.overview ??
                `اقترح جدولاً يوميًا لتذكيرات أدويتك (${activeCount} دواء نشط) مع تنبيهات لمواعيدك القادمة (${upcoming.length}).`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button
            onClick={() => plan && setPreviewOpen(true)}
            disabled={!plan}
            title="معاينة الأحداث قبل التصدير إلى .ics"
            className="inline-flex items-center gap-2 rounded-full h-10 px-4 text-sm font-semibold bg-white/20 hover:bg-white/30 backdrop-blur disabled:opacity-40"
          >
            <CalendarPlus className="h-4 w-4" /> معاينة وتصدير
          </button>

          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || activeCount === 0}
            className="inline-flex items-center gap-2 rounded-full h-10 px-4 text-sm font-semibold bg-white/20 hover:bg-white/30 backdrop-blur disabled:opacity-60"
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {plan ? "تحديث الخطة" : "توليد الخطة"}
          </button>
        </div>
      </div>

      {activeCount === 0 && !plan && (
        <p className="relative mt-4 text-sm bg-white/10 backdrop-blur rounded-xl px-3 py-2">
          لا توجد أدوية نشطة حالياً لتوليد جدول تذكيرات.
        </p>
      )}

      {plan && (
        <div className="relative mt-5 grid lg:grid-cols-3 gap-4">
          {/* Slots timeline */}
          <div className="lg:col-span-2 rounded-2xl bg-white/10 backdrop-blur p-4">
            <div className="text-xs font-semibold opacity-80 mb-3">جدول اليوم</div>
            {grouped.length === 0 ? (
              <p className="text-sm opacity-80">لم يتم توليد أي فترات.</p>
            ) : (
              <ul className="space-y-3">
                {grouped.map(([time, slots]) => (
                  <li key={time} className="flex gap-3">
                    <div className="shrink-0 w-16 rounded-xl bg-white/15 grid place-items-center py-2">
                      <div className="text-lg font-bold tabular-nums leading-none">{time}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">{slots[0].label}</div>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {slots.map((s, i) => (
                        <div key={i} className="rounded-xl bg-white/10 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{s.medication}</span>
                            {s.dosage && <span className="text-xs opacity-80">{s.dosage}</span>}
                          </div>
                          {s.note && <div className="text-xs opacity-80 mt-0.5">{s.note}</div>}
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Appointment reminders + warnings */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white/10 backdrop-blur p-4">
              <div className="text-xs font-semibold opacity-80 mb-2 inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" /> تذكيرات المواعيد
              </div>
              {plan.appointmentReminders.length === 0 ? (
                <p className="text-xs opacity-80">لا توجد تذكيرات مواعيد قادمة.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {plan.appointmentReminders.map((a, i) => (
                    <li key={i}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            a.priority === "high"
                              ? "bg-rose-300"
                              : a.priority === "medium"
                                ? "bg-amber-300"
                                : "bg-emerald-300"
                          }`}
                        />
                        <span className="font-semibold">{a.when}</span>
                      </div>
                      <p className="opacity-90 text-xs mt-0.5 mr-3.5">{a.action}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {plan.warnings.length > 0 && (
              <div className="rounded-2xl bg-rose-500/20 backdrop-blur p-4 ring-1 ring-rose-200/30">
                <div className="text-xs font-semibold mb-2 inline-flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> تنبيهات
                </div>
                <ul className="space-y-1 text-xs">
                  {plan.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-[10px] opacity-70 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              تم التوليد {format(parseISO(plan.generatedAt), "PPPp", { locale: arLocale })}
            </div>
          </div>
        </div>
      )}

      {plan && previewOpen && (
        <ExportPreviewModal
          plan={plan}
          upcoming={upcoming}
          prefs={prefs}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

/* --------------------------- Reminder log --------------------------- */

const reminderLogQuery = queryOptions({
  queryKey: ["portal", "reminder-log"],
  queryFn: () => getMedicationReminderLog(),
  staleTime: 15_000,
});

function ReminderLogSection() {
  const { data: log = [], isLoading, refetch, isFetching } = useQuery(reminderLogQuery);

  const stats = useMemo(() => {
    const s = { sent: 0, pending: 0, failed: 0, read: 0 };
    for (const r of log) {
      if (r.send_status === "sent") s.sent++;
      else if (r.send_status === "failed") s.failed++;
      else s.pending++;
      if (r.read_at) s.read++;
    }
    return s;
  }, [log]);

  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-amber-100 to-rose-100 grid place-items-center text-rose-500">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold">سجل التذكيرات المرسلة</h3>
            <p className="text-xs text-[color:var(--portal-ink-2)]">
              كل تذكير دواء تم إنشاؤه بواسطة المساعد الذكي مع حالة الإرسال والتنبيه.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LogKpi label="مرسل" value={stats.sent} tone="ok" />
          <LogKpi label="قيد الإرسال" value={stats.pending} tone="warn" />
          <LogKpi label="فشل" value={stats.failed} tone="danger" />
          <LogKpi label="مقروء" value={stats.read} tone="neutral" />
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 rounded-full px-3 text-xs font-semibold bg-white/70 ring-1 ring-white/60 inline-flex items-center gap-1.5 hover:bg-[color:var(--portal-surface)] disabled:opacity-60"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            تحديث
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-[color:var(--portal-ink-2)] inline-flex items-center gap-2 justify-center w-full">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
        </div>
      ) : log.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 p-8 text-center">
          <BellRing className="h-10 w-10 mx-auto text-[color:var(--portal-ink-2)] mb-2" />
          <p className="text-sm text-[color:var(--portal-ink-2)]">
            لم يتم توليد أي تذكيرات دواء بعد. استخدم المساعد الذكي بالأعلى لتوليد خطة.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white/60 ring-1 ring-white/60 overflow-hidden">
          {log.map((r) => (
            <ReminderLogRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReminderLogRow({ r }: { r: ReminderLogEntry }) {
  const qc = useQueryClient();
  const confirm = useMutation({
    mutationFn: (taken: boolean) => confirmMedicationReminder({ data: { id: r.id, taken } }),
    onSuccess: (_d, taken) => {
      toast.success(taken ? "تم تسجيل تناول الجرعة." : "تم إلغاء التأكيد.");
      qc.invalidateQueries({ queryKey: ["portal", "reminder-log"] });
      qc.invalidateQueries({ queryKey: ["portal", "adherence"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذّر الحفظ"),
  });
  const taken = !!r.read_at;
  return (
    <li className="p-3.5 flex items-start gap-3 hover:bg-white/70 transition-colors">
      <div
        className={`shrink-0 h-10 w-10 rounded-xl grid place-items-center ${taken ? "bg-emerald-50 text-emerald-600" : "bg-gradient-to-br from-teal-100 to-teal-100 text-teal-600"}`}
      >
        <Pill className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-semibold truncate ${taken ? "line-through opacity-70" : ""}`}>
            {r.medication || "تذكير دواء"}
          </span>
          {r.time && (
            <span className="text-xs bg-slate-100 text-slate-700 rounded-md px-1.5 py-0.5 tabular-nums inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {r.time}
            </span>
          )}
          {r.label && (
            <span className="text-xs bg-amber-50 text-amber-700 rounded-md px-1.5 py-0.5">
              {r.label}
            </span>
          )}
        </div>
        {r.detail && (
          <p className="text-xs text-[color:var(--portal-ink-2)] mt-1 line-clamp-2">{r.detail}</p>
        )}
        {r.last_error && (
          <p className="text-xs text-rose-600 mt-1 inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {r.last_error}
          </p>
        )}
        <div className="mt-1.5 text-[11px] text-[color:var(--portal-ink-2)] flex items-center gap-2 flex-wrap">
          <ChannelChip channel={r.channel} />
          <span>·</span>
          <span>
            {r.sent_at
              ? `أُرسل ${formatDistanceToNow(parseISO(r.sent_at), { addSuffix: true, locale: arLocale })}`
              : `أُنشئ ${formatDistanceToNow(parseISO(r.created_at), { addSuffix: true, locale: arLocale })}`}
          </span>
          {taken && r.read_at && (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCheck className="h-3 w-3" /> تم التناول{" "}
              {formatDistanceToNow(parseISO(r.read_at), { addSuffix: true, locale: arLocale })}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <StatusBadge status={r.send_status} />
        <button
          onClick={() => confirm.mutate(!taken)}
          disabled={confirm.isPending}
          className={`inline-flex items-center gap-1 rounded-full h-7 px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
            taken
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "bg-slate-900 text-white hover:bg-slate-800"
          }`}
          title={taken ? "إلغاء تأكيد التناول" : "تأكيد تناول الجرعة"}
        >
          {confirm.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : taken ? (
            <>
              <XCircle className="h-3 w-3" /> إلغاء
            </>
          ) : (
            <>
              <Check className="h-3 w-3" /> تناولتها
            </>
          )}
        </button>
      </div>
    </li>
  );
}

function ChannelChip({ channel }: { channel: string }) {
  const map: Record<string, { icon: typeof Send; label: string }> = {
    in_app: { icon: BellRing, label: "داخل التطبيق" },
    email: { icon: Mail, label: "بريد" },
    sms: { icon: Phone, label: "SMS" },
    whatsapp: { icon: MessageCircle, label: "واتساب" },
    web_push: { icon: Smartphone, label: "إشعار" },
  };
  const cfg = map[channel] ?? { icon: Send, label: channel };
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg =
    status === "sent"
      ? { cls: "bg-emerald-100 text-emerald-700", icon: Check, label: "تم الإرسال" }
      : status === "failed"
        ? { cls: "bg-rose-100 text-rose-700", icon: XCircle, label: "فشل" }
        : status === "queued"
          ? { cls: "bg-teal-100 text-teal-700", icon: Send, label: "في الطابور" }
          : status === "skipped"
            ? { cls: "bg-slate-100 text-slate-600", icon: XCircle, label: "متجاوز" }
            : { cls: "bg-amber-100 text-amber-700", icon: Clock, label: "قيد الإرسال" };
  const Icon = cfg.icon;
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.cls}`}
    >
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

function LogKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "danger" | "neutral";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : tone === "danger"
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${cls}`}
    >
      {label} <span className="tabular-nums">{value}</span>
    </span>
  );
}

/* --------------------------- iCal / .ics export --------------------------- */

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function toIcsUtc(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function toIcsLocalWall(y: number, m: number, d: number, h: number, mi: number) {
  return `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(mi)}00`;
}

/**
 * Detect the browser's IANA timezone and compute its current UTC offset in minutes.
 * Uses Intl.DateTimeFormat "longOffset" (e.g. "GMT+03:00") which is supported everywhere
 * Intl is available. Falls back to `Date.getTimezoneOffset()` if parsing fails.
 */
function getUserTimezone(): { tzid: string; offsetMinutes: number; offsetIcs: string } {
  const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let offsetMinutes = -new Date().getTimezoneOffset(); // fallback
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tzid,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // "GMT+03:00" | "GMT-05:30" | "GMT" | "UTC"
    const m = tzPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      const hh = parseInt(m[2], 10);
      const mm = parseInt(m[3] ?? "0", 10);
      offsetMinutes = sign * (hh * 60 + mm);
    } else if (/^GMT$|^UTC$/.test(tzPart)) {
      offsetMinutes = 0;
    }
  } catch {
    /* keep fallback */
  }
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offsetIcs = `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
  return { tzid, offsetMinutes, offsetIcs };
}

function exportPlanToIcs(
  plan: ReminderPlan,
  upcoming: UpcomingAppointment[],
  prefs: ReminderPreferences,
) {
  const tz = getUserTimezone();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bashen Medical//Portal Reminders//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape("تذكيرات الأدوية والمواعيد")}`,
    `X-WR-TIMEZONE:${tz.tzid}`,
    // Minimal VTIMEZONE with current standard offset (Saudi Arabia has no DST,
    // and for zones that do, calendar apps still resolve TZID from their own db).
    "BEGIN:VTIMEZONE",
    `TZID:${tz.tzid}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    `TZOFFSETFROM:${tz.offsetIcs}`,
    `TZOFFSETTO:${tz.offsetIcs}`,
    `TZNAME:${tz.tzid}`,
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  const now = new Date();
  const dtstamp = toIcsUtc(now);
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();

  // Recurring daily medication reminders — tagged with TZID so calendars respect the user's zone.
  plan.slots.forEach((s, idx) => {
    const [hh, mm] = s.time.split(":").map((v) => parseInt(v, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const start = toIcsLocalWall(y, m, d, hh, mm);
    const endMin = mm + 15;
    const endH = endMin >= 60 ? hh + 1 : hh;
    const end = toIcsLocalWall(y, m, d, endH % 24, endMin % 60);
    const uid = `med-${idx}-${hh}${mm}-${now.getTime()}@bashenmedical`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${tz.tzid}:${start}`,
      `DTEND;TZID=${tz.tzid}:${end}`,
      `RRULE:FREQ=DAILY;COUNT=${prefs.daily_repeat_days}`,
      `SUMMARY:${icsEscape(`💊 ${s.medication}${s.dosage ? ` — ${s.dosage}` : ""}`)}`,
      `DESCRIPTION:${icsEscape([s.label, s.note].filter(Boolean).join(" • "))}`,
      "CATEGORIES:Medication",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(`تذكير: ${s.medication}`)}`,
      `TRIGGER:-PT${prefs.medication_lead_minutes}M`,
      "END:VALARM",
      "END:VEVENT",
    );
  });

  // Upcoming appointments
  upcoming.forEach((a, idx) => {
    const [ay, am, ad] = a.date.split("-").map((v) => parseInt(v, 10));
    if (!ay || !am || !ad) return;
    const [ah, amn] = (a.time ?? "09:00").split(":").map((v) => parseInt(v, 10));
    const startH = Number.isNaN(ah) ? 9 : ah;
    const startM = Number.isNaN(amn) ? 0 : amn;
    const endTotal = startM + 30;
    const endH = (startH + Math.floor(endTotal / 60)) % 24;
    const endM = endTotal % 60;
    const start = toIcsLocalWall(ay, am, ad, startH, startM);
    const end = toIcsLocalWall(ay, am, ad, endH, endM);
    const uid = `apt-${a.id}-${idx}@bashenmedical`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${tz.tzid}:${start}`,
      `DTEND;TZID=${tz.tzid}:${end}`,
      `SUMMARY:${icsEscape(`🩺 موعد${a.doctor_name ? ` مع د. ${a.doctor_name}` : ""}`)}`,
      `DESCRIPTION:${icsEscape([a.specialty, a.reason].filter(Boolean).join(" • "))}`,
      "CATEGORIES:Appointment",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:موعدك قريباً",
      `TRIGGER:-PT${prefs.appointment_lead_minutes}M`,
      "END:VALARM",
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  const content = lines.join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bashen-reminders-${y}${pad(m)}${pad(d)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(`تم تنزيل ملف التقويم بتوقيت ${tz.tzid}.`);
}

/* --------------------------- Weekly adherence --------------------------- */

const adherenceQuery = queryOptions({
  queryKey: ["portal", "adherence"],
  queryFn: () => getAdherenceStats(),
  staleTime: 20_000,
});

function AdherenceCard() {
  const { data, isLoading } = useQuery(adherenceQuery);
  const stats: AdherenceStats | undefined = data;

  const ring = (pct: number) => {
    if (pct >= 80) return "text-emerald-600";
    if (pct >= 50) return "text-amber-600";
    return "text-rose-500";
  };
  const bar = (pct: number) => {
    if (pct >= 80) return "bg-emerald-400";
    if (pct >= 50) return "bg-amber-400";
    if (pct > 0) return "bg-rose-400";
    return "bg-slate-200";
  };

  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 grid place-items-center text-emerald-600">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold">التزام هذا الأسبوع</h3>
            <p className="text-xs text-[color:var(--portal-ink-2)]">
              نسبة الجرعات المؤكَّدة من إجمالي التذكيرات في آخر 7 أيام.
            </p>
          </div>
        </div>
        {stats && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className={`text-3xl font-bold tabular-nums ${ring(stats.weekPct)}`}>
                {stats.weekPct}%
              </div>
              <div className="text-[11px] text-[color:var(--portal-ink-2)]">
                {stats.weekTaken} / {stats.weekTotal} جرعة
              </div>
            </div>
            <div className="rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-3 py-2 text-center">
              <div className="text-xs">🔥 سلسلة</div>
              <div className="text-lg font-bold leading-none">
                {stats.streak} <span className="text-xs font-normal">يوم</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {isLoading || !stats ? (
        <div className="py-6 text-center text-sm text-[color:var(--portal-ink-2)] inline-flex items-center gap-2 justify-center w-full">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري احتساب الالتزام…
        </div>
      ) : stats.weekTotal === 0 ? (
        <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-[color:var(--portal-ink-2)]">
          لا توجد تذكيرات بعد هذا الأسبوع — ولّد خطة تذكيرات لبدء تتبع التزامك.
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {stats.days.map((d) => {
            const h = Math.max(12, Math.round((d.pct / 100) * 90));
            return (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <div className="w-full h-24 rounded-xl bg-slate-100/70 flex items-end overflow-hidden">
                  <div
                    className={`w-full ${bar(d.pct)} transition-all`}
                    style={{ height: d.total > 0 ? `${h}%` : "6%" }}
                    title={`${d.taken} / ${d.total}`}
                  />
                </div>
                <div className="text-[11px] font-semibold">{d.weekday}</div>
                <div
                  className={`text-[11px] tabular-nums ${d.total === 0 ? "text-slate-400" : ring(d.pct)}`}
                >
                  {d.total === 0 ? "—" : `${d.pct}%`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stats && stats.bestDay && stats.bestDay.total > 0 && (
        <p className="mt-4 text-xs text-[color:var(--portal-ink-2)]">
          أفضل يوم:{" "}
          <span className="font-semibold text-[color:var(--portal-ink)]">
            {stats.bestDay.weekday}
          </span>{" "}
          بنسبة {stats.bestDay.pct}%.
        </p>
      )}
    </div>
  );
}

/* --------------------------- Reminder preferences card --------------------------- */

const MED_LEAD_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "في الوقت المحدد" },
  { value: 5, label: "قبل 5 دقائق" },
  { value: 10, label: "قبل 10 دقائق" },
  { value: 15, label: "قبل 15 دقيقة" },
  { value: 30, label: "قبل 30 دقيقة" },
  { value: 60, label: "قبل ساعة" },
];

const APT_LEAD_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "قبل 15 دقيقة" },
  { value: 30, label: "قبل 30 دقيقة" },
  { value: 60, label: "قبل ساعة" },
  { value: 120, label: "قبل ساعتين" },
  { value: 240, label: "قبل 4 ساعات" },
  { value: 1440, label: "قبل يوم كامل" },
];

const REPEAT_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "أسبوع" },
  { value: 14, label: "أسبوعان" },
  { value: 30, label: "شهر" },
  { value: 60, label: "شهران" },
  { value: 90, label: "3 أشهر" },
];

function PreferencesCard() {
  const qc = useQueryClient();
  const { data: saved = DEFAULT_REMINDER_PREFS, isLoading } = useQuery(prefsQuery);
  const [form, setForm] = useState<ReminderPreferences>(saved);
  const [dirty, setDirty] = useState(false);

  // sync when server data loads/changes
  const savedKey = `${saved.medication_lead_minutes}|${saved.appointment_lead_minutes}|${saved.wake_hour}|${saved.sleep_hour}|${saved.daily_repeat_days}`;
  useMemo(() => {
    if (!dirty) setForm(saved);
  }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const mut = useMutation({
    mutationFn: (v: ReminderPreferences) => saveReminderPreferences({ data: v }),
    onSuccess: (v) => {
      qc.setQueryData(prefsQuery.queryKey, v);
      setDirty(false);
      toast.success("تم حفظ إعدادات التذكيرات.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذّر الحفظ"),
  });

  function update<K extends keyof ReminderPreferences>(k: K, v: ReminderPreferences[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  }

  function reset() {
    setForm(DEFAULT_REMINDER_PREFS);
    setDirty(true);
  }

  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-teal-100 to-teal-100 grid place-items-center text-teal-600">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[color:var(--portal-ink-2)] tracking-wider">
              REMINDER SETTINGS
            </div>
            <h3 className="text-lg md:text-xl font-bold mt-0.5">إعدادات التذكيرات</h3>
            <p className="text-sm text-[color:var(--portal-ink-2)] mt-1">
              خصّص وقت التنبيه قبل الجرعة وقبل الموعد ومدة تكرار التذكيرات في التقويم.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            disabled={mut.isPending || isLoading}
            className="inline-flex items-center gap-1.5 rounded-full h-9 px-3 text-xs font-semibold bg-white/70 ring-1 ring-white/60 hover:bg-[color:var(--portal-surface)] text-[color:var(--portal-ink-2)] disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> استعادة الافتراضي
          </button>
          <button
            onClick={() => mut.mutate(form)}
            disabled={!dirty || mut.isPending || isLoading}
            className="inline-flex items-center gap-1.5 rounded-full h-9 px-4 text-xs font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-50"
            style={{ background: "var(--portal-gradient)" }}
          >
            {mut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            حفظ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PrefField label="تنبيه قبل جرعة الدواء" icon={<Pill className="h-4 w-4" />}>
          <PrefSelect
            value={form.medication_lead_minutes}
            options={MED_LEAD_OPTIONS}
            onChange={(v) => update("medication_lead_minutes", v)}
          />
        </PrefField>

        <PrefField label="تنبيه قبل الموعد الطبي" icon={<CalendarClock className="h-4 w-4" />}>
          <PrefSelect
            value={form.appointment_lead_minutes}
            options={APT_LEAD_OPTIONS}
            onChange={(v) => update("appointment_lead_minutes", v)}
          />
        </PrefField>

        <PrefField
          label="مدة تكرار التذكيرات في التقويم"
          icon={<CalendarPlus className="h-4 w-4" />}
        >
          <PrefSelect
            value={form.daily_repeat_days}
            options={REPEAT_OPTIONS}
            onChange={(v) => update("daily_repeat_days", v)}
          />
        </PrefField>

        <div className="grid grid-cols-2 gap-3">
          <PrefField label="ساعة الاستيقاظ" icon={<Sunrise className="h-4 w-4" />}>
            <PrefNumber
              min={4}
              max={11}
              value={form.wake_hour}
              onChange={(v) => update("wake_hour", v)}
              suffix="ص"
            />
          </PrefField>
          <PrefField label="ساعة النوم" icon={<Moon className="h-4 w-4" />}>
            <PrefNumber
              min={20}
              max={26}
              value={form.sleep_hour}
              onChange={(v) => update("sleep_hour", v)}
              suffix={form.sleep_hour >= 24 ? "بعد منتصف الليل" : "م"}
            />
          </PrefField>
        </div>
      </div>

      <p className="text-[11px] text-[color:var(--portal-ink-2)] mt-4">
        تُستخدم هذه الإعدادات عند توليد خطة المساعد الذكي وعند تصدير ملف التقويم (.ics).
      </p>
    </div>
  );
}

function PrefField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-[color:var(--portal-ink-2)] mb-1.5 inline-flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      {children}
    </label>
  );
}

function PrefSelect({
  value,
  options,
  onChange,
}: {
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      className="w-full h-11 rounded-2xl bg-white/70 px-3 text-sm border border-white/60 outline-none focus:ring-2 focus:ring-[color:var(--portal-accent)]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function PrefNumber({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n) && n >= min && n <= max) onChange(n);
        }}
        className="w-full h-11 rounded-2xl bg-white/70 px-3 text-sm border border-white/60 outline-none focus:ring-2 focus:ring-[color:var(--portal-accent)] tabular-nums"
      />
      {suffix && (
        <span className="text-xs text-[color:var(--portal-ink-2)] whitespace-nowrap">{suffix}</span>
      )}
    </div>
  );
}

/* --------------------------- Export preview modal --------------------------- */

function ExportPreviewModal({
  plan,
  upcoming,
  prefs,
  onClose,
}: {
  plan: ReminderPlan;
  upcoming: UpcomingAppointment[];
  prefs: ReminderPreferences;
  onClose: () => void;
}) {
  const tzid = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const [slotSel, setSlotSel] = useState<Set<number>>(() => new Set(plan.slots.map((_, i) => i)));
  const [aptSel, setAptSel] = useState<Set<string>>(() => new Set(upcoming.map((a) => a.id)));

  const toggleSlot = (i: number) => {
    setSlotSel((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };
  const toggleApt = (id: string) => {
    setAptSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const allSlots = () => setSlotSel(new Set(plan.slots.map((_, i) => i)));
  const noSlots = () => setSlotSel(new Set());
  const allApts = () => setAptSel(new Set(upcoming.map((a) => a.id)));
  const noApts = () => setAptSel(new Set());

  const selectedSlots = plan.slots.filter((_, i) => slotSel.has(i));
  const selectedAppts = upcoming.filter((a) => aptSel.has(a.id));
  const totalEvents = selectedSlots.length + selectedAppts.length;

  const groupedSlots = useMemo(() => {
    const map = new Map<string, { idx: number; slot: ReminderPlan["slots"][number] }[]>();
    plan.slots.forEach((s, idx) => {
      const key = s.time.slice(0, 5);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ idx, slot: s });
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [plan]);

  const handleExport = () => {
    if (totalEvents === 0) {
      toast.error("لا يوجد أحداث محددة للتصدير.");
      return;
    }
    const filteredPlan: ReminderPlan = { ...plan, slots: selectedSlots };
    exportPlanToIcs(filteredPlan, selectedAppts, prefs);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-3xl bg-[color:var(--portal-surface)] shadow-2xl flex flex-col overflow-hidden text-[color:var(--portal-ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[color:var(--portal-ink-2)] tracking-wider">
              EXPORT PREVIEW
            </div>
            <h3 className="text-lg font-bold mt-0.5">معاينة الأحداث قبل التصدير</h3>
            <p className="text-xs text-[color:var(--portal-ink-2)] mt-1">
              راجع الأدوية والمواعيد المحددة، ثم أكّد لتنزيل ملف .ics.
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full grid place-items-center hover:bg-slate-100 text-slate-500"
            aria-label="إغلاق"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap gap-2 text-[11px]">
          <FilterPill icon={<Clock className="h-3 w-3" />} label={`المنطقة: ${tzid}`} />
          <FilterPill
            icon={<Pill className="h-3 w-3" />}
            label={`تنبيه الدواء: ${prefs.medication_lead_minutes} د`}
          />
          <FilterPill
            icon={<CalendarClock className="h-3 w-3" />}
            label={`تنبيه الموعد: ${prefs.appointment_lead_minutes} د`}
          />
          <FilterPill
            icon={<CalendarPlus className="h-3 w-3" />}
            label={`تكرار: ${prefs.daily_repeat_days} يوم`}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Medication slots */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold inline-flex items-center gap-2">
                <Pill className="h-4 w-4 text-teal-600" />
                جرعات الأدوية
                <span className="text-xs font-normal text-[color:var(--portal-ink-2)]">
                  ({slotSel.size} / {plan.slots.length})
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={allSlots}
                  className="rounded-full px-2.5 h-7 bg-slate-100 hover:bg-slate-200 font-semibold"
                >
                  تحديد الكل
                </button>
                <button
                  onClick={noSlots}
                  className="rounded-full px-2.5 h-7 bg-slate-100 hover:bg-slate-200 font-semibold"
                >
                  إلغاء الكل
                </button>
              </div>
            </div>

            {plan.slots.length === 0 ? (
              <p className="text-xs text-[color:var(--portal-ink-2)] py-4">
                لا توجد جرعات في هذه الخطة.
              </p>
            ) : (
              <ul className="space-y-2">
                {groupedSlots.map(([time, items]) => (
                  <li key={time} className="rounded-2xl bg-slate-50/60 p-3">
                    <div className="text-xs font-bold text-[color:var(--portal-ink-2)] mb-2 tabular-nums">
                      {time}
                    </div>
                    <ul className="space-y-1.5">
                      {items.map(({ idx, slot }) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 rounded-xl bg-[color:var(--portal-surface)] px-3 py-2 ring-1 ring-slate-100"
                        >
                          <input
                            type="checkbox"
                            checked={slotSel.has(idx)}
                            onChange={() => toggleSlot(idx)}
                            className="mt-1 h-4 w-4 accent-[color:var(--portal-accent)]"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">
                              {slot.medication}
                              {slot.dosage && (
                                <span className="text-xs font-normal text-[color:var(--portal-ink-2)]">
                                  {" "}
                                  — {slot.dosage}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[color:var(--portal-ink-2)] mt-0.5">
                              {[slot.label, slot.note].filter(Boolean).join(" • ")}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Appointments */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold inline-flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-teal-600" />
                المواعيد القادمة
                <span className="text-xs font-normal text-[color:var(--portal-ink-2)]">
                  ({aptSel.size} / {upcoming.length})
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={allApts}
                  className="rounded-full px-2.5 h-7 bg-slate-100 hover:bg-slate-200 font-semibold"
                >
                  تحديد الكل
                </button>
                <button
                  onClick={noApts}
                  className="rounded-full px-2.5 h-7 bg-slate-100 hover:bg-slate-200 font-semibold"
                >
                  إلغاء الكل
                </button>
              </div>
            </div>

            {upcoming.length === 0 ? (
              <p className="text-xs text-[color:var(--portal-ink-2)] py-4">لا توجد مواعيد قادمة.</p>
            ) : (
              <ul className="space-y-1.5">
                {upcoming.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 rounded-xl bg-[color:var(--portal-surface)] px-3 py-2 ring-1 ring-slate-100"
                  >
                    <input
                      type="checkbox"
                      checked={aptSel.has(a.id)}
                      onChange={() => toggleApt(a.id)}
                      className="mt-1 h-4 w-4 accent-[color:var(--portal-accent)]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">
                        {format(parseISO(a.date), "PPP", { locale: arLocale })}
                        {a.time && <span className="tabular-nums"> • {a.time.slice(0, 5)}</span>}
                      </div>
                      <div className="text-[11px] text-[color:var(--portal-ink-2)] mt-0.5">
                        {[a.doctor_name ? `د. ${a.doctor_name}` : null, a.specialty, a.reason]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50/60">
          <div className="text-xs text-[color:var(--portal-ink-2)]">
            سيُصدَّر <span className="font-bold text-[color:var(--portal-ink)]">{totalEvents}</span>{" "}
            حدثاً
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-full h-10 px-4 text-sm font-semibold bg-[color:var(--portal-surface)] ring-1 ring-slate-200 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              onClick={handleExport}
              disabled={totalEvents === 0}
              className="inline-flex items-center gap-2 rounded-full h-10 px-4 text-sm font-semibold text-[color:var(--portal-on-primary)] disabled:opacity-50"
              style={{ background: "var(--portal-gradient)" }}
            >
              <CalendarPlus className="h-4 w-4" /> تنزيل .ics
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FilterPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--portal-surface)] ring-1 ring-slate-200 px-2.5 h-6 text-[color:var(--portal-ink-2)]">
      {icon}
      {label}
    </span>
  );
}
