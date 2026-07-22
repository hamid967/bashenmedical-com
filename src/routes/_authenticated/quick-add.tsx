/**
 * Admin quick-add wizard — يضيف الفروع (العيادات) والأطباء والمواعيد من
 * مكان واحد بلا التنقل بين شاشات الإدارة المختلفة.
 *
 * Three tabs, each posts to a dedicated server function:
 *   - "عيادة"  → createBranch
 *   - "طبيب"   → createDoctor
 *   - "موعد"   → createAppointmentAdmin
 *
 * The staff role gate lives inside every server function; this page only
 * hides the tab shell for non-admins as a UX shortcut.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertCircle,
  Building2,
  Stethoscope,
  CalendarPlus,
  ChevronLeft,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  createBranch,
  createDoctor,
  createAppointmentAdmin,
  createSpecialty,
  listBranchesAdmin,
  listDoctorsAdmin,
  listSpecialtiesFull,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/quick-add")({
  head: () => ({
    meta: [
      { title: "مساعد الإضافة السريعة | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuickAddPage,
});

type Tab = "branch" | "doctor" | "appointment" | "import";

function QuickAddPage() {
  const [tab, setTab] = useState<Tab>("branch");

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6" dir="rtl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مساعد الإضافة السريعة</h1>
          <p className="text-sm text-muted-foreground">
            أضف عيادة أو طبيبًا أو موعدًا من نافذة واحدة.
          </p>
        </div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
          لوحة الإدارة
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TabButton
          active={tab === "branch"}
          onClick={() => setTab("branch")}
          icon={<Building2 className="h-4 w-4" />}
        >
          عيادة
        </TabButton>
        <TabButton
          active={tab === "doctor"}
          onClick={() => setTab("doctor")}
          icon={<Stethoscope className="h-4 w-4" />}
        >
          طبيب
        </TabButton>
        <TabButton
          active={tab === "appointment"}
          onClick={() => setTab("appointment")}
          icon={<CalendarPlus className="h-4 w-4" />}
        >
          موعد
        </TabButton>
        <TabButton
          active={tab === "import"}
          onClick={() => setTab("import")}
          icon={<Upload className="h-4 w-4" />}
        >
          استيراد
        </TabButton>
      </div>

      <div className="rounded-lg border border-input bg-card p-4 sm:p-6 shadow-sm">
        {tab === "branch" && <BranchForm />}
        {tab === "doctor" && <DoctorForm />}
        {tab === "appointment" && <AppointmentForm />}
        {tab === "import" && <ImportPanel />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-muted")
      }
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------------- Branch (عيادة) form ---------------- */
const branchClientSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "المعرّف قصير جدًا (حرفان على الأقل)")
    .max(40, "المعرّف طويل جدًا (٤٠ حرفًا كحد أقصى)")
    .regex(/^[a-z0-9-]+$/, "أحرف إنجليزية صغيرة وأرقام وشرطات فقط، مثل: jeddah-main"),
  name_ar: z
    .string()
    .trim()
    .min(2, "الاسم بالعربية مطلوب (حرفان على الأقل)")
    .max(120, "الاسم بالعربية طويل جدًا")
    .regex(/[\u0600-\u06FF]/, "يجب أن يحتوي على أحرف عربية"),
  name_en: z
    .string()
    .trim()
    .min(2, "الاسم بالإنجليزية مطلوب")
    .max(120, "الاسم بالإنجليزية طويل جدًا")
    .regex(/^[A-Za-z0-9 .,'&()-]+$/, "أحرف إنجليزية فقط"),
  city_ar: z.string().trim().max(80, "اسم المدينة طويل").optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^\+?[0-9\s-]{7,20}$/.test(v), "رقم هاتف غير صالح"),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "بريد إلكتروني غير صالح"),
  address_ar: z.string().trim().max(240, "العنوان طويل جدًا").optional().or(z.literal("")),
});

type BranchFormValues = z.infer<typeof branchClientSchema>;

function BranchForm() {
  const submit = useServerFn(createBranch);
  const [form, setForm] = useState<BranchFormValues>({
    slug: "",
    name_ar: "",
    name_en: "",
    city_ar: "",
    phone: "",
    email: "",
    address_ar: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof BranchFormValues, string>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const validate = (values: BranchFormValues) => {
    const result = branchClientSchema.safeParse(values);
    if (result.success) return {};
    const map: Partial<Record<keyof BranchFormValues, string>> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof BranchFormValues;
      if (key && !map[key]) map[key] = issue.message;
    }
    return map;
  };

  const update = <K extends keyof BranchFormValues>(key: K, value: BranchFormValues[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (submitAttempted) setErrors(validate(next));
  };

  const m = useMutation({
    mutationFn: (data: BranchFormValues) => submit({ data }),
    onSuccess: () => {
      toast.success("تمت إضافة العيادة بنجاح");
      setForm({
        slug: "",
        name_ar: "",
        name_en: "",
        city_ar: "",
        phone: "",
        email: "",
        address_ar: "",
      });
      setErrors({});
      setSubmitAttempted(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إضافة العيادة"),
  });

  const errorCount = Object.keys(errors).length;

  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitAttempted(true);
        const map = validate(form);
        setErrors(map);
        if (Object.keys(map).length > 0) {
          toast.error("الرجاء تصحيح الحقول المميّزة قبل الإرسال");
          return;
        }
        m.mutate(form);
      }}
    >
      {submitAttempted && errorCount > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>يوجد {errorCount} خطأ في النموذج. الرجاء المراجعة قبل الحفظ.</span>
        </div>
      )}
      <Row>
        <Field label="المعرّف (slug)" required error={errors.slug}>
          <input
            className={inputClass}
            value={form.slug}
            onChange={(e) => update("slug", e.target.value)}
            placeholder="jeddah-main"
            aria-invalid={!!errors.slug}
          />
        </Field>
        <Field label="المدينة" error={errors.city_ar}>
          <input
            className={inputClass}
            value={form.city_ar}
            onChange={(e) => update("city_ar", e.target.value)}
            placeholder="جدة"
            aria-invalid={!!errors.city_ar}
          />
        </Field>
      </Row>
      <Row>
        <Field label="الاسم بالعربية" required error={errors.name_ar}>
          <input
            className={inputClass}
            value={form.name_ar}
            onChange={(e) => update("name_ar", e.target.value)}
            aria-invalid={!!errors.name_ar}
          />
        </Field>
        <Field label="الاسم بالإنجليزية" required error={errors.name_en}>
          <input
            className={inputClass}
            value={form.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            aria-invalid={!!errors.name_en}
          />
        </Field>
      </Row>
      <Row>
        <Field label="هاتف" error={errors.phone}>
          <input
            className={inputClass}
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+9665..."
            inputMode="tel"
            aria-invalid={!!errors.phone}
          />
        </Field>
        <Field label="بريد إلكتروني" error={errors.email}>
          <input
            className={inputClass}
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            type="email"
            aria-invalid={!!errors.email}
          />
        </Field>
      </Row>
      <Field label="العنوان" error={errors.address_ar}>
        <input
          className={inputClass}
          value={form.address_ar}
          onChange={(e) => update("address_ar", e.target.value)}
          aria-invalid={!!errors.address_ar}
        />
      </Field>
      <SubmitBar disabled={m.isPending} pending={m.isPending} label="إضافة العيادة" />
    </form>
  );
}

/* ---------------- Doctor (طبيب) form ---------------- */
function DoctorForm() {
  const submit = useServerFn(createDoctor);
  const submitSpec = useServerFn(createSpecialty);
  const branchesQ = useQuery({ queryKey: ["qa", "branches"], queryFn: () => listBranchesAdmin() });
  const specialtiesQ = useQuery({
    queryKey: ["qa", "specs"],
    queryFn: () => listSpecialtiesFull(),
  });

  const [form, setForm] = useState({
    name_ar: "",
    name_en: "",
    title_ar: "",
    specialty_id: "",
    branch_id: "",
    slug: "",
  });

  const m = useMutation({
    mutationFn: (data: any) => submit({ data }),
    onSuccess: () => {
      toast.success("تمت إضافة الطبيب بنجاح");
      setForm({
        name_ar: "",
        name_en: "",
        title_ar: "",
        specialty_id: form.specialty_id,
        branch_id: form.branch_id,
        slug: "",
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إضافة الطبيب"),
  });

  // Quick-create specialty inline so a new clinic isn't blocked by missing specialties.
  const [newSpecAr, setNewSpecAr] = useState("");
  const specM = useMutation({
    mutationFn: (name_ar: string) =>
      submitSpec({
        data: {
          slug:
            name_ar
              .trim()
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, "") || "spec-" + Date.now(),
          name_ar: name_ar.trim(),
          name_en: name_ar.trim(),
          is_active: true,
          sort_order: 0,
        },
      }),
    onSuccess: (row: any) => {
      toast.success("تمت إضافة التخصص");
      setNewSpecAr("");
      setForm((f) => ({ ...f, specialty_id: row.id }));
      specialtiesQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إضافة التخصص"),
  });

  const disabled = m.isPending || !form.name_ar;

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        m.mutate({
          name_ar: form.name_ar,
          name_en: form.name_en || null,
          title_ar: form.title_ar || null,
          specialty_id: form.specialty_id || null,
          branch_id: form.branch_id || null,
          slug: form.slug || null,
          languages: [],
          is_active: true,
          sort_order: 0,
        });
      }}
    >
      <Row>
        <Field label="الاسم بالعربية" required>
          <input
            className={inputClass}
            value={form.name_ar}
            onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
          />
        </Field>
        <Field label="الاسم بالإنجليزية">
          <input
            className={inputClass}
            value={form.name_en}
            onChange={(e) => setForm({ ...form, name_en: e.target.value })}
          />
        </Field>
      </Row>
      <Row>
        <Field label="اللقب (د./استشاري…)">
          <input
            className={inputClass}
            value={form.title_ar}
            onChange={(e) => setForm({ ...form, title_ar: e.target.value })}
          />
        </Field>
        <Field label="المعرّف (slug)">
          <input
            className={inputClass}
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="dr-ahmed"
          />
        </Field>
      </Row>
      <Row>
        <Field label="التخصص">
          <select
            className={inputClass}
            value={form.specialty_id}
            onChange={(e) => setForm({ ...form, specialty_id: e.target.value })}
          >
            <option value="">— بدون —</option>
            {(specialtiesQ.data ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name_ar}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الفرع">
          <select
            className={inputClass}
            value={form.branch_id}
            onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
          >
            <option value="">— بدون —</option>
            {(branchesQ.data ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name_ar}
              </option>
            ))}
          </select>
        </Field>
      </Row>

      <div className="rounded-md border border-dashed border-input p-3">
        <div className="mb-2 text-xs text-muted-foreground">إضافة تخصص جديد بسرعة</div>
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={newSpecAr}
            onChange={(e) => setNewSpecAr(e.target.value)}
            placeholder="اسم التخصص"
          />
          <button
            type="button"
            disabled={!newSpecAr.trim() || specM.isPending}
            onClick={() => specM.mutate(newSpecAr)}
            className="whitespace-nowrap rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {specM.isPending ? "جارٍ..." : "إضافة تخصص"}
          </button>
        </div>
      </div>

      <SubmitBar disabled={disabled} pending={m.isPending} label="إضافة الطبيب" />
    </form>
  );
}

/* ---------------- Appointment (موعد) form ---------------- */
function AppointmentForm() {
  const submit = useServerFn(createAppointmentAdmin);
  const branchesQ = useQuery({ queryKey: ["qa", "branches"], queryFn: () => listBranchesAdmin() });
  const specialtiesQ = useQuery({
    queryKey: ["qa", "specs"],
    queryFn: () => listSpecialtiesFull(),
  });
  const doctorsQ = useQuery({ queryKey: ["qa", "doctors"], queryFn: () => listDoctorsAdmin() });

  const [form, setForm] = useState({
    patient_name: "",
    patient_phone: "",
    branch_id: "",
    specialty_id: "",
    doctor_id: "",
    appointment_date: "",
    appointment_time: "",
    reason: "",
  });

  const doctors = (doctorsQ.data ?? []).filter((d: any) => {
    if (form.branch_id && d.branch_id !== form.branch_id) return false;
    if (form.specialty_id && d.specialty_id !== form.specialty_id) return false;
    return d.is_active !== false;
  });

  const m = useMutation({
    mutationFn: (data: any) => submit({ data }),
    onSuccess: () => {
      toast.success("تم إنشاء الموعد وتأكيده");
      setForm({ ...form, patient_name: "", patient_phone: "", reason: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إنشاء الموعد"),
  });

  const disabled =
    m.isPending ||
    !form.patient_name ||
    !form.patient_phone ||
    !form.appointment_date ||
    !form.appointment_time ||
    (!form.doctor_id && !form.specialty_id);

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        m.mutate({
          patient_name: form.patient_name.trim(),
          patient_phone: form.patient_phone.trim(),
          branch_id: form.branch_id || null,
          specialty_id: form.specialty_id || null,
          doctor_id: form.doctor_id || null,
          appointment_date: form.appointment_date,
          appointment_time:
            form.appointment_time.length === 5
              ? form.appointment_time + ":00"
              : form.appointment_time,
          reason: form.reason.trim() || null,
          status: "confirmed",
        });
      }}
    >
      <Row>
        <Field label="اسم المراجع" required>
          <input
            className={inputClass}
            value={form.patient_name}
            onChange={(e) => setForm({ ...form, patient_name: e.target.value })}
          />
        </Field>
        <Field label="رقم الجوال" required>
          <input
            className={inputClass}
            value={form.patient_phone}
            onChange={(e) => setForm({ ...form, patient_phone: e.target.value })}
            placeholder="+9665..."
          />
        </Field>
      </Row>
      <Row>
        <Field label="الفرع">
          <select
            className={inputClass}
            value={form.branch_id}
            onChange={(e) => setForm({ ...form, branch_id: e.target.value, doctor_id: "" })}
          >
            <option value="">— أي فرع —</option>
            {(branchesQ.data ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name_ar}
              </option>
            ))}
          </select>
        </Field>
        <Field label="التخصص">
          <select
            className={inputClass}
            value={form.specialty_id}
            onChange={(e) => setForm({ ...form, specialty_id: e.target.value, doctor_id: "" })}
          >
            <option value="">— أي تخصص —</option>
            {(specialtiesQ.data ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name_ar}
              </option>
            ))}
          </select>
        </Field>
      </Row>
      <Field label="الطبيب">
        <select
          className={inputClass}
          value={form.doctor_id}
          onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
        >
          <option value="">
            — {form.specialty_id ? "أي طبيب من هذا التخصص" : "اختر طبيبًا"} —
          </option>
          {doctors.map((d: any) => (
            <option key={d.id} value={d.id}>
              {d.name_ar}
            </option>
          ))}
        </select>
      </Field>
      <Row>
        <Field label="التاريخ" required>
          <input
            type="date"
            className={inputClass}
            value={form.appointment_date}
            onChange={(e) => setForm({ ...form, appointment_date: e.target.value })}
          />
        </Field>
        <Field label="الوقت" required>
          <input
            type="time"
            className={inputClass}
            value={form.appointment_time}
            onChange={(e) => setForm({ ...form, appointment_time: e.target.value })}
          />
        </Field>
      </Row>
      <Field label="السبب / ملاحظات">
        <textarea
          className={inputClass + " min-h-[72px]"}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
      </Field>

      <p className="text-xs text-muted-foreground">
        سيتم رفض الوقت تلقائيًا إذا كان محجوزًا لدى الطبيب نفسه (قيد فريد على مستوى قاعدة البيانات).
      </p>

      <SubmitBar disabled={disabled} pending={m.isPending} label="إنشاء الموعد" />
    </form>
  );
}

/* ---------------- Shared UI helpers ---------------- */

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary";

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      <div
        className={
          error
            ? "[&_input]:border-destructive [&_select]:border-destructive [&_textarea]:border-destructive"
            : ""
        }
      >
        {children}
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </label>
  );
}

function SubmitBar({
  disabled,
  pending,
  label,
}: {
  disabled: boolean;
  pending: boolean;
  label: string;
}) {
  return (
    <div className="mt-2 flex justify-end">
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "جارٍ الحفظ..." : label}
      </button>
    </div>
  );
}

/* ---------------- CSV Import panel ---------------- */

type ImportKind = "branch" | "doctor" | "appointment";

type RowStatus = {
  index: number;
  ok: boolean;
  message: string;
  data: Record<string, string>;
};

const IMPORT_TEMPLATES: Record<ImportKind, { headers: string[]; sample: string[]; hint: string }> =
  {
    branch: {
      headers: ["slug", "name_ar", "name_en", "city_ar", "phone", "email", "address_ar"],
      sample: [
        "jeddah-main",
        "فرع جدة الرئيسي",
        "Jeddah Main",
        "جدة",
        "+96612345678",
        "info@example.com",
        "شارع الملك عبدالعزيز",
      ],
      hint: "الأعمدة المطلوبة: slug, name_ar, name_en. الباقي اختياري.",
    },
    doctor: {
      headers: ["name_ar", "name_en", "title_ar", "specialty", "branch", "slug"],
      sample: ["د. أحمد علي", "Dr. Ahmed Ali", "استشاري", "أسنان", "جدة الرئيسي", "dr-ahmed-ali"],
      hint: "specialty و branch يقبلان الاسم (سيتم البحث تلقائيًا). name_ar مطلوب.",
    },
    appointment: {
      headers: [
        "patient_name",
        "patient_phone",
        "branch",
        "specialty",
        "doctor",
        "appointment_date",
        "appointment_time",
        "reason",
      ],
      sample: [
        "محمد سالم",
        "+966500000000",
        "جدة الرئيسي",
        "أسنان",
        "د. أحمد علي",
        "2026-07-20",
        "10:30",
        "فحص دوري",
      ],
      hint: "التنسيقات: التاريخ YYYY-MM-DD، الوقت HH:MM. حقول doctor/specialty/branch تُطابَق بالاسم.",
    },
  };

function parseCsv(text: string): Record<string, string>[] {
  const clean = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!clean) return [];
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else field += c;
    }
  }
  cur.push(field);
  rows.push(cur);
  const headers = rows.shift()!.map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h, i) => {
        o[h] = (r[i] ?? "").trim();
      });
      return o;
    });
}

function toCsvTemplate(kind: ImportKind): string {
  const t = IMPORT_TEMPLATES[kind];
  return (
    "\uFEFF" +
    t.headers.join(",") +
    "\n" +
    t.sample.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",") +
    "\n"
  );
}

function downloadTemplate(kind: ImportKind) {
  const blob = new Blob([toCsvTemplate(kind)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function findByName<T extends { id: string; name_ar?: string | null; name_en?: string | null }>(
  list: T[] | undefined,
  needle: string,
): string | null {
  if (!list || !needle) return null;
  const n = needle.trim().toLowerCase();
  const hit = list.find(
    (x) =>
      (x.name_ar ?? "").trim().toLowerCase() === n || (x.name_en ?? "").trim().toLowerCase() === n,
  );
  return hit?.id ?? null;
}

function ImportPanel() {
  const submitBranch = useServerFn(createBranch);
  const submitDoctor = useServerFn(createDoctor);
  const submitAppt = useServerFn(createAppointmentAdmin);
  const branchesQ = useQuery({ queryKey: ["qa", "branches"], queryFn: () => listBranchesAdmin() });
  const specialtiesQ = useQuery({
    queryKey: ["qa", "specs"],
    queryFn: () => listSpecialtiesFull(),
  });
  const doctorsQ = useQuery({ queryKey: ["qa", "doctors"], queryFn: () => listDoctorsAdmin() });

  const [kind, setKind] = useState<ImportKind>("branch");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RowStatus[]>([]);

  const template = IMPORT_TEMPLATES[kind];

  const onFile = async (file: File) => {
    setFileName(file.name);
    setResults([]);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setRows(parsed);
      if (parsed.length === 0) toast.error("الملف فارغ أو غير صالح");
      else toast.success(`تم قراءة ${parsed.length} سطرًا`);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر قراءة الملف");
    }
  };

  const runImport = async () => {
    if (rows.length === 0) return;
    setRunning(true);
    const out: RowStatus[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (kind === "branch") {
          await submitBranch({
            data: {
              slug: r.slug,
              name_ar: r.name_ar,
              name_en: r.name_en,
              city_ar: r.city_ar || null,
              phone: r.phone || null,
              email: r.email || null,
              address_ar: r.address_ar || null,
            } as any,
          });
        } else if (kind === "doctor") {
          const specialty_id = r.specialty
            ? findByName(specialtiesQ.data as any, r.specialty)
            : null;
          const branch_id = r.branch ? findByName(branchesQ.data as any, r.branch) : null;
          if (r.specialty && !specialty_id) throw new Error(`تخصص غير موجود: ${r.specialty}`);
          if (r.branch && !branch_id) throw new Error(`فرع غير موجود: ${r.branch}`);
          await submitDoctor({
            data: {
              name_ar: r.name_ar,
              name_en: r.name_en || null,
              title_ar: r.title_ar || null,
              specialty_id,
              branch_id,
              slug: r.slug || null,
              languages: [],
              is_active: true,
              sort_order: 0,
            } as any,
          });
        } else {
          const specialty_id = r.specialty
            ? findByName(specialtiesQ.data as any, r.specialty)
            : null;
          const branch_id = r.branch ? findByName(branchesQ.data as any, r.branch) : null;
          const doctor_id = r.doctor ? findByName(doctorsQ.data as any, r.doctor) : null;
          if (r.specialty && !specialty_id) throw new Error(`تخصص غير موجود: ${r.specialty}`);
          if (r.branch && !branch_id) throw new Error(`فرع غير موجود: ${r.branch}`);
          if (r.doctor && !doctor_id) throw new Error(`طبيب غير موجود: ${r.doctor}`);
          const time =
            r.appointment_time?.length === 5 ? r.appointment_time + ":00" : r.appointment_time;
          await submitAppt({
            data: {
              patient_name: r.patient_name,
              patient_phone: r.patient_phone,
              branch_id,
              specialty_id,
              doctor_id,
              appointment_date: r.appointment_date,
              appointment_time: time,
              reason: r.reason || null,
              status: "confirmed",
            } as any,
          });
        }
        out.push({ index: i + 1, ok: true, message: "تمت الإضافة", data: r });
      } catch (e: any) {
        out.push({ index: i + 1, ok: false, message: e?.message ?? "فشل", data: r });
      }
      setResults([...out]);
    }
    setRunning(false);
    const okCount = out.filter((x) => x.ok).length;
    const failCount = out.length - okCount;
    if (failCount === 0) toast.success(`تم استيراد ${okCount} سطرًا بنجاح`);
    else toast.error(`نجح ${okCount} • فشل ${failCount}`);
    if (kind === "branch") branchesQ.refetch();
    if (kind === "doctor") doctorsQ.refetch();
  };

  return (
    <div className="grid gap-4">
      <div>
        <div className="mb-2 text-sm font-medium">نوع البيانات</div>
        <div className="grid grid-cols-3 gap-2">
          {(["branch", "doctor", "appointment"] as ImportKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setRows([]);
                setResults([]);
                setFileName("");
              }}
              className={
                "rounded-md border px-3 py-2 text-sm " +
                (kind === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-muted")
              }
            >
              {k === "branch" ? "عيادات" : k === "doctor" ? "أطباء" : "مواعيد"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-dashed border-input bg-muted/30 p-3 text-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-medium">قالب CSV</span>
          <button
            type="button"
            onClick={() => downloadTemplate(kind)}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            تنزيل النموذج
          </button>
        </div>
        <div className="mb-2 text-xs text-muted-foreground">{template.hint}</div>
        <code className="block overflow-x-auto rounded bg-background p-2 text-xs">
          {template.headers.join(", ")}
        </code>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground">ملف CSV</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
        />
        {fileName && (
          <span className="text-xs text-muted-foreground">
            الملف: {fileName} — {rows.length} سطر
          </span>
        )}
      </label>

      {rows.length > 0 && (
        <div className="rounded-md border border-input">
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">#</th>
                  {template.headers.map((h) => (
                    <th key={h} className="p-2 text-start">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-t border-input">
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    {template.headers.map((h) => (
                      <td key={h} className="p-2">
                        {r[h] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 20 && (
            <div className="border-t border-input p-2 text-xs text-muted-foreground">
              عرض أول 20 سطرًا من {rows.length}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={running || rows.length === 0}
          onClick={runImport}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {running
            ? `جارٍ الاستيراد... (${results.length}/${rows.length})`
            : `استيراد ${rows.length} سطر`}
        </button>
      </div>

      {results.length > 0 && (
        <div className="rounded-md border border-input">
          <div className="border-b border-input bg-muted/40 p-2 text-sm">
            نتائج: نجح {results.filter((r) => r.ok).length} • فشل{" "}
            {results.filter((r) => !r.ok).length}
          </div>
          <div className="max-h-64 overflow-auto">
            <ul className="divide-y divide-input">
              {results.map((r) => (
                <li key={r.index} className="flex items-start gap-2 p-2 text-xs">
                  {r.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span className="text-muted-foreground">سطر {r.index}:</span>
                  <span className={r.ok ? "" : "text-destructive"}>{r.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
