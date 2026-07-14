import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  Plus,
  Search,
  History,
  Pill,
  FlaskConical,
  Scan,
  Receipt,
  Download,
  Loader2,
} from "lucide-react";
import { WEEKDAYS_AR } from "@/lib/site";
import { downloadIcs, whatsappShareUrl, type ShareBooking } from "@/lib/booking-share";
import { toast } from "sonner";
import { ReminderHistoryForMyAppointmentModal } from "@/components/ReminderPreferenceHistory";
import {
  getFriendlyDownloadError,
  DOWNLOAD_ERROR_MESSAGES,
  shouldPerformHeadCheck,
  recordDownloadSuccess,
  recordDownloadFailure,
  INITIAL_HEAD_CHECK_STATE,
  SIGNED_URL_TTL_SECONDS,
  formatSignedUrlValidity,
  formatCountdown,
  type HeadCheckState,
  type DownloadBucket,
} from "@/lib/download-error";
import { logDownloadError } from "@/lib/download-error.functions";

/**
 * Fire-and-forget: log download failures both to the browser console and to
 * the server. Never throws — logging must not block the retry UI.
 */
function reportDownloadError(report: {
  bucket: DownloadBucket;
  path: string;
  stage: "sign" | "head" | "download" | "unexpected";
  message?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  headCheckSkipped?: boolean;
  attempt?: number;
}) {
  const clientTimestamp = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.error("[download-error]", { ...report, clientTimestamp });
  void logDownloadError({ data: { ...report, clientTimestamp } }).catch(() => {
    /* swallow — logging must never break the download UI */
  });
}

/**
 * Per-bucket adaptive HEAD-check state, shared across DownloadFileButton
 * instances in the same tab session. Once a bucket proves healthy we skip
 * the HEAD round-trip until the next failure.
 */
const headCheckStateByBucket = new Map<DownloadBucket, HeadCheckState>();
function getHeadCheckState(bucket: DownloadBucket): HeadCheckState {
  return headCheckStateByBucket.get(bucket) ?? INITIAL_HEAD_CHECK_STATE;
}

export const Route = createFileRoute("/_authenticated/my")({
  component: MyPortal,
});

type Appt = {
  id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  reason: string | null;
  notes: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  doctor_name_ar: string | null;
  doctor_name_en: string | null;
  created_at: string;
};

type Prescription = {
  id: string;
  medication: string;
  dosage: string | null;
  instructions: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  refills_remaining: number;
  notes: string | null;
};

type LabReport = {
  id: string;
  title: string;
  test_type: string | null;
  report_date: string;
  file_path: string | null;
  summary: string | null;
  status: string;
  released_at: string | null;
};

type RadReport = {
  id: string;
  modality: string;
  body_part: string | null;
  report_date: string;
  findings: string | null;
  file_path: string | null;
  status: string;
  released_at: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  total: number;
  currency: string;
  status: string;
  issued_at: string;
  paid_at: string | null;
  pdf_path: string | null;
};

type TabKey = "appointments" | "prescriptions" | "labs" | "radiology" | "invoices";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "appointments", label: "المواعيد", icon: <Calendar className="h-4 w-4" /> },
  { key: "prescriptions", label: "الوصفات", icon: <Pill className="h-4 w-4" /> },
  { key: "labs", label: "المختبر", icon: <FlaskConical className="h-4 w-4" /> },
  { key: "radiology", label: "الأشعة", icon: <Scan className="h-4 w-4" /> },
  { key: "invoices", label: "الفواتير", icon: <Receipt className="h-4 w-4" /> },
];

function MyPortal() {
  const [tab, setTab] = useState<TabKey>("appointments");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", u.user.id)
        .maybeSingle();
      setProfilePhone(prof?.phone ?? null);
      const { data: p } = await supabase
        .from("patients")
        .select("id")
        .eq("profile_id", u.user.id)
        .limit(1)
        .maybeSingle();
      setPatientId(p?.id ?? null);
    })();
  }, []);

  return (
    <div className="container-app py-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">بوابة المريض</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              كل ما تحتاجه في مكان واحد — مواعيد، وصفات، تقارير، فواتير.
            </p>
          </div>
          <Link
            to="/book"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> حجز جديد
          </Link>
        </header>

        <nav
          role="tablist"
          aria-label="أقسام بوابة المريض"
          className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition ${
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div role="tabpanel">
          {tab === "appointments" && (
            <AppointmentsTab profilePhone={profilePhone} onPhoneUpdated={setProfilePhone} />
          )}
          {tab === "prescriptions" && <PrescriptionsTab patientId={patientId} />}
          {tab === "labs" && <LabsTab patientId={patientId} />}
          {tab === "radiology" && <RadiologyTab patientId={patientId} />}
          {tab === "invoices" && <InvoicesTab patientId={patientId} />}
        </div>
      </div>
    </div>
  );
}

// ============ Appointments (legacy content, preserved) ============

function AppointmentsTab({
  profilePhone,
  onPhoneUpdated,
}: {
  profilePhone: string | null;
  onPhoneUpdated: (v: string | null) => void;
}) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Appt[] | null>(null);
  const [subtab, setSubtab] = useState<"upcoming" | "past">("upcoming");
  const [phoneInput, setPhoneInput] = useState(profilePhone ?? "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [reminderHistoryId, setReminderHistoryId] = useState<string | null>(null);

  useEffect(() => setPhoneInput(profilePhone ?? ""), [profilePhone]);

  const load = async () => {
    const { data, error } = await supabase.rpc("my_appointments");
    if (error) return toast.error(error.message);
    setRows((data as Appt[]) ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const savePhone = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setSavingPhone(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: u.user.id, phone: phoneInput.trim() });
    setSavingPhone(false);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    onPhoneUpdated(phoneInput.trim() || null);
    load();
  };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (rows ?? []).filter(
    (r) => r.appointment_date >= today && r.status !== "cancelled" && r.status !== "completed",
  );
  const past = (rows ?? []).filter(
    (r) => r.appointment_date < today || r.status === "cancelled" || r.status === "completed",
  );
  const list = subtab === "upcoming" ? upcoming : past;

  return (
    <div>
      <div
        className={`mb-6 rounded-2xl border p-5 ${
          profilePhone ? "border-border bg-card" : "border-amber-500/40 bg-amber-500/5"
        }`}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">ربط رقم الجوال</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {profilePhone
                ? `الرقم الحالي: ${profilePhone} — يمكنك تعديله لربط حجوزات مسجّلة برقم آخر.`
                : t("update_phone_hint")}
            </p>
          </div>
          {profilePhone && (
            <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
              مربوط
            </span>
          )}
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            inputMode="tel"
            placeholder="05xxxxxxxx"
            className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={savePhone}
            disabled={
              savingPhone ||
              phoneInput.trim().length < 6 ||
              phoneInput.trim() === (profilePhone ?? "")
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {savingPhone ? t("loading") : profilePhone ? "تحديث الرقم" : "ربط الرقم"}
          </button>
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-1">
        {(["upcoming", "past"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSubtab(k)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition ${subtab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t(k)}
          </button>
        ))}
      </div>

      {rows === null ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <EmptyBlock
          icon={<Calendar className="h-6 w-6" />}
          text={t("no_appointments")}
          action={
            <div className="mt-4 flex justify-center gap-2 flex-wrap">
              <Link to="/book" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Plus className="h-4 w-4" /> {t("cta_book")}
              </Link>
              <Link to="/lookup" className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
                <Search className="h-4 w-4" /> {t("track_booking")}
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3">
          {list.map((r) => {
            const doctor = lang === "ar" ? r.doctor_name_ar : r.doctor_name_en;
            const specialty = lang === "ar" ? r.specialty_name_ar : r.specialty_name_en;
            const share: ShareBooking = {
              ref: r.id.slice(0, 8).toUpperCase(),
              patient_name: r.patient_name,
              patient_phone: r.patient_phone,
              appointment_date: r.appointment_date,
              appointment_time: r.appointment_time,
              doctor: doctor ?? undefined,
              specialty: specialty ?? undefined,
            };
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusChip status={r.status} label={t(statusKey(r.status))} />
                      <span className="font-mono text-xs text-muted-foreground">{share.ref}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      {specialty && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Stethoscope className="h-3.5 w-3.5" /> {specialty}
                        </div>
                      )}
                      {doctor && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="h-3.5 w-3.5" /> {doctor}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span className="font-medium">
                          {r.appointment_date} ({WEEKDAYS_AR[new Date(r.appointment_date).getDay()]})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span className="font-medium">{r.appointment_time.slice(0, 5)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {subtab === "upcoming" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => downloadIcs(share)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      <Calendar className="h-3.5 w-3.5" /> {t("add_to_calendar")}
                    </button>
                    <a
                      href={whatsappShareUrl(share)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      {t("share_whatsapp")}
                    </a>
                    <button
                      onClick={() => setReminderHistoryId(r.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      <History className="h-3.5 w-3.5" /> سجل التذكيرات
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {reminderHistoryId && (
        <ReminderHistoryForMyAppointmentModal
          appointmentId={reminderHistoryId}
          onClose={() => setReminderHistoryId(null)}
        />
      )}
    </div>
  );
}

// ============ Prescriptions ============

function PrescriptionsTab({ patientId }: { patientId: string | null }) {
  const [rows, setRows] = useState<Prescription[] | null>(null);
  useEffect(() => {
    if (!patientId) {
      setRows([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("prescriptions")
        .select("id, medication, dosage, instructions, start_date, end_date, status, refills_remaining, notes")
        .eq("patient_id", patientId)
        .order("start_date", { ascending: false, nullsFirst: false });
      if (error) return toast.error(error.message);
      setRows((data as Prescription[]) ?? []);
    })();
  }, [patientId]);

  if (!patientId && rows !== null && rows.length === 0)
    return <NoPatientLinked kind="prescriptions" />;
  if (rows === null) return <LoadingBlock />;
  if (rows.length === 0)
    return <EmptyBlock icon={<Pill className="h-6 w-6" />} text="لا توجد وصفات نشطة حاليًا." />;

  return (
    <div className="grid gap-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusChip status={r.status} label={statusLabel(r.status)} />
                {r.refills_remaining > 0 && (
                  <span className="rounded-full bg-teal-500/10 text-teal-700 border border-teal-500/30 px-2 py-0.5 text-[11px]">
                    متبقّي {r.refills_remaining} صرف
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-base font-bold">{r.medication}</h3>
              {r.dosage && <p className="text-sm text-muted-foreground">الجرعة: {r.dosage}</p>}
              {r.instructions && (
                <p className="mt-1 text-sm text-foreground/80">{r.instructions}</p>
              )}
              {(r.start_date || r.end_date) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.start_date && `من ${r.start_date}`}
                  {r.end_date && ` إلى ${r.end_date}`}
                </p>
              )}
            </div>
            <Link
              to="/pharmacy"
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-semibold hover:bg-muted whitespace-nowrap"
            >
              طلب إعادة صرف
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ Reports controls (shared) ============

type SortKey = "released_at" | "report_date";
type RangeKey = "all" | "30" | "90";

function ReportsControls({
  sort,
  setSort,
  range,
  setRange,
  total,
  shown,
}: {
  sort: SortKey;
  setSort: (v: SortKey) => void;
  range: RangeKey;
  setRange: (v: RangeKey) => void;
  total: number;
  shown: number;
}) {
  const btn = (active: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs transition-colors ${
      active
        ? "border-primary bg-primary/10 text-primary font-semibold"
        : "border-border bg-background text-muted-foreground hover:text-foreground"
    }`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/50 p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">الفرز:</span>
        <button type="button" className={btn(sort === "released_at")} onClick={() => setSort("released_at")}>
          تاريخ الإفراج
        </button>
        <button type="button" className={btn(sort === "report_date")} onClick={() => setSort("report_date")}>
          تاريخ التقرير
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">النطاق:</span>
        <button type="button" className={btn(range === "30")} onClick={() => setRange("30")}>
          آخر 30 يوم
        </button>
        <button type="button" className={btn(range === "90")} onClick={() => setRange("90")}>
          آخر 90 يوم
        </button>
        <button type="button" className={btn(range === "all")} onClick={() => setRange("all")}>
          الكل
        </button>
      </div>
      <span className="text-xs text-muted-foreground">
        عرض {shown} من {total}
      </span>
    </div>
  );
}

function applyReportFilters<T extends { released_at: string | null; report_date: string }>(
  rows: T[],
  sort: SortKey,
  range: RangeKey,
): T[] {
  const cutoffMs =
    range === "all" ? null : Date.now() - Number(range) * 24 * 60 * 60 * 1000;
  const filtered = rows.filter((r) => {
    if (cutoffMs === null) return true;
    const t = r.released_at ? Date.parse(r.released_at) : NaN;
    return Number.isFinite(t) && t >= cutoffMs;
  });
  const getKey = (r: T) =>
    sort === "released_at" ? (r.released_at ?? "") : (r.report_date ?? "");
  return [...filtered].sort((a, b) => (getKey(a) < getKey(b) ? 1 : -1));
}

// ============ Labs ============

function LabsTab({ patientId }: { patientId: string | null }) {
  const [rows, setRows] = useState<LabReport[] | null>(null);
  const [sort, setSort] = useState<SortKey>("released_at");
  const [range, setRange] = useState<RangeKey>("all");
  useEffect(() => {
    if (!patientId) {
      setRows([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("lab_reports")
        .select("id, title, test_type, report_date, file_path, summary, status, released_at")
        .eq("patient_id", patientId)
        .not("released_at", "is", null)
        .order("released_at", { ascending: false });
      if (error) return toast.error(error.message);
      setRows((data as LabReport[]) ?? []);
    })();
  }, [patientId]);

  if (!patientId && rows !== null && rows.length === 0) return <NoPatientLinked kind="labs" />;
  if (rows === null) return <LoadingBlock />;
  if (rows.length === 0)
    return <EmptyBlock icon={<FlaskConical className="h-6 w-6" />} text="لا توجد تقارير مختبر بعد." />;

  const view = applyReportFilters(rows, sort, range);

  return (
    <div className="grid gap-3">
      <ReportsControls
        sort={sort}
        setSort={setSort}
        range={range}
        setRange={setRange}
        total={rows.length}
        shown={view.length}
      />
      {view.length === 0 ? (
        <EmptyBlock
          icon={<FlaskConical className="h-6 w-6" />}
          text="لا توجد تقارير ضمن النطاق المحدد."
        />
      ) : (
        view.map((r) => (
          <ReportRow
            key={r.id}
            bucket="lab-reports"
            icon={<FlaskConical className="h-4 w-4" />}
            title={r.title}
            subtitle={r.test_type ?? undefined}
            date={r.report_date}
            released_at={r.released_at}
            status={r.status}
            file_path={r.file_path}
            note={r.summary ?? undefined}
          />
        ))
      )}
    </div>
  );
}

// ============ Radiology ============

function RadiologyTab({ patientId }: { patientId: string | null }) {
  const [rows, setRows] = useState<RadReport[] | null>(null);
  const [sort, setSort] = useState<SortKey>("released_at");
  const [range, setRange] = useState<RangeKey>("all");
  useEffect(() => {
    if (!patientId) {
      setRows([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("radiology_reports")
        .select("id, modality, body_part, report_date, findings, file_path, status, released_at")
        .eq("patient_id", patientId)
        .not("released_at", "is", null)
        .order("released_at", { ascending: false });
      if (error) return toast.error(error.message);
      setRows((data as RadReport[]) ?? []);
    })();
  }, [patientId]);

  if (!patientId && rows !== null && rows.length === 0)
    return <NoPatientLinked kind="radiology" />;
  if (rows === null) return <LoadingBlock />;
  if (rows.length === 0)
    return <EmptyBlock icon={<Scan className="h-6 w-6" />} text="لا توجد تقارير أشعة بعد." />;

  const view = applyReportFilters(rows, sort, range);

  return (
    <div className="grid gap-3">
      <ReportsControls
        sort={sort}
        setSort={setSort}
        range={range}
        setRange={setRange}
        total={rows.length}
        shown={view.length}
      />
      {view.length === 0 ? (
        <EmptyBlock icon={<Scan className="h-6 w-6" />} text="لا توجد تقارير ضمن النطاق المحدد." />
      ) : (
        view.map((r) => (
          <ReportRow
            key={r.id}
            bucket="radiology-reports"
            icon={<Scan className="h-4 w-4" />}
            title={r.modality}
            subtitle={r.body_part ?? undefined}
            date={r.report_date}
            released_at={r.released_at}
            status={r.status}
            file_path={r.file_path}
            note={r.findings ?? undefined}
          />
        ))
      )}
    </div>
  );
}

// ============ Invoices ============

function InvoicesTab({ patientId }: { patientId: string | null }) {
  const [rows, setRows] = useState<Invoice[] | null>(null);
  useEffect(() => {
    if (!patientId) {
      setRows([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, currency, status, issued_at, paid_at, pdf_path")
        .eq("patient_id", patientId)
        .order("issued_at", { ascending: false });
      if (error) return toast.error(error.message);
      setRows((data as Invoice[]) ?? []);
    })();
  }, [patientId]);

  if (!patientId && rows !== null && rows.length === 0)
    return <NoPatientLinked kind="invoices" />;
  if (rows === null) return <LoadingBlock />;
  if (rows.length === 0)
    return <EmptyBlock icon={<Receipt className="h-6 w-6" />} text="لا توجد فواتير حتى الآن." />;

  return (
    <div className="grid gap-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusChip status={r.status} label={invoiceStatusLabel(r.status)} />
                <span className="font-mono text-xs text-muted-foreground">
                  {r.invoice_number ?? r.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <div className="mt-2 text-xl font-bold">
                {r.total.toLocaleString("ar-SA")} {r.currency}
              </div>
              <div className="text-xs text-muted-foreground">
                صدرت في {r.issued_at}
                {r.paid_at && ` • دُفعت في ${new Date(r.paid_at).toLocaleDateString("ar-SA")}`}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {r.pdf_path ? (
                <DownloadFileButton
                  bucket="invoice-pdfs"
                  path={r.pdf_path}
                  label="تنزيل PDF"
                  filename={`invoice-${r.invoice_number ?? r.id.slice(0, 8)}.pdf`}
                />
              ) : (
                <NoFileHint />
              )}
              {r.status !== "paid" && r.status !== "cancelled" && (
                <Link
                  to="/insurance"
                  className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  طلب مطالبة تأمين
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ Shared UI ============

function ReportRow({
  bucket,
  icon,
  title,
  subtitle,
  date,
  released_at,
  status,
  file_path,
  note,
}: {
  bucket: "lab-reports" | "radiology-reports";
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  date: string;
  released_at?: string | null;
  status: string;
  file_path: string | null;
  note?: string;
}) {
  const releasedLabel = released_at
    ? new Date(released_at).toLocaleDateString("ar-SA-u-ca-gregory", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip status={status} label={reportStatusLabel(status)} />
            <span className="text-xs text-muted-foreground">تقرير: {date}</span>
            {releasedLabel && (
              <span className="text-xs text-muted-foreground">• أُفرِج: {releasedLabel}</span>
            )}
          </div>
          <h3 className="mt-2 text-base font-bold inline-flex items-center gap-2">
            <span className="text-primary">{icon}</span>
            {title}
          </h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {note && <p className="mt-2 text-sm text-foreground/80 leading-6">{note}</p>}
        </div>
        {file_path ? (
          <DownloadFileButton
            bucket={bucket}
            path={file_path}
            label="تنزيل PDF"
            filename={`${bucket}-${title}.pdf`.replace(/[^\w.\-]+/g, "_")}
          />
        ) : (
          <NoFileHint />
        )}
      </div>
    </div>
  );
}

function NoFileHint() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">
      لا يوجد ملف مرفق
    </span>
  );
}

function DownloadFileButton({
  bucket,
  path,
  label,
  filename,
}: {
  bucket: "lab-reports" | "radiology-reports" | "invoice-pdfs";
  path: string;
  label: string;
  filename?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const attemptRef = useRef(0);

  // Live countdown: tick every second while a signed URL is still within
  // its TTL window. Auto-cleans up when the URL expires or the button
  // unmounts, so we don't leave orphan intervals running.
  useEffect(() => {
    if (signedAt === null) return;
    setNowTick(Date.now());
    const id = window.setInterval(() => {
      const remaining = SIGNED_URL_TTL_SECONDS - (Date.now() - signedAt) / 1000;
      if (remaining <= 0) {
        setSignedAt(null);
        window.clearInterval(id);
        return;
      }
      setNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [signedAt]);

  const remainingSeconds =
    signedAt === null ? 0 : Math.max(0, SIGNED_URL_TTL_SECONDS - (nowTick - signedAt) / 1000);
  const countdownLabel = signedAt !== null && remainingSeconds > 0
    ? `متبقّي ${formatCountdown(remainingSeconds)}`
    : null;

  async function generateAndDownload() {
    if (loading) return;
    setLoading(true);
    setError(null);
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    const startedAt = performance.now();
    try {
      const signStartedAt = performance.now();
      const { data, error: signError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, filename ? { download: filename } : undefined);
      if (signError || !data?.signedUrl) {
        const friendly = getFriendlyDownloadError(signError?.message);
        headCheckStateByBucket.set(bucket, recordDownloadFailure(getHeadCheckState(bucket)));
        reportDownloadError({
          bucket,
          path,
          stage: "sign",
          message: signError?.message ?? "no signedUrl returned",
          httpStatus: null,
          durationMs: Math.round(performance.now() - signStartedAt),
          attempt,
        });
        setError(friendly);
        toast.error(friendly);
        return;
      }

      // Adaptive HEAD check: skip once the bucket has proven healthy, but
      // always re-check on the first attempt or after a recent failure.
      const decision = shouldPerformHeadCheck(getHeadCheckState(bucket));
      const headCheckSkipped = !decision.shouldCheck;
      if (decision.shouldCheck) {
        const headStartedAt = performance.now();
        try {
          const check = await fetch(data.signedUrl, { method: "HEAD", mode: "cors" });
          if (!check.ok) {
            const friendly = DOWNLOAD_ERROR_MESSAGES.invalidUrl;
            headCheckStateByBucket.set(bucket, recordDownloadFailure(getHeadCheckState(bucket)));
            reportDownloadError({
              bucket,
              path,
              stage: "head",
              message: `HEAD returned ${check.status} ${check.statusText}`,
              httpStatus: check.status,
              durationMs: Math.round(performance.now() - headStartedAt),
              headCheckSkipped: false,
              attempt,
            });
            setError(friendly);
            toast.error(friendly);
            return;
          }
        } catch (headErr) {
          // If CORS/network check fails, still attempt direct download; log for visibility.
          reportDownloadError({
            bucket,
            path,
            stage: "head",
            message: headErr instanceof Error ? headErr.message : "HEAD network/CORS error",
            httpStatus: null,
            durationMs: Math.round(performance.now() - headStartedAt),
            headCheckSkipped: false,
            attempt,
          });
        }
      }

      const a = document.createElement("a");
      a.href = data.signedUrl;
      if (filename) a.download = filename;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setSignedAt(Date.now());
      headCheckStateByBucket.set(bucket, recordDownloadSuccess(getHeadCheckState(bucket)));
      // Reset per-button attempt counter after a fully successful download.
      attemptRef.current = 0;
      // Retain the `headCheckSkipped` flag on success paths in debug logs
      void headCheckSkipped;
      toast.success(DOWNLOAD_ERROR_MESSAGES.downloadStarted);
    } catch (unexpected) {
      const friendly = DOWNLOAD_ERROR_MESSAGES.unexpected;
      headCheckStateByBucket.set(bucket, recordDownloadFailure(getHeadCheckState(bucket)));
      reportDownloadError({
        bucket,
        path,
        stage: "unexpected",
        message: unexpected instanceof Error ? unexpected.message : String(unexpected),
        httpStatus: null,
        durationMs: Math.round(performance.now() - startedAt),
        attempt,
      });
      setError(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  }

  const validityHint = formatSignedUrlValidity();

  if (error) {
    return (
      <div className="inline-flex flex-col items-start gap-1.5">
        <button
          type="button"
          disabled={loading}
          onClick={generateAndDownload}
          title={validityHint}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          إعادة المحاولة
        </button>
        <span className="text-xs text-destructive">{error}</span>
        {countdownLabel ? (
          <span
            className="text-[11px] font-medium text-primary tabular-nums"
            aria-live="polite"
            role="status"
          >
            {countdownLabel}
          </span>
        ) : validityHint ? (
          <span className="text-[11px] text-muted-foreground">{validityHint} بعد الإنشاء</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        disabled={loading}
        aria-busy={loading}
        aria-label={loading ? "جاري إعداد رابط التنزيل" : `${label} — ${validityHint}`}
        title={validityHint}
        onClick={generateAndDownload}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {loading ? "جاري التحضير..." : label}
      </button>
      {countdownLabel ? (
        <span
          className="text-[11px] font-medium text-primary tabular-nums"
          aria-live="polite"
          role="status"
        >
          {countdownLabel}
        </span>
      ) : validityHint ? (
        <span className="text-[11px] text-muted-foreground">{validityHint} بعد الإنشاء</span>
      ) : null}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" /> جاري التحميل...
    </div>
  );
}

function EmptyBlock({
  icon,
  text,
  action,
}: {
  icon: React.ReactNode;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-muted grid place-items-center text-muted-foreground">
        {icon}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

function NoPatientLinked({ kind }: { kind: "prescriptions" | "labs" | "radiology" | "invoices" }) {
  const labels: Record<typeof kind, string> = {
    prescriptions: "الوصفات",
    labs: "تقارير المختبر",
    radiology: "تقارير الأشعة",
    invoices: "الفواتير",
  };
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-8 text-center">
      <h3 className="font-bold">لا يوجد ملف مريض مرتبط بحسابك</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        لعرض {labels[kind]} الخاصة بك، تحتاج أن يربط الاستقبال ملفك الطبي بحسابك.
      </p>
      <Link
        to="/contact"
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        تواصل مع الاستقبال
      </Link>
    </div>
  );
}

function statusKey(s: string) {
  return `status_${s}` as
    | "status_new"
    | "status_confirmed"
    | "status_completed"
    | "status_cancelled"
    | "status_no_show";
}

function StatusChip({ status, label }: { status: string; label: string }) {
  const cls = statusColor(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function statusColor(s: string) {
  switch (s) {
    case "confirmed":
    case "active":
    case "paid":
    case "ready":
      return "bg-green-500/10 text-green-700 border-green-500/30";
    case "completed":
      return "bg-teal-500/10 text-teal-700 border-teal-500/30";
    case "cancelled":
    case "refunded":
      return "bg-red-500/10 text-red-700 border-red-500/30";
    case "no_show":
    case "revised":
    case "partially_paid":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    case "pending":
      return "bg-slate-500/10 text-slate-700 border-slate-500/30";
    default:
      return "bg-primary/10 text-primary border-primary/30";
  }
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    active: "نشطة",
    completed: "منتهية",
    cancelled: "ملغاة",
  };
  return map[s] ?? s;
}

function reportStatusLabel(s: string) {
  const map: Record<string, string> = {
    ready: "جاهز",
    pending: "قيد المعالجة",
    revised: "مراجَع",
  };
  return map[s] ?? s;
}

function invoiceStatusLabel(s: string) {
  const map: Record<string, string> = {
    pending: "غير مسدّدة",
    paid: "مسدّدة",
    partially_paid: "سُدّدت جزئيًا",
    cancelled: "ملغاة",
    refunded: "مستردّة",
  };
  return map[s] ?? s;
}

// unused re-exports to silence tree-shake lint on some presets
export const _memoUnused = useMemo;
