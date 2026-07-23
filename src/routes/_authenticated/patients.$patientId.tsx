import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAttachmentSignedUrl } from "@/lib/patients.functions";
import {
  logPatientQrScan,
  listPatientQrScans,
  getPatientQrScanCount,
} from "@/lib/patient-qr-scans.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  User,
  AlertTriangle,
  Pill,
  History,
  Scissors,
  Stethoscope,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  Loader2,
  Download,
  Phone,
  IdCard,
  Calendar,
  QrCode,
  ScanLine,
} from "lucide-react";
import { PatientQrDialog } from "@/components/PatientQrDialog";

export const Route = createFileRoute("/_authenticated/patients/$patientId")({
  head: () => ({
    meta: [{ title: "ملف مريض | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
  component: PatientDetail,
});

type Patient = {
  id: string;
  branch_id: string;
  mrn: string;
  full_name_ar: string;
  full_name_en: string | null;
  national_id: string | null;
  phone: string;
  secondary_phone: string | null;
  email: string | null;
  gender: "male" | "female" | "other" | null;
  date_of_birth: string | null;
  blood_type: string | null;
  marital_status: string | null;
  nationality: string | null;
  city: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
};

function calcAge(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

function PatientDetail() {
  const { patientId } = Route.useParams();
  const qc = useQueryClient();
  const logScanFn = useServerFn(logPatientQrScan);

  // Log a QR scan when the page is opened via ?src=qr
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("src") !== "qr") return;
    logScanFn({
      data: {
        patientId,
        source: "qr",
        userAgent: navigator.userAgent.slice(0, 500),
      },
    })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["patient-qr-scans", patientId] });
        qc.invalidateQueries({ queryKey: ["patient-qr-scan-count", patientId] });
        // Clean the URL so a refresh doesn't double-count
        const url = new URL(window.location.href);
        url.searchParams.delete("src");
        window.history.replaceState({}, "", url.toString());
      })
      .catch(() => {
        /* silent — non-critical */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const patientQ = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async (): Promise<Patient | null> => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", patientId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as Patient | null;
    },
  });

  const allergiesQ = useQuery({
    queryKey: ["patient-allergies", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_allergies")
        .select("*")
        .eq("patient_id", patientId)
        .order("severity", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (patientQ.isLoading) {
    return (
      <div className="container-app py-16 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!patientQ.data) {
    return (
      <div className="container-app py-16 text-center">
        <p className="text-muted-foreground">لم يتم العثور على الملف</p>
        <Link to="/patients" className="mt-4 inline-block text-primary">
          العودة إلى القائمة
        </Link>
      </div>
    );
  }

  const p = patientQ.data;
  const criticalAllergies = (allergiesQ.data ?? []).filter(
    (a: any) => a.severity === "severe" || a.severity === "life_threatening",
  );

  return (
    <div className="container-app py-8">
      <div className="mb-4 flex items-center gap-2">
        <Link
          to="/patients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> القائمة
        </Link>
      </div>

      {criticalAllergies.length > 0 && (
        <div className="mb-4 rounded-xl border-2 border-red-500 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />
          <div>
            <div className="font-bold text-red-700">تنبيه حساسية خطيرة</div>
            <div className="text-sm text-red-800 mt-1">
              {criticalAllergies
                .map((a: any) => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ""}`)
                .join("، ")}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 grid place-items-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{p.full_name_ar}</h1>
                {p.full_name_en && (
                  <p className="text-sm text-muted-foreground">{p.full_name_en}</p>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <InfoRow
                icon={IdCard}
                label="رقم الملف"
                value={<span className="font-mono">{p.mrn}</span>}
              />
              <InfoRow icon={Phone} label="الجوال" value={p.phone} />
              <InfoRow icon={IdCard} label="الهوية" value={p.national_id ?? "—"} />
              <InfoRow
                icon={Calendar}
                label="العمر / الجنس"
                value={`${calcAge(p.date_of_birth) ?? "—"} / ${p.gender === "male" ? "ذكر" : p.gender === "female" ? "أنثى" : "—"}`}
              />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <PatientQrDialog
              patientId={p.id}
              mrn={p.mrn}
              fullNameAr={p.full_name_ar}
              variant="button"
            />
            <QrScanStats patientId={p.id} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 sm:inline-flex h-auto">
          <TabsTrigger value="profile">
            <User className="h-4 w-4 ml-1" /> بيانات
          </TabsTrigger>
          <TabsTrigger value="clinical">
            <Stethoscope className="h-4 w-4 ml-1" /> سريري
          </TabsTrigger>
          <TabsTrigger value="visits">
            <History className="h-4 w-4 ml-1" /> الزيارات
          </TabsTrigger>
          <TabsTrigger value="attachments">
            <Paperclip className="h-4 w-4 ml-1" /> المرفقات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <OverviewSection patient={p} />
        </TabsContent>

        <TabsContent value="clinical" className="mt-4">
          <Tabs defaultValue="allergies">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 sm:inline-flex h-auto">
              <TabsTrigger value="allergies">
                <AlertTriangle className="h-4 w-4 ml-1" /> الحساسية
              </TabsTrigger>
              <TabsTrigger value="medications">
                <Pill className="h-4 w-4 ml-1" /> الأدوية
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 ml-1" /> التاريخ المرضي
              </TabsTrigger>
              <TabsTrigger value="surgeries">
                <Scissors className="h-4 w-4 ml-1" /> العمليات
              </TabsTrigger>
            </TabsList>
            <TabsContent value="allergies" className="mt-4">
              <AllergiesSection patientId={patientId} />
            </TabsContent>
            <TabsContent value="medications" className="mt-4">
              <MedicationsSection patientId={patientId} />
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <HistorySection patientId={patientId} />
            </TabsContent>
            <TabsContent value="surgeries" className="mt-4">
              <SurgeriesSection patientId={patientId} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="visits" className="mt-4">
          <VisitsSection patientId={patientId} />
        </TabsContent>
        <TabsContent value="attachments" className="mt-4">
          <AttachmentsSection patientId={patientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QrScanStats({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const countFn = useServerFn(getPatientQrScanCount);
  const listFn = useServerFn(listPatientQrScans);

  const countQ = useQuery({
    queryKey: ["patient-qr-scan-count", patientId],
    queryFn: () => countFn({ data: { patientId } }),
    staleTime: 30_000,
  });
  const listQ = useQuery({
    queryKey: ["patient-qr-scans", patientId],
    queryFn: () => listFn({ data: { patientId, limit: 50 } }),
    enabled: open,
  });

  const count = countQ.data?.count ?? 0;
  const last = countQ.data?.lastScannedAt ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="سجل مسح QR"
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs hover:bg-muted"
      >
        <ScanLine className="h-3.5 w-3.5 text-primary" />
        <span>
          <b className="text-foreground">{count}</b>{" "}
          <span className="text-muted-foreground">مسح</span>
        </span>
        {last && (
          <span className="text-muted-foreground border-r pr-1.5 mr-0.5 hidden sm:inline">
            آخر: {formatWhen(last)}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
          dir="rtl"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-card p-5 shadow-xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" /> سجل مسح QR
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-0.5 text-sm hover:bg-muted"
              >
                إغلاق
              </button>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">إجمالي المسح</p>
                <p className="text-2xl font-bold">{count}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">آخر مسح</p>
                <p className="text-sm font-medium mt-1">{last ? formatFull(last) : "—"}</p>
              </div>
            </div>
            <div className="flex-1 overflow-auto rounded-md border border-border">
              {listQ.isLoading ? (
                <p className="p-4 text-sm text-muted-foreground text-center">جارٍ التحميل…</p>
              ) : (listQ.data ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  لا يوجد مسح مسجّل بعد.
                </p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {(listQ.data ?? []).map((r) => (
                    <li key={r.id} className="px-3 py-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.scanner_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">المصدر: {r.source}</p>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {formatFull(r.scanned_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `${Math.floor(diff / 60)}د`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}س`;
  return `${Math.floor(diff / 86400)}ي`;
}

function formatFull(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-SA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}

/* ----------------- Overview ----------------- */
function OverviewSection({ patient: p }: { patient: Patient }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <KV k="فصيلة الدم" v={p.blood_type} />
      <KV k="الحالة الاجتماعية" v={p.marital_status} />
      <KV k="الجنسية" v={p.nationality} />
      <KV k="المدينة" v={p.city} />
      <KV k="العنوان" v={p.address} />
      <KV k="البريد" v={p.email} />
      <KV k="جوال بديل" v={p.secondary_phone} />
      <KV
        k="جهة اتصال طوارئ"
        v={
          p.emergency_contact_name &&
          `${p.emergency_contact_name} — ${p.emergency_contact_phone ?? ""}`
        }
      />
      <div className="md:col-span-2">
        <KV k="ملاحظات" v={p.notes} />
      </div>
    </div>
  );
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="font-medium">{v || "—"}</div>
    </div>
  );
}

/* ----------------- Reusable section shell ----------------- */
function SectionShell({
  title,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
        {onAdd && (
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> {addLabel ?? "إضافة"}
          </button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ----------------- Allergies ----------------- */
const SEVERITY_LABEL: Record<string, string> = {
  mild: "خفيف",
  moderate: "متوسط",
  severe: "شديد",
  life_threatening: "مهدد للحياة",
};
const SEVERITY_COLOR: Record<string, string> = {
  mild: "bg-teal-500/10 text-teal-700 border-teal-500/30",
  moderate: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  severe: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  life_threatening: "bg-red-500/10 text-red-700 border-red-500/30",
};

function AllergiesSection({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["patient-allergies", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_allergies")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const del = async (id: string) => {
    if (!confirm("حذف هذا السجل؟")) return;
    const { error } = await supabase.from("patient_allergies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    q.refetch();
  };

  return (
    <SectionShell title="الحساسية" onAdd={() => setOpen(true)}>
      {q.data && q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد حساسية مسجّلة</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data?.map((a: any) => (
            <li key={a.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{a.allergen}</span>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_COLOR[a.severity]}`}
                  >
                    {SEVERITY_LABEL[a.severity]}
                  </span>
                </div>
                {a.reaction && (
                  <div className="text-sm text-muted-foreground mt-1">التفاعل: {a.reaction}</div>
                )}
                {a.notes && <div className="text-xs text-muted-foreground mt-1">{a.notes}</div>}
              </div>
              <button
                onClick={() => del(a.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <SimpleFormDialog
          title="إضافة حساسية"
          onClose={() => setOpen(false)}
          fields={[
            { key: "allergen", label: "المادة *", required: true },
            { key: "reaction", label: "التفاعل" },
            {
              key: "severity",
              label: "الشدة",
              type: "select",
              options: [
                { v: "mild", l: "خفيف" },
                { v: "moderate", l: "متوسط" },
                { v: "severe", l: "شديد" },
                { v: "life_threatening", l: "مهدد للحياة" },
              ],
              default: "mild",
            },
            { key: "noted_on", label: "تاريخ الملاحظة", type: "date" },
            { key: "notes", label: "ملاحظات", type: "textarea" },
          ]}
          onSubmit={async (v) => {
            const { data: u } = await supabase.auth.getUser();
            const { error } = await supabase.from("patient_allergies").insert({
              patient_id: patientId,
              allergen: v.allergen,
              reaction: v.reaction || null,
              severity: (v.severity || "mild") as any,
              noted_on: v.noted_on || null,
              notes: v.notes || null,
              recorded_by: u.user?.id ?? null,
            });
            if (error) throw error;
            q.refetch();
          }}
        />
      )}
    </SectionShell>
  );
}

/* ----------------- Medications ----------------- */
const MED_STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  paused: "موقوف مؤقتاً",
  stopped: "متوقف",
  completed: "منتهي",
};

function MedicationsSection({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["patient-meds", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_medications")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const del = async (id: string) => {
    if (!confirm("حذف هذا الدواء؟")) return;
    const { error } = await supabase.from("patient_medications").delete().eq("id", id);
    if (error) return toast.error(error.message);
    q.refetch();
  };
  return (
    <SectionShell title="الأدوية" onAdd={() => setOpen(true)}>
      {q.data && q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد أدوية مسجّلة</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data?.map((m: any) => (
            <li key={m.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{m.medication_name}</span>
                  <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[10px]">
                    {MED_STATUS_LABEL[m.status]}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {[m.dosage, m.frequency, m.route].filter(Boolean).join(" • ") || "—"}
                </div>
                {(m.start_date || m.end_date) && (
                  <div className="text-xs text-muted-foreground">
                    {m.start_date ?? ""} {m.end_date ? `→ ${m.end_date}` : ""}
                  </div>
                )}
                {m.notes && <div className="text-xs text-muted-foreground mt-1">{m.notes}</div>}
              </div>
              <button
                onClick={() => del(m.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <SimpleFormDialog
          title="إضافة دواء"
          onClose={() => setOpen(false)}
          fields={[
            { key: "medication_name", label: "اسم الدواء *", required: true },
            { key: "dosage", label: "الجرعة" },
            { key: "frequency", label: "التكرار" },
            { key: "route", label: "طريقة الاستخدام" },
            { key: "start_date", label: "تاريخ البدء", type: "date" },
            { key: "end_date", label: "تاريخ الانتهاء", type: "date" },
            {
              key: "status",
              label: "الحالة",
              type: "select",
              default: "active",
              options: [
                { v: "active", l: "نشط" },
                { v: "paused", l: "موقوف مؤقتاً" },
                { v: "stopped", l: "متوقف" },
                { v: "completed", l: "منتهي" },
              ],
            },
            { key: "prescribed_by_name", label: "الطبيب الواصف" },
            { key: "notes", label: "ملاحظات", type: "textarea" },
          ]}
          onSubmit={async (v) => {
            const { data: u } = await supabase.auth.getUser();
            const { error } = await supabase.from("patient_medications").insert({
              patient_id: patientId,
              medication_name: v.medication_name,
              dosage: v.dosage || null,
              frequency: v.frequency || null,
              route: v.route || null,
              start_date: v.start_date || null,
              end_date: v.end_date || null,
              status: (v.status || "active") as any,
              prescribed_by_name: v.prescribed_by_name || null,
              notes: v.notes || null,
              recorded_by: u.user?.id ?? null,
            });
            if (error) throw error;
            q.refetch();
          }}
        />
      )}
    </SectionShell>
  );
}

/* ----------------- Medical History ----------------- */
const HIST_CATEGORY: Record<string, string> = {
  chronic: "مزمن",
  past: "سابق",
  family: "عائلي",
  surgical_note: "ملاحظة جراحية",
};
function HistorySection({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["patient-history", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_medical_history")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const del = async (id: string) => {
    if (!confirm("حذف هذا السجل؟")) return;
    const { error } = await supabase.from("patient_medical_history").delete().eq("id", id);
    if (error) return toast.error(error.message);
    q.refetch();
  };
  return (
    <SectionShell title="التاريخ المرضي" onAdd={() => setOpen(true)}>
      {q.data && q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد سجلات</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data?.map((h: any) => (
            <li key={h.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{h.condition}</span>
                  <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[10px]">
                    {HIST_CATEGORY[h.category]}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {[h.onset_date, h.resolution_date].filter(Boolean).join(" → ")}
                </div>
                {h.notes && <div className="text-xs text-muted-foreground mt-1">{h.notes}</div>}
              </div>
              <button
                onClick={() => del(h.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <SimpleFormDialog
          title="إضافة تاريخ مرضي"
          onClose={() => setOpen(false)}
          fields={[
            { key: "condition", label: "الحالة *", required: true },
            {
              key: "category",
              label: "الفئة",
              type: "select",
              default: "past",
              options: [
                { v: "chronic", l: "مزمن" },
                { v: "past", l: "سابق" },
                { v: "family", l: "عائلي" },
                { v: "surgical_note", l: "ملاحظة جراحية" },
              ],
            },
            {
              key: "status",
              label: "الحالة الحالية",
              type: "select",
              default: "active",
              options: [
                { v: "active", l: "نشطة" },
                { v: "managed", l: "مُدارة" },
                { v: "resolved", l: "منتهية" },
              ],
            },
            { key: "onset_date", label: "تاريخ البدء", type: "date" },
            { key: "resolution_date", label: "تاريخ الانتهاء", type: "date" },
            { key: "notes", label: "ملاحظات", type: "textarea" },
          ]}
          onSubmit={async (v) => {
            const { data: u } = await supabase.auth.getUser();
            const { error } = await supabase.from("patient_medical_history").insert({
              patient_id: patientId,
              condition: v.condition,
              category: (v.category || "past") as any,
              status: (v.status || "active") as any,
              onset_date: v.onset_date || null,
              resolution_date: v.resolution_date || null,
              notes: v.notes || null,
              recorded_by: u.user?.id ?? null,
            });
            if (error) throw error;
            q.refetch();
          }}
        />
      )}
    </SectionShell>
  );
}

/* ----------------- Surgeries ----------------- */
function SurgeriesSection({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["patient-surgeries", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_surgeries")
        .select("*")
        .eq("patient_id", patientId)
        .order("surgery_date", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const del = async (id: string) => {
    if (!confirm("حذف هذه العملية؟")) return;
    const { error } = await supabase.from("patient_surgeries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    q.refetch();
  };
  return (
    <SectionShell title="العمليات الجراحية" onAdd={() => setOpen(true)}>
      {q.data && q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد عمليات</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data?.map((s: any) => (
            <li key={s.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{s.procedure_name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {[s.surgery_date, s.hospital, s.surgeon_name].filter(Boolean).join(" • ")}
                </div>
                {s.outcome && (
                  <div className="text-sm mt-1">
                    <span className="text-muted-foreground">النتيجة: </span>
                    {s.outcome}
                  </div>
                )}
                {s.complications && (
                  <div className="text-sm text-red-700 mt-1">مضاعفات: {s.complications}</div>
                )}
                {s.notes && <div className="text-xs text-muted-foreground mt-1">{s.notes}</div>}
              </div>
              <button
                onClick={() => del(s.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <SimpleFormDialog
          title="إضافة عملية"
          onClose={() => setOpen(false)}
          fields={[
            { key: "procedure_name", label: "اسم العملية *", required: true },
            { key: "surgery_date", label: "التاريخ", type: "date" },
            { key: "hospital", label: "المستشفى" },
            { key: "surgeon_name", label: "الجراح" },
            { key: "outcome", label: "النتيجة" },
            { key: "complications", label: "المضاعفات" },
            { key: "notes", label: "ملاحظات", type: "textarea" },
          ]}
          onSubmit={async (v) => {
            const { data: u } = await supabase.auth.getUser();
            const { error } = await supabase.from("patient_surgeries").insert({
              patient_id: patientId,
              procedure_name: v.procedure_name,
              surgery_date: v.surgery_date || null,
              hospital: v.hospital || null,
              surgeon_name: v.surgeon_name || null,
              outcome: v.outcome || null,
              complications: v.complications || null,
              notes: v.notes || null,
              recorded_by: u.user?.id ?? null,
            });
            if (error) throw error;
            q.refetch();
          }}
        />
      )}
    </SectionShell>
  );
}

/* ----------------- Visits (SOAP) ----------------- */
function VisitsSection({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["patient-visits", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_visits")
        .select("*")
        .eq("patient_id", patientId)
        .order("visit_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  return (
    <SectionShell title="الزيارات السريرية" onAdd={() => setOpen(true)} addLabel="زيارة جديدة">
      {q.data && q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد زيارات</p>
      ) : (
        <ul className="space-y-3">
          {q.data?.map((v: any) => (
            <li key={v.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm">
                  {new Date(v.visit_date).toLocaleString("ar-SA")}
                </div>
                {v.follow_up_date && (
                  <div className="text-xs text-primary">متابعة: {v.follow_up_date}</div>
                )}
              </div>
              {v.chief_complaint && (
                <div className="text-sm mb-2">
                  <span className="text-muted-foreground">الشكوى الرئيسية: </span>
                  {v.chief_complaint}
                </div>
              )}
              {v.vitals && Object.keys(v.vitals).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
                  {Object.entries(v.vitals).map(([k, val]) =>
                    val ? (
                      <span
                        key={k}
                        className="rounded-full border border-border px-2 py-0.5 bg-muted/50"
                      >
                        {k}: {String(val)}
                      </span>
                    ) : null,
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {v.subjective && <SOAP k="S" v={v.subjective} />}
                {v.objective && <SOAP k="O" v={v.objective} />}
                {v.assessment && <SOAP k="A" v={v.assessment} />}
                {v.plan && <SOAP k="P" v={v.plan} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <VisitDialog
          patientId={patientId}
          onClose={() => setOpen(false)}
          onSaved={() => q.refetch()}
        />
      )}
    </SectionShell>
  );
}
function SOAP({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="font-bold text-primary">{k}</div>
      <div className="text-muted-foreground whitespace-pre-wrap">{v}</div>
    </div>
  );
}

function VisitDialog({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    chief_complaint: "",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    follow_up_date: "",
    bp: "",
    hr: "",
    temp: "",
    rr: "",
    spo2: "",
    weight: "",
    height: "",
  });
  const u = (k: keyof typeof f, val: string) => setF((s) => ({ ...s, [k]: val }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const vitals: Record<string, string> = {};
      (["bp", "hr", "temp", "rr", "spo2", "weight", "height"] as const).forEach((k) => {
        if (f[k]) vitals[k] = f[k];
      });
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("patient_visits").insert({
        patient_id: patientId,
        chief_complaint: f.chief_complaint || null,
        subjective: f.subjective || null,
        objective: f.objective || null,
        assessment: f.assessment || null,
        plan: f.plan || null,
        follow_up_date: f.follow_up_date || null,
        vitals,
        created_by: user.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("تم حفظ الزيارة");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 overflow-auto">
      <form onSubmit={submit} className="w-full max-w-3xl rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="font-bold">زيارة سريرية جديدة</h3>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-auto text-sm">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">الشكوى الرئيسية</label>
            <input
              value={f.chief_complaint}
              onChange={(e) => u("chief_complaint", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </div>
          <fieldset className="md:col-span-2 grid grid-cols-2 md:grid-cols-7 gap-2 border border-border rounded-md p-3">
            <legend className="px-1 text-xs text-muted-foreground">العلامات الحيوية</legend>
            {[
              ["bp", "ضغط"],
              ["hr", "نبض"],
              ["temp", "حرارة"],
              ["rr", "تنفس"],
              ["spo2", "SpO2"],
              ["weight", "وزن"],
              ["height", "طول"],
            ].map(([k, l]) => (
              <div key={k}>
                <label className="text-[10px] text-muted-foreground">{l}</label>
                <input
                  value={(f as any)[k]}
                  onChange={(e) => u(k as any, e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                />
              </div>
            ))}
          </fieldset>
          {[
            ["subjective", "S — Subjective"],
            ["objective", "O — Objective"],
            ["assessment", "A — Assessment"],
            ["plan", "P — Plan"],
          ].map(([k, l]) => (
            <div key={k}>
              <label className="text-xs text-muted-foreground">{l}</label>
              <textarea
                value={(f as any)[k]}
                onChange={(e) => u(k as any, e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 min-h-24"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-muted-foreground">تاريخ المتابعة</label>
            <input
              type="date"
              value={f.follow_up_date}
              onChange={(e) => u("follow_up_date", e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm"
          >
            إلغاء
          </button>
          <button
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "…" : "حفظ الزيارة"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ----------------- Attachments ----------------- */
const ATTACH_CATEGORY: Record<string, string> = {
  lab: "تحاليل",
  imaging: "أشعة",
  report: "تقرير",
  prescription: "وصفة",
  insurance: "تأمين",
  other: "أخرى",
};

function AttachmentsSection({ patientId }: { patientId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("other");
  const getSigned = useServerFn(getAttachmentSignedUrl);

  const q = useQuery({
    queryKey: ["patient-attachments", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_attachments")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("اختر ملفاً");
    if (!title.trim()) return toast.error("العنوان مطلوب");
    if (file.size > 20 * 1024 * 1024) return toast.error("الحد الأقصى 20MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${patientId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("patient-files")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("patient_attachments").insert({
        patient_id: patientId,
        title: title.trim(),
        category: category as any,
        file_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: u.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("تم رفع الملف");
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      q.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر الرفع");
    } finally {
      setUploading(false);
    }
  };

  const download = async (attachmentId: string) => {
    try {
      const { url } = await getSigned({ data: { attachment_id: attachmentId } });
      window.open(url, "_blank", "noopener");
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر التنزيل");
    }
  };

  const del = async (id: string, path: string) => {
    if (!confirm("حذف هذا الملف؟")) return;
    await supabase.storage.from("patient-files").remove([path]);
    const { error } = await supabase.from("patient_attachments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    q.refetch();
  };

  return (
    <SectionShell title="المرفقات">
      <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-2 items-end rounded-xl border border-dashed border-border p-4">
        <div>
          <label className="text-xs text-muted-foreground">العنوان *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">النوع</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(ATTACH_CATEGORY).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 flex items-center gap-2">
          <input ref={fileRef} type="file" className="flex-1 text-sm" />
          <button
            onClick={upload}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            رفع
          </button>
        </div>
      </div>
      {q.data && q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد مرفقات</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data?.map((a: any) => (
            <li key={a.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{a.title}</div>
                <div className="text-xs text-muted-foreground">
                  {ATTACH_CATEGORY[a.category]} • {(a.size_bytes / 1024).toFixed(0)} KB •{" "}
                  {new Date(a.created_at).toLocaleString("ar-SA")}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => download(a.file_path)}
                  className="rounded-md border border-input p-2 hover:bg-muted"
                  title="تنزيل"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => del(a.id, a.file_path)}
                  className="rounded-md border border-input p-2 text-muted-foreground hover:text-destructive"
                  title="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

/* ----------------- Simple generic form dialog ----------------- */
type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "textarea" | "date" | "select";
  default?: string;
  options?: { v: string; l: string }[];
};
function SimpleFormDialog({
  title,
  fields,
  onSubmit,
  onClose,
}: {
  title: string;
  fields: FieldDef[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.default ?? ""])),
  );
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim())
        return toast.error(`${f.label.replace(" *", "")} مطلوب`);
    }
    setSaving(true);
    try {
      await onSubmit(values);
      toast.success("تم الحفظ");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 overflow-auto">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="font-bold">{title}</h3>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-6 space-y-3 max-h-[70vh] overflow-auto">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {f.label}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-20"
                />
              ) : f.type === "select" ? (
                <select
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {f.options?.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type ?? "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm"
          >
            إلغاء
          </button>
          <button
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "…" : "حفظ"}
          </button>
        </div>
      </form>
    </div>
  );
}
