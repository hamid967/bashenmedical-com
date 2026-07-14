import { createFileRoute, useRouter, useNavigate, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { visibilityAwareInterval } from "@/lib/polling";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalizeReason, isEmptyReason, reasonRequiredFor } from "@/lib/reason";
import {
  getMyRoles,
  getAdminStats,
  listAppointments,
  updateAppointmentStatus,
  updateAppointmentNotes,
  listAppointmentAudit,
  listOrders,
  updateOrderStatus,
  listDoctorsAdmin,
  toggleDoctorActive,
  listSpecialtiesAdmin,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  listSpecialtiesFull,
  createSpecialty,
  updateSpecialty,
  deleteSpecialty,
  listAvailability,
  createAvailability,
  deleteAvailability,
  listReminderPreferenceAudit,
  getReminderPreferenceStats,
  exportReminderPreferenceAuditCsv,
  listSecurityAuditLog,
  listSecurityAuditActions,
  listFaqsAdmin,
  createFaq,
  updateFaq,
  deleteFaq,
  listAboutSectionsAdmin,
  createAboutSection,
  updateAboutSection,
  deleteAboutSection,
} from "@/lib/admin.functions";
import {
  listReminderDeliveries,
  exportReminderDeliveriesCsv,
  retryReminderDelivery,
  retryReminderDeliveriesBulk,
  getReminderDeliveryStats,
  type ReminderDelivery,
  type DeliveryStats,
} from "@/lib/notifications.functions";
import { ReminderPreferenceHistoryList } from "@/components/ReminderPreferenceHistory";
import {
  LayoutDashboard,
  CalendarDays,
  Pill,
  Stethoscope,
  LogOut,
  ShieldCheck,
  Users,
  Clock,
  Plus,
  Pencil,
  Trash2,
  X as XIcon,
  Tag,
  CalendarClock,
  History,
  Bell,
  BarChart3,
  Download,
  ShieldAlert,
  Search,
  FileText,
  HelpCircle,
  Info,
  Crown,
  Settings,
  UserCog,
  ClipboardList,
} from "lucide-react";

const adminSearchSchema = z.object({
  tab: fallback(z.string(), "overview").default("overview"),
  logChannel: fallback(z.string(), "").default(""),
  logStatus: fallback(z.string(), "").default(""),
  logFrom: fallback(z.string(), "").default(""),
  logTo: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/admin/classic")({
  head: () => ({
    meta: [{ title: "لوحة التحكم (الكلاسيكية) | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: zodValidator(adminSearchSchema),
  component: AdminDashboard,
});

type Tab = "overview" | "appointments" | "orders" | "doctors" | "specialties" | "availability" | "reminders-log" | "reminders-delivery-stats" | "reminders-audit" | "reminders-stats" | "security-audit" | "content";
const ALL_TABS: Tab[] = ["overview","appointments","orders","doctors","specialties","availability","reminders-log","reminders-delivery-stats","reminders-audit","reminders-stats","security-audit","content"];

const APPT_STATUS: {
  value: "new" | "confirmed" | "completed" | "cancelled" | "no_show";
  label: string;
}[] = [
  { value: "new", label: "جديد" },
  { value: "confirmed", label: "مؤكد" },
  { value: "completed", label: "منتهي" },
  { value: "cancelled", label: "ملغي" },
  { value: "no_show", label: "لم يحضر" },
];

const ORDER_STATUS: {
  value: "new" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
  label: string;
}[] = [
  { value: "new", label: "جديد" },
  { value: "preparing", label: "قيد التحضير" },
  { value: "ready", label: "جاهز" },
  { value: "out_for_delivery", label: "قيد التوصيل" },
  { value: "delivered", label: "تم التسليم" },
  { value: "cancelled", label: "ملغي" },
];

function AdminDashboard() {
  const router = useRouter();
  const navigate = useNavigate({ from: "/admin" });
  const search = Route.useSearch();
  const tab: Tab = (ALL_TABS.includes(search.tab as Tab) ? search.tab : "overview") as Tab;
  const setTab = (t: Tab) =>
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: t }),
      replace: false,
    });

  const myRolesFn = useServerFn(getMyRoles);
  const rolesQuery = useQuery({ queryKey: ["my-roles"], queryFn: () => myRolesFn() });

  const rawRoles = rolesQuery.data?.roles ?? [];
  const isSuperAdmin = rawRoles.includes("super_admin" as any);
  // super_admin يرث كل الصلاحيات
  const roles = isSuperAdmin
    ? (Array.from(new Set([...rawRoles, "admin", "reception", "pharmacy"])) as typeof rawRoles)
    : rawRoles;
  const isAdmin = roles.includes("admin");
  const isReception = roles.includes("reception");
  const isPharmacy = roles.includes("pharmacy");
  const canSeeAppts = isAdmin || isReception;
  const canSeeOrders = isAdmin || isPharmacy;

  async function handleSignOut() {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      const email = data.user?.email ?? null;
      const { logAuthEvent } = await import("@/lib/auth-log.functions");
      await (logAuthEvent as any)({ data: { action: "logout", user_id: uid, email } }).catch(
        () => {},
      );
    } catch {}
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }

  if (rolesQuery.isLoading) {
    return (
      <div className="container-app py-16 text-center text-muted-foreground">جارٍ التحميل…</div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="container-app py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-bold">حسابك بدون صلاحيات</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            تم تسجيل الدخول لكن لم يتم تعيين دور لك بعد. تواصل مع مدير النظام لتفعيل الوصول.
          </p>
          <button
            onClick={handleSignOut}
            className="mt-6 inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any; show: boolean }[] = [
    { id: "overview" as Tab, label: "نظرة عامة", icon: LayoutDashboard, show: true },
    { id: "appointments" as Tab, label: "المواعيد", icon: CalendarDays, show: canSeeAppts },
    { id: "orders" as Tab, label: "طلبات الأدوية", icon: Pill, show: canSeeOrders },
    { id: "doctors" as Tab, label: "الأطباء", icon: Stethoscope, show: isAdmin },
    { id: "specialties" as Tab, label: "التخصصات", icon: Tag, show: isAdmin },
    {
      id: "availability" as Tab,
      label: "فترات الدوام",
      icon: CalendarClock,
      show: isAdmin || isReception,
    },
    {
      id: "reminders-log" as Tab,
      label: "سجل التذكيرات المُرسلة",
      icon: Bell,
      show: canSeeAppts,
    },
    {
      id: "reminders-delivery-stats" as Tab,
      label: "إحصائيات الإرسال",
      icon: BarChart3,
      show: canSeeAppts,
    },
    {
      id: "reminders-audit" as Tab,
      label: "سجل تفضيلات التذكير",
      icon: History,
      show: canSeeAppts,
    },
    {
      id: "reminders-stats" as Tab,
      label: "إحصائيات التذكيرات",
      icon: BarChart3,
      show: canSeeAppts,
    },
    {
      id: "security-audit" as Tab,
      label: "سجل الأمان",
      icon: ShieldAlert,
      show: isAdmin,
    },
    {
      id: "content" as Tab,
      label: "المحتوى",
      icon: FileText,
      show: isAdmin,
    },
  ].filter((t) => t.show);

  return (
    <div className="container-app py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">
              {isSuperAdmin ? "مركز قيادة السوبر أدمن" : "لوحة التحكم"}
            </h1>
            {isSuperAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                <Crown className="h-3.5 w-3.5" /> صلاحية كاملة
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            أدوارك:{" "}
            {roles.map((r) => (
              <span
                key={r}
                className="mx-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {r}
              </span>
            ))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/dashboard"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              لوحة الإحصائيات
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/orders-unified"
              className="rounded-md border border-primary bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
            >
              الطلبات الموحّدة
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/reports"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              التقارير
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/calendar"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              التقويم
            </Link>
          )}
          {roles.includes("admin") && (
            <Link
              to="/doctors-management"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              إدارة الأطباء
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/quick-add"
              className="rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
            >
              + إضافة سريعة
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/notifications-queue"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              الإشعارات الخارجية
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/message-templates"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              قوالب الرسائل
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception") || roles.includes("doctor" as any)) && (
            <Link
              to="/patients"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              السجلات الطبية
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/patients-management"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              إدارة المرضى
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/patients-analytics"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              تحليلات المرضى
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception") || roles.includes("doctor" as never)) && (
            <Link
              to="/ratings"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              تقييمات المرضى
            </Link>
          )}
          {roles.includes("admin") && (
            <Link
              to="/second-opinion-admin"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              طلبات الرأي الطبي الثاني
            </Link>
          )}
          {roles.includes("admin") && (
            <Link
              to="/corporate-admin"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              طلبات الشركات
            </Link>
          )}
          {roles.includes("admin") && (
            <Link
              to="/patient-stories-admin"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              قصص المرضى
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/qr-cards"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              بطاقات QR
            </Link>
          )}

          {roles.includes("admin") && (
            <Link
              to="/rbac"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              الصلاحيات
            </Link>
          )}
          {roles.includes("admin") && (
            <Link
              to="/audit-log"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              سجل التدقيق
            </Link>
          )}
          {(roles.includes("admin") || roles.includes("reception")) && (
            <Link
              to="/audit-export"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              تصدير السجلات CSV
            </Link>
          )}
          {roles.includes("admin") && (
            <Link
              to="/clinic-settings"
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              إعدادات العيادة
            </Link>
          )}
          <Link
            to="/"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            الموقع
          </Link>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> خروج
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab isSuperAdmin={isSuperAdmin} />}
      {tab === "appointments" && canSeeAppts && <AppointmentsTab />}
      {tab === "orders" && canSeeOrders && <OrdersTab />}
      {tab === "doctors" && isAdmin && <DoctorsTab />}
      {tab === "specialties" && isAdmin && <SpecialtiesTab />}
      {tab === "availability" && (isAdmin || isReception) && <AvailabilityTab />}
      {tab === "reminders-log" && canSeeAppts && (
        <RemindersDeliveryTab
          initialChannel={search.logChannel}
          initialStatus={search.logStatus}
          initialDateFrom={search.logFrom}
          initialDateTo={search.logTo}
        />
      )}
      {tab === "reminders-delivery-stats" && canSeeAppts && <RemindersDeliveryStatsTab />}
      {tab === "reminders-audit" && canSeeAppts && <RemindersAuditTab />}
      {tab === "reminders-stats" && canSeeAppts && <RemindersStatsTab />}
      {tab === "security-audit" && isAdmin && <SecurityAuditTab />}
      {tab === "content" && isAdmin && <ContentTab />}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number;
  icon: any;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`h-5 w-5 text-${tone}`} />
      </div>
      <div className="mt-3 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function OverviewTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const fn = useServerFn(getAdminStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });
  if (isLoading) return <div className="text-muted-foreground">جارٍ تحميل الإحصائيات…</div>;
  if (!data) return null;
  return (
    <div className="space-y-6">
      {isSuperAdmin && (
        <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-l from-primary/10 via-card to-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Crown className="h-5 w-5" />
                <h2 className="font-bold">التحكم المركزي</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                إدارة المستخدمين والصلاحيات والإعدادات والسجلات من نقطة واحدة.
              </p>
            </div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              النظام متصل
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: "/rbac", label: "المستخدمون والصلاحيات", icon: UserCog },
              { to: "/appointments-queue", label: "تشغيل الحجوزات", icon: CalendarDays },
              { to: "/audit-log", label: "سجل التدقيق والأمان", icon: ClipboardList },
              { to: "/clinic-settings", label: "إعدادات المجمع", icon: Settings },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-center gap-3 rounded-xl border border-border bg-background/80 p-3 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="إجمالي المواعيد" value={data.appointmentsTotal} icon={CalendarDays} />
        <StatCard label="مواعيد اليوم" value={data.appointmentsToday} icon={Clock} />
        <StatCard label="مواعيد تحتاج إجراء" value={data.appointmentsPending} icon={Users} />
        <StatCard label="إجمالي طلبات الأدوية" value={data.ordersTotal} icon={Pill} />
        <StatCard label="طلبات جديدة" value={data.ordersPending} icon={Pill} />
        <StatCard label="الأطباء النشطون" value={data.doctorsActive} icon={Stethoscope} />
      </div>
    </div>
  );
}

type ApptStatus = "new" | "confirmed" | "completed" | "cancelled" | "no_show";

const APPT_STATUS_STYLES: Record<ApptStatus, string> = {
  new: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  no_show: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

function StatusBadge({ status }: { status: ApptStatus }) {
  const label = APPT_STATUS.find((s) => s.value === status)?.label ?? status;
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${APPT_STATUS_STYLES[status]}`}
    >
      {label}
    </span>
  );
}

function AppointmentsTab() {
  const listFn = useServerFn(listAppointments);
  const updateFn = useServerFn(updateAppointmentStatus);
  const updateNotesFn = useServerFn(updateAppointmentNotes);
  const q = useQuery({ queryKey: ["admin-appts"], queryFn: () => listFn() });
  const [filter, setFilter] = useState<"all" | ApptStatus>("all");
  const [search, setSearch] = useState("");
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);

  const m = useMutation({
    mutationFn: (v: { id: string; status: ApptStatus; reason?: string }) => updateFn({ data: v }),
    onSuccess: (_d, v) => {
      const label = APPT_STATUS.find((s) => s.value === v.status)?.label ?? v.status;
      toast.success(`تم تحديث الحالة إلى: ${label}`);
      q.refetch();
    },
    onError: (e: any) => {
      const msg: string = e?.message ?? "";
      // Unify DB-side reason failures (empty after trim / whitespace-only incl. \n \t NBSP)
      // to the same user-facing message used by client-side pre-validation.
      if (
        /reason_required_for_/i.test(msg) ||
        /reason_blank_after_trim/i.test(msg) ||
        /السبب مطلوب/.test(msg) ||
        /السبب المُدخل فارغ/.test(msg)
      ) {
        toast.error("السبب مطلوب لهذا الإجراء");
        return;
      }
      // Reason exceeds the 500-char cap (mirrors Zod .max(500)).
      if (/reason_too_long/i.test(msg) || /السبب طويل جدًا/.test(msg)) {
        toast.error("السبب طويل جدًا (الحد الأقصى 500 حرفًا)");
        return;
      }
      toast.error(msg || "فشل التحديث");
    },
  });

  const notesM = useMutation({
    mutationFn: (v: { id: string; notes: string | null; reason?: string }) =>
      updateNotesFn({ data: v }),
    onSuccess: () => {
      toast.success("تم تحديث الملاحظات");
      q.refetch();
    },
    onError: (e: any) => {
      const msg: string = e?.message ?? "";
      if (/notes_too_long/i.test(msg) || /الملاحظات طويلة جدًا/.test(msg)) {
        toast.error("الملاحظات طويلة جدًا (الحد الأقصى 500 حرفًا)");
        return;
      }
      if (/reason_too_long/i.test(msg) || /السبب طويل جدًا/.test(msg)) {
        toast.error("السبب طويل جدًا (الحد الأقصى 500 حرفًا)");
        return;
      }
      toast.error(msg || "فشل تحديث الملاحظات");
    },
  });

  // Ask for a reason on destructive/final transitions; optional otherwise.
  // Normalization (trim / NBSP / length cap) is shared with server + DB via
  // src/lib/reason.ts so all three layers agree on what counts as empty.
  const changeStatus = (id: string, status: ApptStatus) => {
    const needsReason = reasonRequiredFor(status);
    const promptMsg = needsReason
      ? `سبب التغيير إلى "${APPT_STATUS.find((s) => s.value === status)?.label}" (إلزامي):`
      : `سبب التغيير (اختياري):`;
    const raw = window.prompt(promptMsg, "");
    if (raw === null) return; // cancelled
    const normalized = normalizeReason(raw);
    if (needsReason && isEmptyReason(normalized)) {
      toast.error("السبب مطلوب لهذا الإجراء");
      return;
    }
    m.mutate({ id, status, reason: isEmptyReason(normalized) ? undefined : normalized });
  };

  // Edit the row's notes via prompt. Empty-after-trim clears the field
  // (persisted as NULL); interior whitespace is preserved verbatim by the
  // DB-side normalize_reason() helper.
  const editNotes = (id: string, current: string | null) => {
    const raw = window.prompt("الملاحظات (اتركها فارغة للمسح):", current ?? "");
    if (raw === null) return; // cancelled
    const trimmed = normalizeReason(raw);
    notesM.mutate({
      id,
      notes: isEmptyReason(trimmed) ? null : (trimmed as string),
    });
  };

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const all = (q.data ?? []) as any[];
  const rows = all.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay =
        `${r.patient_name ?? ""} ${r.patient_phone ?? ""} ${r.national_id ?? ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const counts: Record<string, number> = { all: all.length };
  for (const s of APPT_STATUS) counts[s.value] = all.filter((r) => r.status === s.value).length;

  const chip = (v: "all" | ApptStatus, label: string) => (
    <button
      key={v}
      onClick={() => setFilter(v)}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        filter === v
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
      <span className="rounded-full bg-background/80 px-1.5 text-[10px] font-semibold">
        {counts[v] ?? 0}
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {chip("all", "الكل")}
        {APPT_STATUS.map((s) => chip(s.value, s.label))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الهاتف…"
          className="ms-auto w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm sm:w-auto"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">المريض</th>
              <th className="px-4 py-3">الهاتف</th>
              <th className="px-4 py-3">التخصص / الطبيب</th>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">الوقت</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  لا توجد مواعيد مطابقة
                </td>
              </tr>
            )}
            {rows.map((r: any) => {
              const status = r.status as ApptStatus;
              const pending = m.isPending && m.variables?.id === r.id;
              const isFinal =
                status === "completed" || status === "cancelled" || status === "no_show";
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.patient_name}</div>
                    {r.national_id && (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {r.national_id}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    <a href={`tel:${r.patient_phone}`} className="hover:text-primary">
                      {r.patient_phone}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <div>{r.specialties?.name_ar ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.doctors?.name_ar ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    {r.appointment_date}
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    {r.appointment_time}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {status !== "confirmed" && !isFinal && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "confirmed")}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                        >
                          تأكيد
                        </button>
                      )}
                      {status === "confirmed" && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "completed")}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-60"
                        >
                          إنهاء
                        </button>
                      )}
                      {status === "confirmed" && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "no_show")}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/10 disabled:opacity-60"
                        >
                          لم يحضر
                        </button>
                      )}
                      {!isFinal && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "cancelled")}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        >
                          إلغاء
                        </button>
                      )}
                      {isFinal && (
                        <button
                          disabled={pending}
                          onClick={() => changeStatus(r.id, "new")}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
                        >
                          إعادة فتح
                        </button>
                      )}
                      <button
                        disabled={notesM.isPending && notesM.variables?.id === r.id}
                        onClick={() => editNotes(r.id, r.notes ?? null)}
                        className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
                        title="تعديل الملاحظات"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        ملاحظة
                      </button>
                      <button
                        onClick={() => setHistoryFor({ id: r.id, name: r.patient_name })}
                        className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                        title="سجل التغييرات"
                      >
                        <History className="h-3.5 w-3.5" />
                        السجل
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {historyFor && (
        <AuditModal
          appointmentId={historyFor.id}
          patientName={historyFor.name}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

function AuditModal({
  appointmentId,
  patientName,
  onClose,
}: {
  appointmentId: string;
  patientName: string;
  onClose: () => void;
}) {
  const fn = useServerFn(listAppointmentAudit);
  const remFn = useServerFn(listReminderPreferenceAudit);
  const q = useQuery({
    queryKey: ["appt-audit", appointmentId],
    queryFn: () => fn({ data: { appointmentId } }),
  });
  const rq = useQuery({
    queryKey: ["appt-reminder-audit", appointmentId],
    queryFn: () => remFn({ data: { appointmentId, pageSize: 100 } }),
  });
  const rows = (q.data ?? []) as any[];
  const reminderRows = ((rq.data as any)?.rows ?? []) as any[];
  const statusLabel = (v: string | null) =>
    v ? (APPT_STATUS.find((s) => s.value === v)?.label ?? v) : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">سجل تغييرات الحجز</h3>
            <p className="text-sm text-muted-foreground">{patientName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {q.isLoading ? (
          <div className="py-8 text-center text-muted-foreground">جارٍ التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">لا توجد تغييرات مسجّلة بعد</div>
        ) : (
          <ol className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{r.changed_by_name ?? "مستخدم غير معروف"}</span>
                  <span dir="ltr">{new Date(r.changed_at).toLocaleString("ar-SA")}</span>
                </div>
                {(r.old_status || r.new_status) && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">
                      <span className="text-muted-foreground">نوع الانتقال:</span>
                      <span>{statusLabel(r.old_status)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{statusLabel(r.new_status)}</span>
                    </span>
                  </div>
                )}
                {(r.old_notes !== null || r.new_notes !== null) &&
                  (r.old_notes !== undefined || r.new_notes !== undefined) && (
                    <div className="mt-1 text-xs">
                      <div className="text-muted-foreground">الملاحظات قبل:</div>
                      <div className="whitespace-pre-wrap rounded bg-muted/50 p-2">
                        {r.old_notes ?? "—"}
                      </div>
                      <div className="mt-1 text-muted-foreground">الملاحظات بعد:</div>
                      <div className="whitespace-pre-wrap rounded bg-muted/50 p-2">
                        {r.new_notes ?? "—"}
                      </div>
                    </div>
                  )}
                {r.reason && (
                  <div className="mt-2 rounded bg-primary/5 p-2 text-xs">
                    <span className="font-medium text-primary">السبب:</span> {r.reason}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-6 border-t border-border pt-4">
          <h4 className="mb-2 text-sm font-semibold">سجل تفضيلات التذكير</h4>
          {rq.isLoading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
          ) : (
            <ReminderPreferenceHistoryList rows={reminderRows} showActor />
          )}
        </div>
      </div>
    </div>
  );
}

function OrdersTab() {
  const listFn = useServerFn(listOrders);
  const updateFn = useServerFn(updateOrderStatus);
  const q = useQuery({ queryKey: ["admin-orders"], queryFn: () => listFn() });
  const m = useMutation({
    mutationFn: (v: { id: string; status: any }) => updateFn({ data: v }),
    onSuccess: () => {
      toast.success("تم التحديث");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل التحديث"),
  });

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const rows = q.data ?? [];

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">المريض</th>
            <th className="px-4 py-3">الهاتف</th>
            <th className="px-4 py-3">الحي / العنوان</th>
            <th className="px-4 py-3">نوع التوصيل</th>
            <th className="px-4 py-3">الوصفة</th>
            <th className="px-4 py-3">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                لا توجد طلبات
              </td>
            </tr>
          )}
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{r.patient_name}</td>
              <td className="px-4 py-3" dir="ltr">
                {r.patient_phone}
              </td>
              <td className="px-4 py-3">
                <div>{r.district ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{r.address ?? ""}</div>
              </td>
              <td className="px-4 py-3">{r.delivery_type}</td>
              <td className="px-4 py-3">
                {r.prescription_image_url ? (
                  <a
                    href={r.prescription_image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    عرض
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <select
                  defaultValue={r.status}
                  onChange={(e) => m.mutate({ id: r.id, status: e.target.value })}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {ORDER_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DoctorForm = {
  id?: string;
  specialty_id: string | null;
  name_ar: string;
  name_en: string;
  title_ar: string;
  title_en: string;
  photo_url: string;
  bio_ar: string;
  bio_en: string;
  languages: string; // comma-separated in form
  is_active: boolean;
  sort_order: number;
};

const emptyDoctor: DoctorForm = {
  specialty_id: null,
  name_ar: "",
  name_en: "",
  title_ar: "",
  title_en: "",
  photo_url: "",
  bio_ar: "",
  bio_en: "",
  languages: "ar,en",
  is_active: true,
  sort_order: 0,
};

function DoctorsTab() {
  const listFn = useServerFn(listDoctorsAdmin);
  const specialtiesFn = useServerFn(listSpecialtiesAdmin);
  const toggleFn = useServerFn(toggleDoctorActive);
  const createFn = useServerFn(createDoctor);
  const updateFn = useServerFn(updateDoctor);
  const deleteFn = useServerFn(deleteDoctor);

  const q = useQuery({ queryKey: ["admin-doctors"], queryFn: () => listFn() });
  const specQ = useQuery({ queryKey: ["admin-specialties"], queryFn: () => specialtiesFn() });

  const [editing, setEditing] = useState<DoctorForm | null>(null);

  const toggleM = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => {
      toast.success("تم التحديث");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل التحديث"),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });
  const saveM = useMutation({
    mutationFn: async (form: DoctorForm) => {
      const payload: any = {
        specialty_id: form.specialty_id || null,
        name_ar: form.name_ar.trim(),
        name_en: form.name_en.trim(),
        title_ar: form.title_ar.trim() || null,
        title_en: form.title_en.trim() || null,
        photo_url: form.photo_url.trim(),
        bio_ar: form.bio_ar.trim() || null,
        bio_en: form.bio_en.trim() || null,
        languages: form.languages
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 0,
      };
      if (form.id) return updateFn({ data: { id: form.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEditing(null);
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const rows = q.data ?? [];
  const specialties = specQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ ...emptyDoctor })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> إضافة طبيب
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">الطبيب</th>
              <th className="px-4 py-3">التخصص</th>
              <th className="px-4 py-3">اللغات</th>
              <th className="px-4 py-3">الترتيب</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  لا يوجد أطباء
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {r.photo_url && (
                      <img
                        src={r.photo_url}
                        alt={r.name_ar}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <div className="font-medium">{r.name_ar}</div>
                      <div className="text-xs text-muted-foreground">{r.title_ar ?? "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{r.specialties?.name_ar ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{(r.languages ?? []).join(", ")}</td>
                <td className="px-4 py-3 text-xs" dir="ltr">
                  {r.sort_order}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleM.mutate({ id: r.id, is_active: !r.is_active })}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.is_active ? "نشط" : "متوقف"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          specialty_id: r.specialty_id ?? null,
                          name_ar: r.name_ar ?? "",
                          name_en: r.name_en ?? "",
                          title_ar: r.title_ar ?? "",
                          title_en: r.title_en ?? "",
                          photo_url: r.photo_url ?? "",
                          bio_ar: r.bio_ar ?? "",
                          bio_en: r.bio_en ?? "",
                          languages: (r.languages ?? []).join(","),
                          is_active: !!r.is_active,
                          sort_order: r.sort_order ?? 0,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`حذف الطبيب "${r.name_ar}"؟`)) deleteM.mutate(r.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <DoctorFormModal
          value={editing}
          specialties={specialties as any[]}
          saving={saveM.isPending}
          onCancel={() => setEditing(null)}
          onSave={(v) => saveM.mutate(v)}
        />
      )}
    </div>
  );
}

function DoctorFormModal({
  value,
  specialties,
  saving,
  onCancel,
  onSave,
}: {
  value: DoctorForm;
  specialties: { id: string; name_ar: string; name_en: string }[];
  saving: boolean;
  onCancel: () => void;
  onSave: (v: DoctorForm) => void;
}) {
  const [form, setForm] = useState<DoctorForm>(value);
  const set = <K extends keyof DoctorForm>(k: K, v: DoctorForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">{form.id ? "تعديل طبيب" : "إضافة طبيب"}</h2>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name_ar.trim() || !form.name_en.trim()) {
              toast.error("الاسم بالعربي والإنجليزي مطلوب");
              return;
            }
            onSave(form);
          }}
          className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2"
        >
          <Field label="الاسم (عربي) *">
            <input
              required
              value={form.name_ar}
              onChange={(e) => set("name_ar", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Name (English) *">
            <input
              required
              dir="ltr"
              value={form.name_en}
              onChange={(e) => set("name_en", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="المسمى (عربي)">
            <input
              value={form.title_ar}
              onChange={(e) => set("title_ar", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Title (English)">
            <input
              dir="ltr"
              value={form.title_en}
              onChange={(e) => set("title_en", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="التخصص">
            <select
              value={form.specialty_id ?? ""}
              onChange={(e) => set("specialty_id", e.target.value || null)}
              className={inputCls}
            >
              <option value="">— بدون —</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}
                </option>
              ))}
            </select>
          </Field>
          <Field label="اللغات (مفصولة بفاصلة)">
            <input
              dir="ltr"
              value={form.languages}
              onChange={(e) => set("languages", e.target.value)}
              className={inputCls}
              placeholder="ar,en"
            />
          </Field>
          <Field label="رابط الصورة" full>
            <input
              dir="ltr"
              type="url"
              value={form.photo_url}
              onChange={(e) => set("photo_url", e.target.value)}
              className={inputCls}
              placeholder="https://…"
            />
          </Field>
          <Field label="نبذة (عربي)" full>
            <textarea
              value={form.bio_ar}
              onChange={(e) => set("bio_ar", e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          <Field label="Bio (English)" full>
            <textarea
              dir="ltr"
              value={form.bio_en}
              onChange={(e) => set("bio_en", e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          <Field label="الترتيب">
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="الحالة">
            <label className="mt-2 inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
              />
              <span className="text-sm">نشط</span>
            </label>
          </Field>

          <div className="sm:col-span-2 mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-input px-4 py-2 text-sm"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

/* ---------------- Specialties Tab ---------------- */

type SpecialtyForm = {
  id?: string;
  slug: string;
  name_ar: string;
  name_en: string;
  icon: string;
  description_ar: string;
  description_en: string;
  is_active: boolean;
  sort_order: number;
};

const emptySpecialty: SpecialtyForm = {
  slug: "",
  name_ar: "",
  name_en: "",
  icon: "",
  description_ar: "",
  description_en: "",
  is_active: true,
  sort_order: 0,
};

function SpecialtiesTab() {
  const listFn = useServerFn(listSpecialtiesFull);
  const createFn = useServerFn(createSpecialty);
  const updateFn = useServerFn(updateSpecialty);
  const deleteFn = useServerFn(deleteSpecialty);

  const q = useQuery({ queryKey: ["admin-specialties-full"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<SpecialtyForm | null>(null);

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });
  const saveM = useMutation({
    mutationFn: async (f: SpecialtyForm) => {
      const payload = {
        slug: f.slug.trim(),
        name_ar: f.name_ar.trim(),
        name_en: f.name_en.trim(),
        icon: f.icon.trim() || null,
        description_ar: f.description_ar.trim() || null,
        description_en: f.description_en.trim() || null,
        is_active: f.is_active,
        sort_order: Number(f.sort_order) || 0,
      };
      if (f.id) return updateFn({ data: { id: f.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEditing(null);
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ ...emptySpecialty })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> إضافة تخصص
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">التخصص</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">الأيقونة</th>
              <th className="px-4 py-3">الترتيب</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  لا توجد تخصصات
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name_ar}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">
                    {r.name_en}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" dir="ltr">
                  {r.slug}
                </td>
                <td className="px-4 py-3 text-xs">{r.icon ?? "—"}</td>
                <td className="px-4 py-3 text-xs" dir="ltr">
                  {r.sort_order}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    {r.is_active ? "نشط" : "متوقف"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          slug: r.slug ?? "",
                          name_ar: r.name_ar ?? "",
                          name_en: r.name_en ?? "",
                          icon: r.icon ?? "",
                          description_ar: r.description_ar ?? "",
                          description_en: r.description_en ?? "",
                          is_active: !!r.is_active,
                          sort_order: r.sort_order ?? 0,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`حذف "${r.name_ar}"؟ سيؤثر ذلك على الأطباء المرتبطين.`))
                          deleteM.mutate(r.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <SpecialtyFormModal
          value={editing}
          saving={saveM.isPending}
          onCancel={() => setEditing(null)}
          onSave={(v) => saveM.mutate(v)}
        />
      )}
    </div>
  );
}

function SpecialtyFormModal({
  value,
  saving,
  onCancel,
  onSave,
}: {
  value: SpecialtyForm;
  saving: boolean;
  onCancel: () => void;
  onSave: (v: SpecialtyForm) => void;
}) {
  const [form, setForm] = useState<SpecialtyForm>(value);
  const set = <K extends keyof SpecialtyForm>(k: K, v: SpecialtyForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">{form.id ? "تعديل تخصص" : "إضافة تخصص"}</h2>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.slug.trim() || !form.name_ar.trim() || !form.name_en.trim()) {
              toast.error("Slug والاسم بالعربي والإنجليزي مطلوبة");
              return;
            }
            onSave(form);
          }}
          className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2"
        >
          <Field label="Slug (بالإنجليزي، بدون مسافات) *">
            <input
              required
              dir="ltr"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
              className={inputCls}
              placeholder="cardiology"
            />
          </Field>
          <Field label="أيقونة (اسم Lucide)">
            <input
              dir="ltr"
              value={form.icon}
              onChange={(e) => set("icon", e.target.value)}
              className={inputCls}
              placeholder="Heart"
            />
          </Field>
          <Field label="الاسم (عربي) *">
            <input
              required
              value={form.name_ar}
              onChange={(e) => set("name_ar", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Name (English) *">
            <input
              required
              dir="ltr"
              value={form.name_en}
              onChange={(e) => set("name_en", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="وصف (عربي)" full>
            <textarea
              value={form.description_ar}
              onChange={(e) => set("description_ar", e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          <Field label="Description (English)" full>
            <textarea
              dir="ltr"
              value={form.description_en}
              onChange={(e) => set("description_en", e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          <Field label="الترتيب">
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="الحالة">
            <label className="mt-2 inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
              />
              <span className="text-sm">نشط</span>
            </label>
          </Field>
          <div className="sm:col-span-2 mt-2 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-input px-4 py-2 text-sm"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Availability Tab ---------------- */

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function AvailabilityTab() {
  const doctorsFn = useServerFn(listDoctorsAdmin);
  const listFn = useServerFn(listAvailability);
  const createFn = useServerFn(createAvailability);
  const deleteFn = useServerFn(deleteAvailability);

  const doctorsQ = useQuery({ queryKey: ["admin-doctors"], queryFn: () => doctorsFn() });
  const [doctorId, setDoctorId] = useState<string>("");

  const slotsQ = useQuery({
    queryKey: ["admin-availability", doctorId],
    queryFn: () => listFn({ data: { doctor_id: doctorId } }),
    enabled: !!doctorId,
  });

  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [slotMinutes, setSlotMinutes] = useState(30);

  const addM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          doctor_id: doctorId,
          weekday,
          start_time: startTime,
          end_time: endTime,
          slot_minutes: slotMinutes,
        },
      }),
    onSuccess: () => {
      toast.success("تمت إضافة الفترة");
      slotsQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الإضافة"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      slotsQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });

  const doctors = doctorsQ.data ?? [];
  const slots = slotsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <label className="block text-sm font-medium">اختر الطبيب</label>
        <select
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          className={`${inputCls} mt-2 max-w-md`}
        >
          <option value="">— اختر —</option>
          {doctors.map((d: any) => (
            <option key={d.id} value={d.id}>
              {d.name_ar} {d.specialties?.name_ar ? `— ${d.specialties.name_ar}` : ""}
            </option>
          ))}
        </select>
      </div>

      {doctorId && (
        <>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-bold">إضافة فترة دوام</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="اليوم">
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                  className={inputCls}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="من">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="إلى">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="مدة الحجز (دقيقة)">
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={slotMinutes}
                  onChange={(e) => setSlotMinutes(Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
              <div className="flex items-end">
                <button
                  onClick={() => addM.mutate()}
                  disabled={addM.isPending}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  <Plus className="inline h-4 w-4 -mt-0.5" /> إضافة
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">اليوم</th>
                  <th className="px-4 py-3">من</th>
                  <th className="px-4 py-3">إلى</th>
                  <th className="px-4 py-3">مدة الحجز</th>
                  <th className="px-4 py-3">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {slotsQ.isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}
                {!slotsQ.isLoading && slots.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      لا توجد فترات لهذا الطبيب
                    </td>
                  </tr>
                )}
                {slots.map((s: any) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{WEEKDAYS[s.weekday]}</td>
                    <td className="px-4 py-3" dir="ltr">
                      {s.start_time}
                    </td>
                    <td className="px-4 py-3" dir="ltr">
                      {s.end_time}
                    </td>
                    <td className="px-4 py-3" dir="ltr">
                      {s.slot_minutes} د
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          if (confirm("حذف هذه الفترة؟")) delM.mutate(s.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Reminders Delivery Tab — actual sent reminders + status per booking
// ============================================================================

const CHANNEL_LABEL_AR: Record<string, string> = {
  in_app: "داخل التطبيق",
  web_push: "إشعار متصفح",
  sms: "SMS",
  whatsapp: "واتساب",
  email: "بريد",
};

const STATUS_LABEL_AR: Record<string, { label: string; cls: string }> = {
  pending: { label: "قيد الانتظار", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  queued: { label: "في الطابور", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  sent: { label: "مُرسل", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  failed: { label: "فشل", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  skipped: { label: "متجاوز", cls: "bg-muted text-muted-foreground" },
};

function reminderKindLabel(kind: string): string {
  if (kind === "reminder_24h") return "قبل 24 ساعة";
  if (kind === "reminder_2h") return "قبل ساعتين";
  const m = kind.match(/^reminder_(\d+)m$/);
  if (m) {
    const n = Number(m[1]);
    if (n % 1440 === 0) return `قبل ${n / 1440} يوم`;
    if (n % 60 === 0) return `قبل ${n / 60} ساعة`;
    return `قبل ${n} دقيقة`;
  }
  return kind;
}

type LogChannel = "" | "in_app" | "web_push" | "sms" | "whatsapp" | "email";
type LogStatus = "" | "pending" | "queued" | "sent" | "failed" | "skipped";
const LOG_CHANNELS: LogChannel[] = ["", "in_app", "web_push", "sms", "whatsapp", "email"];
const LOG_STATUSES: LogStatus[] = ["", "pending", "queued", "sent", "failed", "skipped"];
const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function RemindersDeliveryTab({
  initialChannel = "",
  initialStatus = "",
  initialDateFrom = "",
  initialDateTo = "",
}: {
  initialChannel?: string;
  initialStatus?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
} = {}) {
  const listFn = useServerFn(listReminderDeliveries);
  const exportFn = useServerFn(exportReminderDeliveriesCsv);
  const retryFn = useServerFn(retryReminderDelivery);
  const bulkRetryFn = useServerFn(retryReminderDeliveriesBulk);
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const safeCh: LogChannel = (LOG_CHANNELS.includes(initialChannel as LogChannel)
    ? (initialChannel as LogChannel)
    : "");
  const safeSt: LogStatus = (LOG_STATUSES.includes(initialStatus as LogStatus)
    ? (initialStatus as LogStatus)
    : "");
  const safeFrom = isDateStr(initialDateFrom) ? initialDateFrom : "";
  const safeTo = isDateStr(initialDateTo) ? initialDateTo : "";
  const [appointmentIdInput, setAppointmentIdInput] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(safeFrom);
  const [dateTo, setDateTo] = useState(safeTo);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [channel, setChannel] = useState<LogChannel>(safeCh);
  const [audience, setAudience] = useState<"" | "user" | "staff">("");
  const [status, setStatus] = useState<LogStatus>(safeSt);
  const [applied, setApplied] = useState<{
    appointmentId: string;
    patientQuery: string;
    dateFrom: string;
    dateTo: string;
    timeFrom: string;
    timeTo: string;
    channel: typeof channel;
    audience: typeof audience;
    status: typeof status;
  }>({
    appointmentId: "",
    patientQuery: "",
    dateFrom: safeFrom,
    dateTo: safeTo,
    timeFrom: "",
    timeTo: "",
    channel: safeCh,
    audience: "",
    status: safeSt,
  });
  const [uuidError, setUuidError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["reminders-log", applied],
    queryFn: () =>
      listFn({
        data: {
          appointmentId: applied.appointmentId || undefined,
          patientQuery: applied.patientQuery || undefined,
          dateFrom: applied.dateFrom || undefined,
          dateTo: applied.dateTo || undefined,
          timeFrom: applied.timeFrom || undefined,
          timeTo: applied.timeTo || undefined,
          channel: applied.channel || undefined,
          audience: applied.audience || undefined,
          status: applied.status || undefined,
          limit: 300,
        },
      }),
    refetchInterval: visibilityAwareInterval(90_000, 5 * 60_000),
    placeholderData: (prev) => prev,
  });

  function apply() {
    const trimmed = appointmentIdInput.trim();
    if (trimmed && !/^[0-9a-f-]{36}$/i.test(trimmed)) {
      setUuidError("الرجاء استخدام معرّف الموعد الكامل (UUID).");
      return;
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setRangeError("تاريخ البداية يجب أن يسبق تاريخ النهاية.");
      return;
    }
    if (timeFrom && timeTo && timeFrom > timeTo) {
      setRangeError("وقت البداية يجب أن يسبق وقت النهاية.");
      return;
    }
    setUuidError(null);
    setRangeError(null);
    setApplied({
      appointmentId: trimmed,
      patientQuery: patientQuery.trim(),
      dateFrom,
      dateTo,
      timeFrom,
      timeTo,
      channel,
      audience,
      status,
    });
  }
  function clearAll() {
    setAppointmentIdInput("");
    setPatientQuery("");
    setDateFrom("");
    setDateTo("");
    setTimeFrom("");
    setTimeTo("");
    setChannel("");
    setAudience("");
    setStatus("");
    setUuidError(null);
    setRangeError(null);
    setApplied({
      appointmentId: "",
      patientQuery: "",
      dateFrom: "",
      dateTo: "",
      timeFrom: "",
      timeTo: "",
      channel: "",
      audience: "",
      status: "",
    });
  }

  const rows: ReminderDelivery[] = query.data ?? [];
  const retriableIds = rows
    .filter((r) => r.send_status === "failed" || r.send_status === "skipped")
    .map((r) => r.id);
  const retriableIdSet = new Set(retriableIds);
  const selectedRetriable = Array.from(selectedIds).filter((id) => retriableIdSet.has(id));
  const allSelected = retriableIds.length > 0 && selectedRetriable.length === retriableIds.length;
  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(retriableIds) : new Set());
  };
  const runBulkRetry = async () => {
    if (selectedRetriable.length === 0) return;
    setBulkRetrying(true);
    try {
      const res = await bulkRetryFn({ data: { ids: selectedRetriable } });
      toast.success(
        `تمت إعادة جدولة ${res.retried.toLocaleString("ar-EG")} تذكير` +
          (res.skipped > 0 ? ` (تم تجاهل ${res.skipped.toLocaleString("ar-EG")})` : ""),
      );
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["reminders-log"] });
    } catch (e) {
      toast.error((e as Error)?.message ?? "تعذّرت إعادة الإرسال الجماعية.");
    } finally {
      setBulkRetrying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              بحث باسم أو جوال المريض
            </label>
            <input
              type="search"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
              placeholder="مثال: أحمد أو 0501234567"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              معرّف الموعد (اختياري)
            </label>
            <input
              type="text"
              value={appointmentIdInput}
              onChange={(e) => setAppointmentIdInput(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              dir="ltr"
            />
            {uuidError && <p className="mt-1 text-xs text-destructive">{uuidError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">من تاريخ</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">إلى تاريخ</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">من وقت</label>
            <input
              type="time"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">إلى وقت</label>
            <input
              type="time"
              value={timeTo}
              onChange={(e) => setTimeTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">القناة</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">الكل</option>
              <option value="in_app">داخل التطبيق</option>
              <option value="web_push">إشعار متصفح</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">واتساب</option>
              <option value="email">بريد</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">المستقبل</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">الكل</option>
              <option value="user">المريض</option>
              <option value="staff">الفريق</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">الحالة</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">الكل</option>
              <option value="pending">قيد الانتظار</option>
              <option value="sent">مُرسل</option>
              <option value="failed">فشل</option>
              <option value="skipped">متجاوز</option>
            </select>
          </div>
        </div>
        {rangeError && <p className="mt-2 text-xs text-destructive">{rangeError}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={apply}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            تطبيق الفلاتر
          </button>
          <button
            onClick={clearAll}
            className="rounded-md border border-input px-4 py-1.5 text-sm hover:bg-muted"
          >
            مسح
          </button>
          <button
            onClick={() => query.refetch()}
            className="rounded-md border border-input px-4 py-1.5 text-sm hover:bg-muted"
          >
            تحديث
          </button>
          <button
            onClick={async () => {
              setExporting(true);
              try {
                const res = await exportFn({
                  data: {
                    appointmentId: applied.appointmentId || undefined,
                    patientQuery: applied.patientQuery || undefined,
                    dateFrom: applied.dateFrom || undefined,
                    dateTo: applied.dateTo || undefined,
                    timeFrom: applied.timeFrom || undefined,
                    timeTo: applied.timeTo || undefined,
                    channel: applied.channel || undefined,
                    audience: applied.audience || undefined,
                    status: applied.status || undefined,
                  },
                });
                const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = res.filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast.success(
                  res.count === 0
                    ? "تم التصدير لكن لا توجد سجلات مطابقة."
                    : `تم تصدير ${res.count.toLocaleString("ar-EG")} سجل.`,
                );
              } catch (e) {
                toast.error((e as Error)?.message ?? "تعذّر التصدير.");
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting}
            className="rounded-md border border-input px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            {exporting ? "جارٍ التصدير…" : "تصدير CSV"}
          </button>
        </div>
      </div>


      {retriableIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-2">
          <div className="text-xs text-muted-foreground">
            {selectedRetriable.length > 0
              ? `تم تحديد ${selectedRetriable.length.toLocaleString("ar-EG")} من ${retriableIds.length.toLocaleString("ar-EG")} تذكير قابل لإعادة الإرسال`
              : `${retriableIds.length.toLocaleString("ar-EG")} تذكير فاشل/متجاوز قابل لإعادة الإرسال في هذه الصفحة`}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toggleAll(!allSelected)}
              className="rounded-md border border-input px-3 py-1 text-xs hover:bg-muted"
            >
              {allSelected ? "إلغاء تحديد الكل" : "تحديد كل الفاشلة"}
            </button>
            <button
              onClick={runBulkRetry}
              disabled={bulkRetrying || selectedRetriable.length === 0}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {bulkRetrying
                ? "جارٍ إعادة الإرسال…"
                : `إعادة إرسال المحدد (${selectedRetriable.length.toLocaleString("ar-EG")})`}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card">
        {query.isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : query.isError ? (
          <p className="p-8 text-center text-sm text-destructive">
            تعذّر تحميل السجل: {(query.error as Error)?.message}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            لا توجد تذكيرات تطابق الفلاتر الحالية.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start w-8">
                    <input
                      type="checkbox"
                      aria-label="تحديد كل التذكيرات الفاشلة"
                      checked={allSelected}
                      disabled={retriableIds.length === 0}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-2 text-start">الحجز</th>
                  <th className="px-3 py-2 text-start">الموعد</th>
                  <th className="px-3 py-2 text-start">نوع التذكير</th>
                  <th className="px-3 py-2 text-start">القناة</th>
                  <th className="px-3 py-2 text-start">المستقبل</th>
                  <th className="px-3 py-2 text-start">الحالة</th>
                  <th className="px-3 py-2 text-start">تاريخ الإنشاء</th>
                  <th className="px-3 py-2 text-start">تاريخ الإرسال</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATUS_LABEL_AR[r.send_status] ?? {
                    label: r.send_status,
                    cls: "bg-muted text-muted-foreground",
                  };
                  const canRetry = retriableIdSet.has(r.id);
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        {canRetry ? (
                          <input
                            type="checkbox"
                            aria-label="تحديد التذكير لإعادة الإرسال"
                            checked={selectedIds.has(r.id)}
                            onChange={(e) => toggleOne(r.id, e.target.checked)}
                          />
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.appointment?.patient_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {r.appointment?.patient_phone ?? ""}
                        </div>
                        {r.appointment_id && (
                          <div
                            className="mt-0.5 font-mono text-[10px] text-muted-foreground"
                            dir="ltr"
                            title={r.appointment_id}
                          >
                            #{r.appointment_id.slice(0, 8).toUpperCase()}
                          </div>
                        )}
                        {r.appointment_id && r.appointment?.patient_phone && (
                          <Link
                            to="/booking-confirmation"
                            search={{
                              ref: r.appointment_id.replace(/-/g, ""),
                              phone: r.appointment.patient_phone,
                            }}
                            className="mt-1 inline-flex text-xs text-primary hover:underline"
                          >
                            عرض تفاصيل الحجز
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" dir="ltr">
                        {r.appointment?.appointment_date ?? "—"}
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {r.appointment?.appointment_time ?? ""}
                        </span>
                      </td>
                      <td className="px-3 py-2">{reminderKindLabel(r.kind)}</td>
                      <td className="px-3 py-2">{CHANNEL_LABEL_AR[r.channel] ?? r.channel}</td>
                      <td className="px-3 py-2">{r.audience === "staff" ? "الفريق" : "المريض"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                        >
                          {st.label}
                        </span>
                        {r.last_error && (
                          <div
                            className="mt-1 max-w-[220px] truncate text-[11px] text-destructive"
                            title={r.last_error}
                          >
                            {r.last_error}
                          </div>
                        )}
                        {(r.send_status === "failed" || r.send_status === "skipped") && (
                          <button
                            onClick={async () => {
                              setRetryingId(r.id);
                              try {
                                await retryFn({ data: { id: r.id } });
                                toast.success("تمت إعادة جدولة التذكير للإرسال.");
                                queryClient.invalidateQueries({ queryKey: ["reminders-log"] });
                              } catch (e) {
                                toast.error((e as Error)?.message ?? "تعذّرت إعادة الإرسال.");
                              } finally {
                                setRetryingId(null);
                              }
                            }}
                            disabled={retryingId === r.id}
                            className="mt-1 rounded-md border border-input px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-60"
                          >
                            {retryingId === r.id ? "…" : "إعادة الإرسال"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {formatAuditDate(r.created_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {r.sent_at ? formatAuditDate(r.sent_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        يعرض آخر 300 تذكير عبر جميع القنوات (داخل التطبيق، إشعارات المتصفح، SMS، إلخ) مع تحديث تلقائي كل دقيقة.
      </p>
    </div>
  );
}

// ============================================================================
// Reminders Delivery Stats Tab (success/failure by channel & day)
// ============================================================================

const CHANNEL_COLORS: Record<string, string> = {
  in_app: "#6366f1",
  web_push: "#0ea5e9",
  sms: "#10b981",
  whatsapp: "#22c55e",
  email: "#f59e0b",
};

type PresetKey = "24h" | "7d" | "30d" | "custom";

const PRESET_HOURS: Record<Exclude<PresetKey, "custom">, number> = {
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
};

const PRESET_LABELS: Record<PresetKey, string> = {
  "24h": "آخر ٢٤ ساعة",
  "7d": "آخر ٧ أيام",
  "30d": "آخر ٣٠ يومًا",
  custom: "مخصص",
};

function toLocalInputValue(d: Date): string {
  // yyyy-MM-ddTHH:mm for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function RemindersDeliveryStatsTab() {
  const navigate = useNavigate({ from: "/admin" });
  const fn = useServerFn(getReminderDeliveryStats);
  const [preset, setPreset] = useState<PresetKey>("30d");
  const now = useMemo(() => new Date(), []);
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toLocalInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
  );
  const [customTo, setCustomTo] = useState<string>(() => toLocalInputValue(now));
  const [validationError, setValidationError] = useState<string | null>(null);

  const [applied, setApplied] = useState<
    { hours: number } | { from: string; to: string }
  >({ hours: PRESET_HOURS["30d"] });

  function applyPreset(k: Exclude<PresetKey, "custom">) {
    setPreset(k);
    setValidationError(null);
    setApplied({ hours: PRESET_HOURS[k] });
  }

  function applyCustom() {
    setValidationError(null);
    if (!customFrom || !customTo) {
      setValidationError("الرجاء تحديد تاريخي البداية والنهاية.");
      return;
    }
    const fromMs = new Date(customFrom).getTime();
    const toMs = new Date(customTo).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      setValidationError("تنسيق التاريخ غير صالح.");
      return;
    }
    if (toMs <= fromMs) {
      setValidationError("يجب أن يسبق تاريخ البداية تاريخ النهاية.");
      return;
    }
    const range = toMs - fromMs;
    if (range < 5 * 60 * 1000) {
      setValidationError("الحد الأدنى للفترة هو ٥ دقائق.");
      return;
    }
    if (range > 366 * 24 * 60 * 60 * 1000) {
      setValidationError("الحد الأقصى للفترة هو سنة واحدة.");
      return;
    }
    if (toMs > Date.now() + 60 * 1000) {
      setValidationError("لا يمكن اختيار تاريخ في المستقبل.");
      return;
    }
    setPreset("custom");
    setApplied({
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
    });
  }

  const { data, isLoading, error, refetch, isFetching } = useQuery<DeliveryStats>({
    queryKey: ["reminders-delivery-stats", applied],
    queryFn: () => fn({ data: applied }),
    refetchInterval: visibilityAwareInterval(90_000, 5 * 60_000),
    placeholderData: (prev) => prev,
  });

  if (isLoading && !data)
    return <div className="text-muted-foreground">جارٍ تحميل الإحصائيات…</div>;
  if (error && !data)
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        تعذّر تحميل الإحصائيات: {(error as Error).message}
      </div>
    );

  const totalAll = data
    ? data.totals.sent + data.totals.failed + data.totals.pending + data.totals.skipped + data.totals.queued
    : 0;
  const attempted = data ? data.totals.sent + data.totals.failed : 0;
  const successRate = attempted > 0 ? Math.round((data!.totals.sent / attempted) * 1000) / 10 : 0;
  const failureRate = attempted > 0 ? Math.round((data!.totals.failed / attempted) * 1000) / 10 : 0;
  

  const rangeLabelAr =
    preset === "custom" && data
      ? `${new Date(data.from).toLocaleString("ar-EG")} — ${new Date(data.to).toLocaleString("ar-EG")}`
      : PRESET_LABELS[preset];

  const rangeYmd = data
    ? { from: toYmd(new Date(data.from)), to: toYmd(new Date(data.to)) }
    : { from: "", to: "" };

  function openLog(params: {
    channel?: string;
    status?: string;
    from?: string;
    to?: string;
  }) {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        tab: "reminders-log",
        logChannel: params.channel ?? "",
        logStatus: params.status ?? "",
        logFrom: params.from ?? rangeYmd.from,
        logTo: params.to ?? rangeYmd.to,
      }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">إحصائيات إرسال التذكيرات</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            معدلات النجاح والفشل حسب القناة والفترة الزمنية.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-input">
            {(["24h", "7d", "30d"] as const).map((k) => (
              <button
                key={k}
                onClick={() => applyPreset(k)}
                className={`px-3 py-1.5 text-sm ${
                  preset === k
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {PRESET_LABELS[k]}
              </button>
            ))}
            <button
              onClick={() => setPreset("custom")}
              className={`px-3 py-1.5 text-sm ${
                preset === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {PRESET_LABELS.custom}
            </button>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            {isFetching ? "…" : "تحديث"}
          </button>
        </div>
      </div>

      {preset === "custom" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                من تاريخ ووقت
              </label>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                max={toLocalInputValue(new Date())}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                إلى تاريخ ووقت
              </label>
              <input
                type="datetime-local"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                max={toLocalInputValue(new Date())}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={applyCustom}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                تطبيق الفترة المخصصة
              </button>
            </div>
          </div>
          {validationError && (
            <p className="mt-2 text-xs text-destructive">{validationError}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            حدود الفترة: ٥ دقائق كحد أدنى، سنة واحدة كحد أقصى. لا يمكن اختيار تواريخ مستقبلية.
          </p>
        </div>
      )}

      {!data ? (
        <div className="text-muted-foreground">جارٍ تحميل الإحصائيات…</div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            الفترة المعروضة: <span className="font-medium">{rangeLabelAr}</span> — التجميع{" "}
            {data.bucket === "hour" ? "بالساعة" : "باليوم"}.
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ClickableStatCard label="إجمالي التذكيرات" value={totalAll} icon={Bell} onClick={() => openLog({})} hint="عرض كل التذكيرات في هذه الفترة" />
            <ClickableStatCard label="مُرسلة بنجاح" value={data.totals.sent} icon={CalendarDays} onClick={() => openLog({ status: "sent" })} hint="عرض التذكيرات المُرسلة" />
            <ClickableStatCard label="فشلت" value={data.totals.failed} icon={ShieldAlert} onClick={() => openLog({ status: "failed" })} hint="عرض التذكيرات الفاشلة" />
            <ClickableStatCard
              label="قيد الانتظار"
              value={data.totals.pending + data.totals.queued}
              icon={Clock}
              onClick={() => openLog({ status: "pending" })}
              hint="عرض التذكيرات المعلّقة"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-4 text-base font-semibold">معدل النجاح الإجمالي</h3>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-emerald-600 tabular-nums">
                  {successRate}%
                </span>
                <span className="text-sm text-muted-foreground">
                  ({data.totals.sent.toLocaleString("ar-EG")} من أصل{" "}
                  {attempted.toLocaleString("ar-EG")} محاولة)
                </span>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, successRate)}%` }}
                />
              </div>
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>معدل الفشل: {failureRate}%</span>
                <span>الإجمالي: {totalAll.toLocaleString("ar-EG")}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-4 text-base font-semibold">توزيع الحالات</h3>
              <div className="space-y-3">
                <button type="button" onClick={() => openLog({ status: "sent" })} className="block w-full rounded text-start hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40" aria-label="عرض المُرسلة في السجل">
                  <StatBar label="مُرسلة" value={data.totals.sent} total={totalAll} tone="emerald" />
                </button>
                <button type="button" onClick={() => openLog({ status: "failed" })} className="block w-full rounded text-start hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40" aria-label="عرض الفاشلة في السجل">
                  <StatBar label="فشلت" value={data.totals.failed} total={totalAll} tone="destructive" />
                </button>
                <button type="button" onClick={() => openLog({ status: "pending" })} className="block w-full rounded text-start hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40" aria-label="عرض المعلّقة في السجل">
                  <StatBar
                    label="قيد الانتظار"
                    value={data.totals.pending + data.totals.queued}
                    total={totalAll}
                    tone="sky"
                  />
                </button>
                <button type="button" onClick={() => openLog({ status: "skipped" })} className="block w-full rounded text-start hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40" aria-label="عرض المتجاوزة في السجل">
                  <StatBar label="متجاوزة" value={data.totals.skipped} total={totalAll} tone="amber" />
                </button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">اضغط على أي شريط للانتقال إلى السجل بنفس الفلاتر.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-base font-semibold">حسب القناة</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-start">القناة</th>
                    <th className="px-2 py-2 text-end">مُرسلة</th>
                    <th className="px-2 py-2 text-end">فشلت</th>
                    <th className="px-2 py-2 text-end">قيد الانتظار</th>
                    <th className="px-2 py-2 text-end">متجاوزة</th>
                    <th className="px-2 py-2 text-end">معدل النجاح</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byChannel.map((c) => {
                    const att = c.sent + c.failed;
                    const rate = att > 0 ? Math.round((c.sent / att) * 1000) / 10 : 0;
                    const total = c.sent + c.failed + c.pending + c.skipped + c.queued;
                    return (
                      <tr
                        key={c.channel}
                        onClick={() => openLog({ channel: c.channel })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openLog({ channel: c.channel });
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title="عرض تذكيرات هذه القناة في السجل"
                        className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
                      >
                        <td className="px-2 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: CHANNEL_COLORS[c.channel] }}
                            />
                            {CHANNEL_LABEL_AR[c.channel] ?? c.channel}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums">
                          {c.sent.toLocaleString("ar-EG")}
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums text-destructive">
                          {c.failed.toLocaleString("ar-EG")}
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums">
                          {(c.pending + c.queued).toLocaleString("ar-EG")}
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums">
                          {c.skipped.toLocaleString("ar-EG")}
                        </td>
                        <td className="px-2 py-2 text-end">
                          {total === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, rate)}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-xs">{rate}%</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">اضغط على أي صف قناة للانتقال إلى السجل مع الفلاتر المطابقة.</p>
          </div>

          <DeliveryTrendChart
            buckets={data.byBucket}
            bucket={data.bucket}
            onBucketClick={(bucketLabel) => {
              // Convert bucket label to a yyyy-MM-dd range
              const day = bucketLabel.slice(0, 10);
              openLog({ from: day, to: day });
            }}
          />
        </>
      )}
    </div>
  );
}

// ============================================================================
// Delivery Trend Chart — hover tooltip + horizontal scroll + success-rate overlay
// ============================================================================

function ClickableStatCard({
  label,
  value,
  icon: Icon,
  onClick,
  hint,
}: {
  label: string;
  value: number;
  icon: any;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ?? "افتح السجل مع هذا الفلتر"}
      className="group rounded-xl border border-border bg-card p-5 text-start transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {value.toLocaleString("ar-EG")}
          </div>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary transition-colors group-hover:bg-primary/20">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        اضغط للانتقال إلى السجل ←
      </div>
    </button>
  );
}

function formatBucketLabel(label: string, bucket: "hour" | "day"): string {
  // label is ISO prefix: "yyyy-MM-dd" (day) or "yyyy-MM-ddTHH" (hour)
  if (bucket === "hour") {
    const d = new Date(label + ":00:00Z");
    if (isNaN(d.getTime())) return label;
    return new Intl.DateTimeFormat("ar-EG", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
    }).format(d);
  }
  const d = new Date(label + "T00:00:00Z");
  if (isNaN(d.getTime())) return label;
  return new Intl.DateTimeFormat("ar-EG", {
    month: "short",
    day: "2-digit",
    weekday: "short",
  }).format(d);
}

function DeliveryTrendChart({
  buckets,
  bucket,
  onBucketClick,
}: {
  buckets: Array<{ label: string; sent: number; failed: number }>;
  bucket: "hour" | "day";
  onBucketClick?: (label: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.sent + b.failed));
  // 4 gridlines at 25/50/75/100%
  const gridSteps = [0.25, 0.5, 0.75, 1];
  const CHART_H = 200;
  const BAR_H = 170;
  const BAR_W = 18;
  const GAP = 4;
  const contentWidth = Math.max(320, buckets.length * (BAR_W + GAP));

  const hovered = hover !== null ? buckets[hover] : null;
  const hoveredTotal = hovered ? hovered.sent + hovered.failed : 0;
  const hoveredRate =
    hovered && hoveredTotal > 0 ? Math.round((hovered.sent / hoveredTotal) * 1000) / 10 : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          الاتجاه الزمني للتذكيرات {bucket === "hour" ? "بالساعة" : "باليوم"}
        </h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> مُرسلة
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-destructive" /> فشلت
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-sky-500" /> معدل النجاح
          </span>
        </div>
      </div>

      <div className="relative overflow-x-auto" dir="ltr">
        {/* Fixed y-axis on the left, chart scrolls horizontally next to it */}
        <div className="flex">
          <div
            className="relative shrink-0 pe-2 text-[10px] text-muted-foreground"
            style={{ height: CHART_H, width: 40 }}
          >
            {gridSteps
              .slice()
              .reverse()
              .map((g) => (
                <div
                  key={g}
                  className="absolute end-2 -translate-y-1/2 tabular-nums"
                  style={{ top: CHART_H - 15 - g * BAR_H }}
                >
                  {Math.round(maxBucket * g)}
                </div>
              ))}
            <div
              className="absolute end-2 -translate-y-1/2 tabular-nums"
              style={{ top: CHART_H - 15 }}
            >
              0
            </div>
          </div>

          <div
            className="relative flex-1"
            style={{ height: CHART_H, minWidth: contentWidth }}
            onMouseLeave={() => setHover(null)}
          >
            {/* Gridlines */}
            {gridSteps.map((g) => (
              <div
                key={g}
                className="absolute inset-x-0 border-t border-dashed border-border/60"
                style={{ top: CHART_H - 15 - g * BAR_H }}
              />
            ))}
            {/* Baseline */}
            <div
              className="absolute inset-x-0 border-t border-border"
              style={{ top: CHART_H - 15 }}
            />

            {/* Bars */}
            <div
              className="absolute inset-x-0 flex items-end"
              style={{ bottom: 15, height: BAR_H, gap: GAP }}
            >
              {buckets.map((b, i) => {
                const total = b.sent + b.failed;
                const totalH = (total / maxBucket) * BAR_H;
                const sentH = (b.sent / maxBucket) * BAR_H;
                const failH = (b.failed / maxBucket) * BAR_H;
                const isHover = hover === i;
                return (
                  <button
                    key={b.label}
                    type="button"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onClick={() => {
                      setHover(i);
                      if (onBucketClick) onBucketClick(b.label);
                    }}
                    className={`group relative flex shrink-0 flex-col items-center justify-end outline-none ${onBucketClick ? "cursor-pointer" : ""}`}
                    style={{ width: BAR_W, height: BAR_H }}
                    title={onBucketClick ? "افتح السجل لهذه الفترة" : undefined}
                    aria-label={`${formatBucketLabel(b.label, bucket)}: مُرسلة ${b.sent}, فشلت ${b.failed}${onBucketClick ? " — اضغط للانتقال إلى السجل" : ""}`}
                  >
                    <div
                      className={`flex w-full flex-col justify-end overflow-hidden rounded-t-sm transition-opacity ${
                        hover !== null && !isHover ? "opacity-60" : "opacity-100"
                      }`}
                      style={{ height: totalH || 1 }}
                    >
                      {b.failed > 0 && (
                        <div className="w-full bg-destructive" style={{ height: failH }} />
                      )}
                      {b.sent > 0 && (
                        <div className="w-full bg-emerald-500" style={{ height: sentH }} />
                      )}
                      {totalH === 0 && (
                        <div className="w-full bg-muted/40" style={{ height: 1 }} />
                      )}
                    </div>
                    {isHover && (
                      <div
                        className="pointer-events-none absolute inset-x-0 -top-1 border-s border-e border-primary/40"
                        style={{ height: BAR_H + 4 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Success-rate line overlay (only where there's data) */}
            <svg
              className="pointer-events-none absolute inset-0"
              width={contentWidth}
              height={CHART_H}
              style={{ overflow: "visible" }}
            >
              <polyline
                fill="none"
                stroke="rgb(14 165 233)"
                strokeWidth={1.5}
                strokeDasharray="3 2"
                points={buckets
                  .map((b, i) => {
                    const total = b.sent + b.failed;
                    if (total === 0) return null;
                    const rate = b.sent / total; // 0..1
                    const x = i * (BAR_W + GAP) + BAR_W / 2;
                    const y = CHART_H - 15 - rate * BAR_H;
                    return `${x},${y}`;
                  })
                  .filter(Boolean)
                  .join(" ")}
              />
            </svg>

            {/* X-axis labels: show first, mid, last to avoid crowding */}
            <div
              className="absolute inset-x-0 flex justify-between text-[10px] text-muted-foreground"
              style={{ bottom: 0 }}
            >
              <span>{formatBucketLabel(buckets[0]?.label ?? "", bucket)}</span>
              {buckets.length > 4 && (
                <span>
                  {formatBucketLabel(
                    buckets[Math.floor(buckets.length / 2)]?.label ?? "",
                    bucket,
                  )}
                </span>
              )}
              <span>
                {formatBucketLabel(buckets[buckets.length - 1]?.label ?? "", bucket)}
              </span>
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {hovered && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
            style={{ insetInlineEnd: 12 }}
            dir="rtl"
          >
            <div className="font-semibold">{formatBucketLabel(hovered.label, bucket)}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
              <span>مُرسلة:</span>
              <span className="tabular-nums font-medium">{hovered.sent.toLocaleString("ar-EG")}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-sm bg-destructive" />
              <span>فشلت:</span>
              <span className="tabular-nums font-medium">{hovered.failed.toLocaleString("ar-EG")}</span>
            </div>
            <div className="mt-1 border-t border-border pt-1">
              <span>الإجمالي: </span>
              <span className="tabular-nums font-medium">{hoveredTotal.toLocaleString("ar-EG")}</span>
              {hoveredTotal > 0 && (
                <>
                  <span className="mx-1">·</span>
                  <span>معدل النجاح: </span>
                  <span className="tabular-nums font-medium text-emerald-600">{hoveredRate}%</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        مرّر أفقيًا لعرض جميع الفترات، ومرّر الفأرة (أو المس) على أي عمود لعرض القيم التفصيلية.{onBucketClick ? " اضغط على أي عمود للانتقال إلى السجل بنفس اليوم." : ""}
      </p>
    </div>
  );
}



// ============================================================================
// Reminders Audit Tab
// ============================================================================


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REMINDER_KIND_LABEL: Record<string, string> = {
  reminder_24h: "قبل 24 ساعة",
  reminder_2h: "قبل ساعتين",
};

const SOURCE_LABEL: Record<string, string> = {
  staff: "موظف",
  self_service: "المريض",
  system: "النظام",
};

const SOURCE_CLASS: Record<string, string> = {
  staff: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  self_service: "bg-muted text-muted-foreground",
  system: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
};

function formatAuditDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function RemindersAuditTab() {
  const listFn = useServerFn(listReminderPreferenceAudit);
  const [appointmentIdInput, setAppointmentIdInput] = useState("");
  const [reminderKind, setReminderKind] = useState<"" | "reminder_24h" | "reminder_2h">("");
  const [source, setSource] = useState<"" | "staff" | "self_service" | "system">("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Applied filters (used in query key). Separate from inputs so typing doesn't fetch.
  const [applied, setApplied] = useState<{
    appointmentId: string;
    reminderKind: "" | "reminder_24h" | "reminder_2h";
    source: "" | "staff" | "self_service" | "system";
  }>({ appointmentId: "", reminderKind: "", source: "" });

  const [uuidError, setUuidError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["reminders-audit", applied, page],
    queryFn: () =>
      listFn({
        data: {
          appointmentId: applied.appointmentId || undefined,
          reminderKind: applied.reminderKind || undefined,
          source: applied.source || undefined,
          page,
          pageSize,
        },
      }),
    placeholderData: (prev) => prev,
  });

  function applyFilters() {
    const trimmed = appointmentIdInput.trim();
    if (trimmed && !UUID_RE.test(trimmed)) {
      setUuidError(
        "الرجاء استخدام معرّف الموعد الكامل (UUID) من صفحة تفاصيل الموعد.",
      );
      return;
    }
    setUuidError(null);
    setApplied({ appointmentId: trimmed, reminderKind, source });
    setPage(1);
  }

  function clearFilters() {
    setAppointmentIdInput("");
    setReminderKind("");
    setSource("");
    setUuidError(null);
    setApplied({ appointmentId: "", reminderKind: "", source: "" });
    setPage(1);
  }

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <ExportRemindersCsvPanel />
      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              معرّف الموعد (UUID كامل)
            </label>
            <input
              type="text"
              value={appointmentIdInput}
              onChange={(e) => setAppointmentIdInput(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              dir="ltr"
            />
            {uuidError && (
              <p className="mt-1 text-xs text-destructive">{uuidError}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              نوع التذكير
            </label>
            <select
              value={reminderKind}
              onChange={(e) => setReminderKind(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">الكل</option>
              <option value="reminder_24h">قبل 24 ساعة</option>
              <option value="reminder_2h">قبل ساعتين</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              المصدر
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as any)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">الكل</option>
              <option value="staff">موظف</option>
              <option value="self_service">المريض</option>
              <option value="system">النظام</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={applyFilters}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            تطبيق
          </button>
          <button
            onClick={clearFilters}
            className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
          >
            مسح
          </button>
        </div>
      </div>

      {/* Results */}
      {query.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          جارٍ التحميل…
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {(query.error as Error)?.message ?? "تعذّر تحميل السجلات."}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          لا توجد سجلات مطابقة للمعايير.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-right">التاريخ</th>
                <th className="px-3 py-2 text-right">الموعد</th>
                <th className="px-3 py-2 text-right">نوع التذكير</th>
                <th className="px-3 py-2 text-right">من → إلى</th>
                <th className="px-3 py-2 text-right">المصدر</th>
                <th className="px-3 py-2 text-right">بواسطة</th>
                <th className="px-3 py-2 text-right">السبب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r: any) => {
                const ref = String(r.appointment_id).replace(/-/g, "").slice(0, 8);
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatAuditDate(r.changed_at)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(r.appointment_id);
                          toast.success("تم نسخ معرّف الموعد");
                        }}
                        className="font-mono text-xs text-primary hover:underline"
                        title={r.appointment_id}
                        dir="ltr"
                      >
                        {ref}…
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {REMINDER_KIND_LABEL[r.reminder_kind] ?? r.reminder_kind}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          r.old_value
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        }
                      >
                        {r.old_value ? "✓" : "✗"}
                      </span>
                      <span className="mx-2 text-muted-foreground">←</span>
                      <span
                        className={
                          r.new_value
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                        }
                      >
                        {r.new_value ? "✓" : "✗"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          SOURCE_CLASS[r.source] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {SOURCE_LABEL[r.source] ?? r.source}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.changed_by_name || "—"}
                    </td>
                    <td className="max-w-xs px-3 py-2 text-muted-foreground">
                      <span className="line-clamp-2" title={r.reason ?? ""}>
                        {r.reason || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <div className="text-muted-foreground">
            صفحة {page} من {totalPages} — الإجمالي {total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || query.isFetching}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              السابق
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || query.isFetching}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Reminders Stats Tab ---------------- */

function StatBar({ label, value, total, tone = "primary" }: { label: string; value: number; total: number; tone?: "primary" | "emerald" | "amber" | "destructive" | "sky" }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 1000) / 10) : 0;
  const bar = {
    primary: "bg-primary",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    destructive: "bg-destructive",
    sky: "bg-sky-500",
  }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums text-foreground">
          {value.toLocaleString("ar-EG")} <span className="text-xs text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RemindersStatsTab() {
  const fn = useServerFn(getReminderPreferenceStats);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["reminder-preference-stats"],
    queryFn: () => fn(),
  });

  if (isLoading) return <div className="text-muted-foreground">جارٍ تحميل الإحصائيات…</div>;
  if (error) return <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">تعذّر تحميل الإحصائيات.</div>;
  if (!data) return null;

  const total = data.appointmentsTotal;
  const auditTotal = data.auditTotal;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">إحصائيات تفضيلات التذكير</h2>
          <p className="mt-1 text-sm text-muted-foreground">توزيع الحجوزات حسب نوع التذكير المُفعّل، ومطابقتها مع سجل التدقيق.</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
        >
          {isFetching ? "…" : "تحديث"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي الحجوزات" value={total} icon={CalendarDays} />
        <StatCard label="إجمالي سجل التدقيق" value={auditTotal} icon={History} />
        <StatCard label="حجوزات لديها تدقيق" value={data.appointmentsWithAudit} icon={Bell} />
        <StatCard label="تغييرات آخر 7 أيام" value={data.auditLast7d} icon={Clock} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-base font-semibold">توزيع الحجوزات حسب التفضيل</h3>
          <div className="space-y-4">
            <StatBar label="تذكير قبل 24 ساعة مُفعّل" value={data.reminder24Enabled} total={total} tone="primary" />
            <StatBar label="تذكير قبل ساعتين مُفعّل" value={data.reminder2Enabled} total={total} tone="sky" />
            <StatBar label="الاثنان مُفعّلان" value={data.bothEnabled} total={total} tone="emerald" />
            <StatBar label="الاثنان مُعطّلان" value={data.bothDisabled} total={total} tone="destructive" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-base font-semibold">توزيع سجل التدقيق</h3>
          <div className="space-y-4">
            <StatBar label="حسب النوع: 24 ساعة" value={data.audit24} total={auditTotal} tone="primary" />
            <StatBar label="حسب النوع: ساعتان" value={data.audit2} total={auditTotal} tone="sky" />
            <StatBar label="من المراجع (خدمة ذاتية)" value={data.auditSelfService} total={auditTotal} tone="emerald" />
            <StatBar label="من الموظفين" value={data.auditStaff} total={auditTotal} tone="amber" />
            <StatBar label="من النظام" value={data.auditSystem} total={auditTotal} tone="destructive" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-semibold">نسبة التطابق مع سجل التدقيق</h3>
          <span className="text-3xl font-bold text-primary tabular-nums">{data.coveragePct}%</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          نسبة الحجوزات التي لديها تغيير واحد على الأقل في تفضيلات التذكير مقارنةً بإجمالي الحجوزات.
        </p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, data.coveragePct)}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span>{data.appointmentsWithAudit.toLocaleString("ar-EG")} حجز بتغييرات</span>
          <span>من أصل {total.toLocaleString("ar-EG")}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Export Reminder Preferences CSV ---------------- */

function ExportRemindersCsvPanel() {
  const exportFn = useServerFn(exportReminderPreferenceAuditCsv);
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (!ref.trim() && !phone.trim()) {
      toast.error("الرجاء تحديد ref أو رقم الهاتف على الأقل.");
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast.error("تاريخ البداية يجب أن يسبق تاريخ النهاية.");
      return;
    }
    setBusy(true);
    try {
      const res = await exportFn({
        data: {
          ref: ref.trim() || undefined,
          phone: phone.trim() || undefined,
          from: fromDate ? new Date(fromDate + "T00:00:00").toISOString() : undefined,
          to: toDate ? new Date(toDate + "T23:59:59.999").toISOString() : undefined,
        },
      });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (res.count === 0) {
        toast.info("تم التصدير لكن لا توجد سجلات مطابقة.");
      } else {
        toast.success(`تم تصدير ${res.count.toLocaleString("ar-EG")} سجل.`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التصدير.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Download className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">تصدير CSV لتفضيلات التذكير</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            ref (أوّل أحرف معرّف الموعد)
          </label>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="مثلاً a3f19c2b"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            رقم الهاتف
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05xxxxxxxx"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            من تاريخ
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            إلى تاريخ
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          حدّد ref أو الهاتف (أو كليهما) وفترة زمنية اختيارية. الحد الأقصى 5000 سجل.
        </p>
        <button
          onClick={handleExport}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {busy ? "جارٍ التصدير…" : "تصدير CSV"}
        </button>
      </div>
    </div>
  );
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportSecurityAuditCsv(
  items: any[],
  filters: { ref: string; phone: string; action: string; from: string; to: string; limit: number },
) {
  const headers = [
    "created_at",
    "action",
    "appointment_id",
    "patient_name",
    "patient_phone",
    "from_status",
    "to_status",
    "actor_id",
    "actor_name",
    "reason",
  ];
  const lines = [headers.join(",")];
  for (const it of items) {
    lines.push(
      [
        it.created_at ?? "",
        it.action ?? "",
        it.appointment_id ?? "",
        it.patient_name ?? "",
        it.patient_phone ?? "",
        it.from_status ?? "",
        it.to_status ?? "",
        it.actor ?? "",
        it.actor_name ?? "",
        it.reason ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  // Prepend a UTF-8 BOM so Excel opens Arabic text correctly.
  const csv = "\uFEFF" + lines.join("\r\n");

  const parts: string[] = [];
  if (filters.ref) parts.push(`ref-${filters.ref}`);
  if (filters.phone) parts.push(`phone-${filters.phone.replace(/\D/g, "")}`);
  if (filters.action) parts.push(`action-${filters.action}`);
  if (filters.from) parts.push(`from-${filters.from}`);
  if (filters.to) parts.push(`to-${filters.to}`);
  const suffix = parts.length ? `_${parts.join("_")}` : "";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `security-audit_${stamp}${suffix}.csv`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SecurityAuditTab() {
  const listFn = useServerFn(listSecurityAuditLog);
  const actionsFn = useServerFn(listSecurityAuditActions);

  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(100);
  const [applied, setApplied] = useState({
    ref: "",
    phone: "",
    action: "",
    from: "",
    to: "",
    limit: 100,
  });

  const actionsQuery = useQuery({
    queryKey: ["security-audit", "actions"],
    queryFn: () => actionsFn(),
  });

  const listQuery = useQuery({
    queryKey: ["security-audit", "list", applied],
    queryFn: () =>
      listFn({
        data: {
          ref: applied.ref || undefined,
          phone: applied.phone || undefined,
          action: applied.action || undefined,
          from: applied.from ? new Date(applied.from).toISOString() : undefined,
          to: applied.to ? new Date(applied.to + "T23:59:59").toISOString() : undefined,
          limit: applied.limit,
        },
      }),
  });

  const items = listQuery.data?.items ?? [];

  function apply() {
    setApplied({ ref: ref.trim(), phone: phone.trim(), action, from, to, limit });
  }

  function reset() {
    setRef("");
    setPhone("");
    setAction("");
    setFrom("");
    setTo("");
    setLimit(100);
    setApplied({ ref: "", phone: "", action: "", from: "", to: "", limit: 100 });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">تصفية سجل الأمان</div>
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="رقم مرجعي (جزء من UUID)"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="رقم الهاتف"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
          />
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
          >
            <option value="">كل الإجراءات</option>
            {(actionsQuery.data?.actions ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            من
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            إلى
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            الحد الأقصى
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-3 flex items-end gap-2">
            <button
              onClick={apply}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Search className="h-4 w-4" /> بحث
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
            >
              مسح الفلاتر
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="text-sm font-semibold">
            النتائج
            {!listQuery.isLoading && (
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => exportSecurityAuditCsv(items, applied)}
            disabled={listQuery.isLoading || items.length === 0}
            title={items.length === 0 ? "لا توجد نتائج للتصدير" : "تصدير النتائج الحالية إلى CSV"}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            تصدير CSV
          </button>
        </div>
        {listQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
        ) : listQuery.error ? (
          <div className="p-8 text-center text-sm text-red-600">
            {(listQuery.error as Error).message}
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            لا توجد نتائج مطابقة للفلاتر.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">التاريخ</th>
                  <th className="px-3 py-2 text-start">الإجراء</th>
                  <th className="px-3 py-2 text-start">المريض</th>
                  <th className="px-3 py-2 text-start">الهاتف</th>
                  <th className="px-3 py-2 text-start">الحالة</th>
                  <th className="px-3 py-2 text-start">المُنفّذ</th>
                  <th className="px-3 py-2 text-start">السبب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((it: any) => (
                  <tr key={it.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(it.created_at).toLocaleString("ar-EG")}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {it.action}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{it.patient_name ?? "—"}</div>
                      {it.appointment_id && (
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {String(it.appointment_id).slice(0, 8)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{it.patient_phone ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {it.from_status || it.to_status ? (
                        <span>
                          {it.from_status ?? "—"}
                          <span className="mx-1 text-muted-foreground">→</span>
                          <span className="font-medium">{it.to_status ?? "—"}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{it.actor_name ?? (it.actor ? String(it.actor).slice(0, 8) : "—")}</td>
                    <td className="px-3 py-2 text-xs max-w-[240px]">
                      <div className="truncate" title={it.reason ?? ""}>
                        {it.reason ?? "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Content Tab (FAQs / About / Specialties) ---------------- */

type ContentSub = "faqs" | "about" | "specialties";

function ContentTab() {
  const [sub, setSub] = useState<ContentSub>("faqs");
  const subs: { id: ContentSub; label: string; icon: any }[] = [
    { id: "faqs", label: "الأسئلة الشائعة", icon: HelpCircle },
    { id: "about", label: "من نحن", icon: Info },
    { id: "specialties", label: "التخصصات", icon: Tag },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {subs.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              sub === s.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </button>
        ))}
      </div>
      {sub === "faqs" && <FaqsTab />}
      {sub === "about" && <AboutSectionsTab />}
      {sub === "specialties" && <SpecialtiesTab />}
    </div>
  );
}

/* ---------------- FAQs Tab ---------------- */

type FaqForm = {
  id?: string;
  question_ar: string;
  answer_ar: string;
  question_en: string;
  answer_en: string;
  is_active: boolean;
  sort_order: number;
};

const emptyFaq: FaqForm = {
  question_ar: "",
  answer_ar: "",
  question_en: "",
  answer_en: "",
  is_active: true,
  sort_order: 0,
};

function FaqsTab() {
  const listFn = useServerFn(listFaqsAdmin);
  const createFn = useServerFn(createFaq);
  const updateFn = useServerFn(updateFaq);
  const deleteFn = useServerFn(deleteFaq);

  const q = useQuery({ queryKey: ["admin-faqs"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<FaqForm | null>(null);

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("تم الحذف"); q.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });
  const saveM = useMutation({
    mutationFn: async (f: FaqForm) => {
      const payload = {
        question_ar: f.question_ar.trim(),
        answer_ar: f.answer_ar.trim(),
        question_en: f.question_en.trim() || null,
        answer_en: f.answer_en.trim() || null,
        is_active: f.is_active,
        sort_order: Number(f.sort_order) || 0,
      };
      if (f.id) return updateFn({ data: { id: f.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => { toast.success("تم الحفظ"); setEditing(null); q.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ ...emptyFaq })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> إضافة سؤال
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">السؤال</th>
              <th className="px-4 py-3">الترتيب</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">لا توجد أسئلة</td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.question_ar}</div>
                  {r.question_en && (
                    <div className="text-xs text-muted-foreground" dir="ltr">{r.question_en}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs" dir="ltr">{r.sort_order}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {r.is_active ? "نشط" : "متوقف"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing({
                        id: r.id,
                        question_ar: r.question_ar ?? "",
                        answer_ar: r.answer_ar ?? "",
                        question_en: r.question_en ?? "",
                        answer_en: r.answer_en ?? "",
                        is_active: !!r.is_active,
                        sort_order: r.sort_order ?? 0,
                      })}
                      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </button>
                    <button
                      onClick={() => { if (confirm(`حذف السؤال "${r.question_ar}"؟`)) deleteM.mutate(r.id); }}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <FaqFormModal
          value={editing}
          saving={saveM.isPending}
          onCancel={() => setEditing(null)}
          onSave={(v) => saveM.mutate(v)}
        />
      )}
    </div>
  );
}

function FaqFormModal({
  value, saving, onCancel, onSave,
}: {
  value: FaqForm;
  saving: boolean;
  onCancel: () => void;
  onSave: (v: FaqForm) => void;
}) {
  const [form, setForm] = useState<FaqForm>(value);
  const set = <K extends keyof FaqForm>(k: K, v: FaqForm[K]) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">{form.id ? "تعديل سؤال" : "إضافة سؤال"}</h2>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted"><XIcon className="h-4 w-4" /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.question_ar.trim() || !form.answer_ar.trim()) {
              toast.error("السؤال والجواب بالعربية مطلوبان");
              return;
            }
            if (form.question_ar.length > 500 || form.answer_ar.length > 4000) {
              toast.error("النص أطول من الحد المسموح");
              return;
            }
            onSave(form);
          }}
          className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2"
        >
          <Field label="السؤال (عربي) *" full>
            <input required value={form.question_ar} onChange={(e) => set("question_ar", e.target.value)} className={inputCls} maxLength={500} />
          </Field>
          <Field label="الجواب (عربي) *" full>
            <textarea required value={form.answer_ar} onChange={(e) => set("answer_ar", e.target.value)} className={inputCls} rows={4} maxLength={4000} />
          </Field>
          <Field label="Question (English)" full>
            <input dir="ltr" value={form.question_en} onChange={(e) => set("question_en", e.target.value)} className={inputCls} maxLength={500} />
          </Field>
          <Field label="Answer (English)" full>
            <textarea dir="ltr" value={form.answer_en} onChange={(e) => set("answer_en", e.target.value)} className={inputCls} rows={4} maxLength={4000} />
          </Field>
          <Field label="الترتيب">
            <input type="number" value={form.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="الحالة">
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              نشط
            </label>
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onCancel} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">إلغاء</button>
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- About Sections Tab ---------------- */

type AboutForm = {
  id?: string;
  section_key: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  is_active: boolean;
  sort_order: number;
};

const emptyAbout: AboutForm = {
  section_key: "",
  title_ar: "",
  title_en: "",
  body_ar: "",
  body_en: "",
  is_active: true,
  sort_order: 0,
};

function AboutSectionsTab() {
  const listFn = useServerFn(listAboutSectionsAdmin);
  const createFn = useServerFn(createAboutSection);
  const updateFn = useServerFn(updateAboutSection);
  const deleteFn = useServerFn(deleteAboutSection);

  const q = useQuery({ queryKey: ["admin-about"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<AboutForm | null>(null);

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("تم الحذف"); q.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحذف"),
  });
  const saveM = useMutation({
    mutationFn: async (f: AboutForm) => {
      const payload = {
        section_key: f.section_key.trim(),
        title_ar: f.title_ar.trim() || null,
        title_en: f.title_en.trim() || null,
        body_ar: f.body_ar.trim() || null,
        body_en: f.body_en.trim() || null,
        is_active: f.is_active,
        sort_order: Number(f.sort_order) || 0,
      };
      if (f.id) return updateFn({ data: { id: f.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => { toast.success("تم الحفظ"); setEditing(null); q.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  if (q.isLoading) return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ ...emptyAbout })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> إضافة قسم
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">القسم</th>
              <th className="px-4 py-3">المفتاح</th>
              <th className="px-4 py-3">الترتيب</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">لا توجد أقسام</td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.title_ar ?? r.section_key}</div>
                  {r.title_en && (
                    <div className="text-xs text-muted-foreground" dir="ltr">{r.title_en}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs" dir="ltr">{r.section_key}</td>
                <td className="px-4 py-3 text-xs" dir="ltr">{r.sort_order}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {r.is_active ? "نشط" : "متوقف"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing({
                        id: r.id,
                        section_key: r.section_key ?? "",
                        title_ar: r.title_ar ?? "",
                        title_en: r.title_en ?? "",
                        body_ar: r.body_ar ?? "",
                        body_en: r.body_en ?? "",
                        is_active: !!r.is_active,
                        sort_order: r.sort_order ?? 0,
                      })}
                      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </button>
                    <button
                      onClick={() => { if (confirm(`حذف قسم "${r.title_ar ?? r.section_key}"؟`)) deleteM.mutate(r.id); }}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <AboutFormModal
          value={editing}
          saving={saveM.isPending}
          onCancel={() => setEditing(null)}
          onSave={(v) => saveM.mutate(v)}
        />
      )}
    </div>
  );
}

function AboutFormModal({
  value, saving, onCancel, onSave,
}: {
  value: AboutForm;
  saving: boolean;
  onCancel: () => void;
  onSave: (v: AboutForm) => void;
}) {
  const [form, setForm] = useState<AboutForm>(value);
  const set = <K extends keyof AboutForm>(k: K, v: AboutForm[K]) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold">{form.id ? "تعديل قسم" : "إضافة قسم"}</h2>
          <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted"><XIcon className="h-4 w-4" /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.section_key.trim()) {
              toast.error("مفتاح القسم مطلوب");
              return;
            }
            if (!/^[a-z0-9_-]+$/i.test(form.section_key.trim())) {
              toast.error("المفتاح: أحرف/أرقام/شرطة/شرطة سفلية فقط");
              return;
            }
            onSave(form);
          }}
          className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2"
        >
          <Field label="مفتاح القسم *">
            <input required dir="ltr" value={form.section_key} onChange={(e) => set("section_key", e.target.value)} className={inputCls} placeholder="mission" maxLength={100} />
          </Field>
          <Field label="الترتيب">
            <input type="number" value={form.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="العنوان (عربي)">
            <input value={form.title_ar} onChange={(e) => set("title_ar", e.target.value)} className={inputCls} maxLength={300} />
          </Field>
          <Field label="Title (English)">
            <input dir="ltr" value={form.title_en} onChange={(e) => set("title_en", e.target.value)} className={inputCls} maxLength={300} />
          </Field>
          <Field label="النص (عربي)" full>
            <textarea value={form.body_ar} onChange={(e) => set("body_ar", e.target.value)} className={inputCls} rows={6} maxLength={8000} />
          </Field>
          <Field label="Body (English)" full>
            <textarea dir="ltr" value={form.body_en} onChange={(e) => set("body_en", e.target.value)} className={inputCls} rows={6} maxLength={8000} />
          </Field>
          <Field label="الحالة" full>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              نشط
            </label>
          </Field>
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onCancel} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">إلغاء</button>
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
