import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { toast } from "sonner";
import {
  Check,
  CalendarPlus,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Stethoscope,
  CalendarClock,
  User,
  FileCheck,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { friendlyInsertError } from "@/lib/insert-errors";
import type { BranchSpecialty } from "@/lib/branches.functions";

const NAME_MIN = 2,
  NAME_MAX = 120;
const PHONE_MAX = 32;
const REASON_MAX = 500;
const PHONE_ALLOWED_RE = /^[+0-9\s\-()]+$/;
const NAME_RE = /^[\p{L}\s'’\-.]+$/u;

const REMINDER_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 15, label: "قبل 15 دقيقة" },
  { minutes: 30, label: "قبل 30 دقيقة" },
  { minutes: 60, label: "قبل ساعة" },
  { minutes: 120, label: "قبل ساعتين" },
  { minutes: 240, label: "قبل 4 ساعات" },
  { minutes: 1440, label: "قبل يوم" },
  { minutes: 2880, label: "قبل يومين" },
];

const nameSchema = z
  .string()
  .trim()
  .min(NAME_MIN, "الاسم قصير جدًا (حرفان على الأقل)")
  .max(NAME_MAX, `الاسم طويل جدًا (الحد الأقصى ${NAME_MAX} حرفًا)`)
  .regex(NAME_RE, "الاسم يجب أن يحتوي على أحرف فقط")
  .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, "الرجاء إدخال الاسم الأول والأخير");

const phoneSchema = z
  .string()
  .trim()
  .min(1, "رقم الجوال مطلوب")
  .max(PHONE_MAX, "رقم الجوال طويل جدًا")
  .regex(PHONE_ALLOWED_RE, "رقم غير صالح — الأرقام فقط")
  .refine((v) => {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  }, "رقم الجوال يجب أن يتكوّن من 9 إلى 15 رقمًا");

const reasonSchema = z
  .string()
  .trim()
  .max(REASON_MAX, `الحد الأقصى ${REASON_MAX} حرفًا`)
  .optional()
  .or(z.literal(""));

const schema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  gender: z.enum(["male", "female"], { message: "اختر الجنس" }),
  reason: reasonSchema,
});

type FieldErrors = Partial<Record<"name" | "phone" | "gender" | "reason", string>>;

function computeFieldErrors(form: {
  name: string;
  phone: string;
  gender: string;
  reason: string;
}): FieldErrors {
  const errs: FieldErrors = {};
  const n = nameSchema.safeParse(form.name);
  if (!n.success) errs.name = n.error.issues[0]?.message;
  const p = phoneSchema.safeParse(form.phone);
  if (!p.success) errs.phone = p.error.issues[0]?.message;
  if (form.gender !== "male" && form.gender !== "female") errs.gender = "اختر الجنس";
  const r = reasonSchema.safeParse(form.reason);
  if (!r.success) errs.reason = r.error.issues[0]?.message;
  return errs;
}

function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c!.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const STEPS = [
  { id: "service", label: "الخدمة والطبيب", icon: Stethoscope },
  { id: "datetime", label: "التاريخ والوقت", icon: CalendarClock },
  { id: "patient", label: "بيانات المريض", icon: User },
  { id: "confirm", label: "التأكيد", icon: FileCheck },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function stepIndex(id: StepId) {
  return STEPS.findIndex((s) => s.id === id);
}

function validateStep(
  id: StepId,
  state: {
    specialtyId: string;
    doctorId: string;
    date: string;
    time: string;
    form: { name: string; phone: string; gender: string; reason: string };
  },
): string | null {
  switch (id) {
    case "service":
      if (!state.specialtyId) return "اختر التخصص أولاً";
      if (!state.doctorId) return "اختر الطبيب";
      return null;
    case "datetime":
      if (!state.specialtyId || !state.doctorId) return " أكمل الخطوة السابقة";
      if (!state.date) return "اختر تاريخ الموعد";
      if (!state.time) return "اختر وقت الموعد";
      return null;
    case "patient":
      if (!state.specialtyId || !state.doctorId || !state.date || !state.time)
        return " أكمل الخطوات السابقة";
      const errs = computeFieldErrors(state.form);
      const firstKey = (["name", "phone", "gender", "reason"] as const).find((k) => errs[k]);
      if (firstKey) return errs[firstKey] ?? "بيانات غير صالحة";
      return null;
    case "confirm":
      return null;
    default:
      return null;
  }
}

type Props = {
  branchId: string;
  branchNameAr: string;
  specialties: BranchSpecialty[];
  preselectedSpecialtyId?: string | null;
  preselectToken?: number;
};

export function BranchBookingForm({
  branchId,
  branchNameAr,
  specialties,
  preselectedSpecialtyId,
  preselectToken,
}: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<StepId>("service");
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [doctorId, setDoctorId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    gender: "male" as "male" | "female",
    reason: "",
  });
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([1440, 120]);
  const [touched, setTouched] = useState<Record<"name" | "phone" | "gender" | "reason", boolean>>({
    name: false,
    phone: false,
    gender: false,
    reason: false,
  });
  const [showAllPatientErrors, setShowAllPatientErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fieldErrors = useMemo(() => computeFieldErrors(form), [form]);
  const showErr = (k: "name" | "phone" | "gender" | "reason") =>
    (touched[k] || showAllPatientErrors) && fieldErrors[k];

  const draftKey = `booking-draft:${branchId}`;
  const draftHydrated = useRef(false);
  const [draftResumed, setDraftResumed] = useState(false);

  // Restore draft from localStorage on mount (client-only)
  useEffect(() => {
    if (draftHydrated.current) return;
    draftHydrated.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        step?: StepId;
        specialtyId?: string;
        doctorId?: string;
        date?: string;
        time?: string;
        form?: { name?: string; phone?: string; gender?: "male" | "female"; reason?: string };
        reminderOffsets?: number[];
        savedAt?: number;
      };
      // expire drafts older than 7 days
      if (d.savedAt && Date.now() - d.savedAt > 7 * 24 * 60 * 60 * 1000) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      let restored = false;
      if (d.specialtyId && specialties.some((s) => s.id === d.specialtyId)) {
        setSpecialtyId(d.specialtyId);
        restored = true;
      }
      if (d.doctorId) {
        setDoctorId(d.doctorId);
        restored = true;
      }
      if (d.date) {
        setDate(d.date);
        restored = true;
      }
      if (d.time) {
        setTime(d.time);
        restored = true;
      }
      if (d.form) {
        setForm((prev) => ({
          name: d.form?.name ?? prev.name,
          phone: d.form?.phone ?? prev.phone,
          gender: d.form?.gender ?? prev.gender,
          reason: d.form?.reason ?? prev.reason,
        }));
        if (d.form.name || d.form.phone || d.form.reason) restored = true;
      }
      if (Array.isArray(d.reminderOffsets)) {
        const cleaned = Array.from(
          new Set(d.reminderOffsets.filter((n) => Number.isFinite(n) && n >= 1 && n <= 10080)),
        ).sort((a, b) => b - a);
        if (cleaned.length > 0) setReminderOffsets(cleaned);
      }
      if (d.step && STEPS.some((s) => s.id === d.step)) {
        setStep(d.step);
      }
      if (restored) setDraftResumed(true);
    } catch {
      // ignore corrupted drafts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft whenever meaningful state changes
  useEffect(() => {
    if (!draftHydrated.current) return;
    if (typeof window === "undefined") return;
    const hasAny =
      !!specialtyId ||
      !!doctorId ||
      !!date ||
      !!time ||
      !!form.name ||
      !!form.phone ||
      !!form.reason;
    try {
      if (!hasAny) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({
          step,
          specialtyId,
          doctorId,
          date,
          time,
          form,
          reminderOffsets,
          savedAt: Date.now(),
        }),
      );
    } catch {
      // ignore quota / privacy errors
    }
  }, [draftKey, step, specialtyId, doctorId, date, time, form, reminderOffsets]);

  const clearDraft = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
    }
    setDraftResumed(false);
  };

  useEffect(() => {
    if (!preselectedSpecialtyId) return;
    if (!specialties.some((s) => s.id === preselectedSpecialtyId)) return;
    setSpecialtyId(preselectedSpecialtyId);
    setDoctorId("");
    setDate("");
    setTime("");
    setStep("service");
    setDraftResumed(false);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [preselectedSpecialtyId, preselectToken, specialties]);

  const { data: doctors } = useQuery({
    queryKey: ["branch-doctors", branchId, specialtyId],
    enabled: !!specialtyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, name_ar, name_en, specialty_id")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .eq("specialty_id", specialtyId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: availability } = useQuery({
    queryKey: ["branch-availability", doctorId],
    enabled: !!doctorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability")
        .select("*")
        .eq("doctor_id", doctorId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const availableDates = useMemo(() => {
    if (!availability?.length) return [];
    const wds = new Set(availability.map((a) => a.weekday));
    const out: { date: string; label: string; weekday: string }[] = [];
    const now = new Date();
    const weekdayLabels = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    for (let i = 0; i < 21 && out.length < 14; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      if (wds.has(d.getDay())) {
        out.push({
          date: d.toISOString().slice(0, 10),
          label: `${d.getDate()}/${d.getMonth() + 1}`,
          weekday: weekdayLabels[d.getDay()],
        });
      }
    }
    return out;
  }, [availability]);

  const availableTimes = useMemo(() => {
    if (!date || !availability) return [];
    const wd = new Date(date).getDay();
    const slots = new Set<string>();
    availability
      .filter((a) => a.weekday === wd)
      .forEach((a) => {
        const [sh, sm] = a.start_time.split(":").map(Number);
        const [eh, em] = a.end_time.split(":").map(Number);
        let m = sh * 60 + sm;
        const end = eh * 60 + em;
        while (m + a.slot_minutes <= end) {
          slots.add(
            `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
          );
          m += a.slot_minutes;
        }
      });
    return Array.from(slots).sort();
  }, [date, availability]);

  const selectedSpecialty = useMemo(
    () => specialties.find((s) => s.id === specialtyId) || null,
    [specialties, specialtyId],
  );
  const selectedDoctor = useMemo(
    () => (doctors ?? []).find((d) => d.id === doctorId) || null,
    [doctors, doctorId],
  );

  const stepError = validateStep(step, { specialtyId, doctorId, date, time, form });

  const nextStep = () => {
    const err = validateStep(step, { specialtyId, doctorId, date, time, form });
    if (err) {
      if (step === "patient") setShowAllPatientErrors(true);
      toast.error(err);
      return;
    }
    const idx = stepIndex(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].id);
    }
  };

  const prevStep = () => {
    const idx = stepIndex(step);
    if (idx > 0) {
      setStep(STEPS[idx - 1].id);
    }
  };

  const goToStep = (id: StepId) => {
    const targetIdx = stepIndex(id);
    const currentIdx = stepIndex(step);
    if (targetIdx > currentIdx) {
      const err = validateStep(step, { specialtyId, doctorId, date, time, form });
      if (err) {
        toast.error(err);
        return;
      }
    }
    setStep(id);
  };

  const submit = async () => {
    const err = validateStep("patient", { specialtyId, doctorId, date, time, form });
    if (err) {
      setSubmitError(err);
      toast.error(err);
      return;
    }
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "بيانات غير صالحة";
      setSubmitError(msg);
      return toast.error(msg);
    }
    const v = parsed.data;
    setSubmitting(true);
    setSubmitError(null);
    const id = randomId();
    try {
      const { error } = await supabase.from("appointments").insert({
        id,
        patient_name: v.name,
        patient_phone: v.phone,
        gender: v.gender,
        branch_id: branchId,
        specialty_id: specialtyId,
        doctor_id: doctorId,
        appointment_date: date,
        appointment_time: time,
        reason: v.reason || null,
        reminder_24h: reminderOffsets.includes(1440),
        reminder_2h: reminderOffsets.includes(120),
        reminder_offsets_minutes:
          reminderOffsets.length > 0
            ? [...new Set(reminderOffsets)].sort((a, b) => b - a)
            : [1440, 120],
      });
      if (error) {
        const msg = friendlyInsertError(error);
        setSubmitError(msg);
        toast.error(msg);
        return;
      }
      toast.success("تم إرسال الحجز بنجاح");
      clearDraft();
      const ref = id.slice(0, 8).toUpperCase();
      navigate({
        to: "/booking-confirmation",
        search: { ref, phone: v.phone, branch: branchNameAr },
      });
    } catch (e) {
      const msg =
        e instanceof Error && e.message
          ? e.message
          : "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.";
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSpecialtyId("");
    setDoctorId("");
    setDate("");
    setTime("");
    setForm({ name: "", phone: "", gender: "male", reason: "" });
    setReminderOffsets([1440, 120]);
    setTouched({ name: false, phone: false, gender: false, reason: false });
    setShowAllPatientErrors(false);
    setSubmitError(null);
    setStep("service");
    clearDraft();
  };

  const currentStepIdx = stepIndex(step);
  const progress = ((currentStepIdx + 1) / STEPS.length) * 100;

  const inputCls =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div ref={rootRef} className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <h3 className="flex items-center gap-2 text-lg font-bold mb-4">
        <CalendarPlus className="h-5 w-5 text-primary" /> احجز موعد في {branchNameAr}
      </h3>

      {/* Stepper */}
      <nav aria-label="مراحل الحجز" className="mb-6">
        <div className="relative mb-2">
          <div className="absolute top-1/2 -translate-y-1/2 start-0 end-0 h-1 rounded-full bg-muted" />
          <div
            className="absolute top-1/2 -translate-y-1/2 start-0 h-1 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
            aria-hidden
          />
          <ol className="relative z-10 flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const status =
                i < currentStepIdx ? "done" : i === currentStepIdx ? "active" : "pending";
              const isClickable = i <= currentStepIdx || stepIndex(s.id) < currentStepIdx;
              return (
                <li key={s.id} className="flex flex-col items-center gap-1.5">
                  <button
                    ref={(el) => {
                      stepRefs.current[i] = el;
                    }}
                    type="button"
                    onClick={() => isClickable && goToStep(s.id)}
                    disabled={!isClickable}
                    aria-current={status === "active" ? "step" : undefined}
                    aria-label={`الخطوة ${i + 1}: ${s.label}${status === "done" ? " — مكتملة" : ""}`}
                    className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      status === "active"
                        ? "border-primary bg-primary text-primary-foreground"
                        : status === "done"
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-muted bg-background text-muted-foreground"
                    } ${isClickable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                  >
                    {status === "done" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </button>
                  <span
                    className={`text-[10px] font-medium ${
                      status === "active"
                        ? "text-primary"
                        : status === "done"
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="text-xs text-muted-foreground text-center" aria-live="polite">
          الخطوة {currentStepIdx + 1} من {STEPS.length}: {STEPS[currentStepIdx].label}
        </p>
      </nav>

      {draftResumed && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs"
        >
          <div className="flex items-center gap-2 text-foreground">
            <RotateCcw className="h-3.5 w-3.5 text-primary" />
            <span>تم استئناف مسودة الحجز المحفوظة سابقاً.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraftResumed(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              إخفاء
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={resetForm}
              className="font-semibold text-destructive hover:underline"
            >
              بدء من جديد
            </button>
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="min-h-[200px]">
        {step === "service" && (
          <div className="grid gap-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-semibold mb-1">التخصص</label>
              {specialties.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  لا توجد تخصصات متاحة في هذا الفرع حالياً.
                </p>
              ) : (
                <select
                  className={inputCls}
                  value={specialtyId}
                  onChange={(e) => {
                    setSpecialtyId(e.target.value);
                    setDoctorId("");
                    setDate("");
                    setTime("");
                  }}
                >
                  <option value="">— اختر تخصصاً —</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_ar}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {specialtyId && (
              <div>
                <label className="block text-xs font-semibold mb-1">الطبيب</label>
                <select
                  className={inputCls}
                  value={doctorId}
                  onChange={(e) => {
                    setDoctorId(e.target.value);
                    setDate("");
                    setTime("");
                  }}
                >
                  <option value="">— اختر طبيباً —</option>
                  {(doctors ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name_ar}
                    </option>
                  ))}
                </select>
                {doctors && doctors.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    لا يوجد أطباء متاحون لهذا التخصص في الفرع.
                  </p>
                )}
              </div>
            )}

            {stepError && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-4 w-4" />
                {stepError}
              </div>
            )}
          </div>
        )}

        {step === "datetime" && (
          <div className="grid gap-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-xs font-semibold mb-1">التاريخ</label>
              {availableDates.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد مواعيد متاحة قريباً.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableDates.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => {
                        setDate(d.date);
                        setTime("");
                      }}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        date === d.date
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <span dir="ltr">{d.label}</span>
                      <span className="block text-[10px] text-muted-foreground">{d.weekday}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {date && (
              <div>
                <label className="block text-xs font-semibold mb-1">الوقت</label>
                {availableTimes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد أوقات متاحة في هذا اليوم.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableTimes.map((tm) => (
                      <button
                        key={tm}
                        type="button"
                        dir="ltr"
                        onClick={() => setTime(tm)}
                        className={`rounded-md border px-3 py-1.5 text-sm ${
                          time === tm
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {tm}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {stepError && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-4 w-4" />
                {stepError}
              </div>
            )}
          </div>
        )}

        {step === "patient" && (
          <div className="grid gap-3 sm:grid-cols-2 animate-in fade-in duration-200">
            <div className="sm:col-span-2">
              <label htmlFor="bk-name" className="block text-xs font-semibold mb-1">
                الاسم الكامل <span className="text-destructive">*</span>
              </label>
              <input
                id="bk-name"
                className={`${inputCls} ${showErr("name") ? "border-destructive focus:ring-destructive/30" : ""}`}
                value={form.name}
                maxLength={NAME_MAX}
                autoComplete="name"
                required
                aria-required="true"
                aria-invalid={showErr("name") ? true : undefined}
                aria-describedby={showErr("name") ? "bk-name-err" : "bk-name-hint"}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="مثال: محمد أحمد"
              />
              {showErr("name") ? (
                <p
                  id="bk-name-err"
                  className="mt-1 flex items-center gap-1 text-xs text-destructive"
                >
                  <AlertCircle className="h-3.5 w-3.5" /> {fieldErrors.name}
                </p>
              ) : (
                <p id="bk-name-hint" className="mt-1 text-[11px] text-muted-foreground">
                  الاسم الأول والأخير على الأقل.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="bk-phone" className="block text-xs font-semibold mb-1">
                رقم الجوال <span className="text-destructive">*</span>
              </label>
              <input
                id="bk-phone"
                dir="ltr"
                inputMode="tel"
                type="tel"
                autoComplete="tel"
                required
                aria-required="true"
                aria-invalid={showErr("phone") ? true : undefined}
                aria-describedby={showErr("phone") ? "bk-phone-err" : "bk-phone-hint"}
                className={`${inputCls} ${showErr("phone") ? "border-destructive focus:ring-destructive/30" : ""}`}
                value={form.phone}
                maxLength={PHONE_MAX}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                placeholder="05xxxxxxxx"
              />
              {showErr("phone") ? (
                <p
                  id="bk-phone-err"
                  className="mt-1 flex items-center gap-1 text-xs text-destructive"
                >
                  <AlertCircle className="h-3.5 w-3.5" /> {fieldErrors.phone}
                </p>
              ) : (
                <p id="bk-phone-hint" className="mt-1 text-[11px] text-muted-foreground">
                  أرقام فقط، من 9 إلى 15 رقمًا.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="bk-gender" className="block text-xs font-semibold mb-1">
                الجنس <span className="text-destructive">*</span>
              </label>
              <select
                id="bk-gender"
                className={`${inputCls} ${showErr("gender") ? "border-destructive focus:ring-destructive/30" : ""}`}
                value={form.gender}
                aria-invalid={showErr("gender") ? true : undefined}
                aria-describedby={showErr("gender") ? "bk-gender-err" : undefined}
                onChange={(e) => setForm({ ...form, gender: e.target.value as "male" | "female" })}
                onBlur={() => setTouched((t) => ({ ...t, gender: true }))}
              >
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
              {showErr("gender") && (
                <p
                  id="bk-gender-err"
                  className="mt-1 flex items-center gap-1 text-xs text-destructive"
                >
                  <AlertCircle className="h-3.5 w-3.5" /> {fieldErrors.gender}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bk-reason" className="block text-xs font-semibold mb-1">
                سبب الزيارة <span className="text-muted-foreground font-normal">(اختياري)</span>
              </label>
              <textarea
                id="bk-reason"
                className={`${inputCls} ${showErr("reason") ? "border-destructive focus:ring-destructive/30" : ""}`}
                rows={2}
                maxLength={REASON_MAX}
                value={form.reason}
                aria-invalid={showErr("reason") ? true : undefined}
                aria-describedby={showErr("reason") ? "bk-reason-err" : "bk-reason-count"}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, reason: true }))}
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                {showErr("reason") ? (
                  <p
                    id="bk-reason-err"
                    className="flex items-center gap-1 text-xs text-destructive"
                  >
                    <AlertCircle className="h-3.5 w-3.5" /> {fieldErrors.reason}
                  </p>
                ) : (
                  <span />
                )}
                <span id="bk-reason-count" className="text-[11px] text-muted-foreground" dir="ltr">
                  {form.reason.length}/{REASON_MAX}
                </span>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="grid gap-4 animate-in fade-in duration-200">
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">الفرع</span>
                <span className="font-medium">{branchNameAr}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">التخصص</span>
                <span className="font-medium">{selectedSpecialty?.name_ar ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">الطبيب</span>
                <span className="font-medium">{selectedDoctor?.name_ar ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">التاريخ</span>
                <span className="font-medium" dir="ltr">
                  {date}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">الوقت</span>
                <span className="font-medium" dir="ltr">
                  {time}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">المريض</span>
                <span className="font-medium">{form.name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">الجوال</span>
                <span className="font-medium" dir="ltr">
                  {form.phone}
                </span>
              </div>
              {form.reason && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">سبب الزيارة</span>
                  <span className="font-medium">{form.reason}</span>
                </div>
              )}
            </div>

            {/* Reminder times chooser */}
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">
                أوقات التذكير قبل الموعد
              </legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {REMINDER_PRESETS.map((p) => {
                  const active = reminderOffsets.includes(p.minutes);
                  return (
                    <button
                      key={p.minutes}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setReminderOffsets((prev) =>
                          prev.includes(p.minutes)
                            ? prev.filter((n) => n !== p.minutes)
                            : [...prev, p.minutes].sort((a, b) => b - a),
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {reminderOffsets.length === 0
                  ? "لن يتم إرسال أي تذكير — يفضّل اختيار وقت واحد على الأقل."
                  : `سنرسل ${reminderOffsets.length} ${
                      reminderOffsets.length === 1 ? "تذكيرًا" : "تذكيرات"
                    } قبل الموعد.`}
              </p>
            </fieldset>

            {submitError && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold mb-0.5">تعذّر إرسال الحجز</p>
                  <p className="text-xs opacity-90">{submitError}</p>
                </div>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="text-xs font-semibold underline hover:no-underline disabled:opacity-50"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              aria-busy={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {submitting ? "جارٍ إرسال الحجز…" : submitError ? "إعادة إرسال الحجز" : "تأكيد الحجز"}
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={prevStep}
          disabled={currentStepIdx === 0 || submitting}
          className="inline-flex items-center gap-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ChevronRight className="h-4 w-4" /> السابق
        </button>

        <button
          type="button"
          onClick={resetForm}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw className="h-3.5 w-3.5" /> إعادة البدء
        </button>

        {step !== "confirm" && (
          <button
            type="button"
            onClick={nextStep}
            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            التالي <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
