/**
 * معالج حجز جديد /reservations/new — تجربة مبسّطة على 5 خطوات
 *
 * 1) اختيار الطبيب (يُمرَّر من ?doctor=<id> من /reservations)
 * 2) اختيار التاريخ (تقويم شهري مع تلوين الأيام المتاحة)
 * 3) اختيار الوقت (شبكة الأوقات)
 * 4) بيانات المريض
 * 5) التأكيد + رقم المرجع
 *
 * يستهلك APIs الحالية:
 *   GET  /api/public/book/month-availability
 *   GET  /api/public/book/availability
 *   POST /api/public/book/create
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useState } from "react";
import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";
import {
  ArrowRight, ArrowLeft, Check, User, Calendar as CalendarIcon,
  Clock, ClipboardCheck, MapPin, Stethoscope, Loader2, CheckCircle2, Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { riyadhTodayIso } from "@/lib/riyadh-date";
import {
  NAME_MIN, NAME_MAX, PHONE_MIN, PHONE_MAX, REASON_MAX,
  SA_PHONE_RE, NAME_RE, SA_NID_RE,
} from "@/lib/booking-limits";
import { useSessionProfile } from "@/hooks/use-session-profile";

const searchSchema = z.object({
  doctor: z.string().optional(),
  step: fallback(z.number().int().min(1).max(5), 1).default(1),
});

export const Route = createFileRoute("/reservations/new")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "حجز موعد جديد | مجمع باعشن الطبي" },
      { name: "description", content: "احجز موعدك في مجمع باعشن الطبي في 5 خطوات سريعة." },
      { property: "og:title", content: "حجز موعد جديد — مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewReservationPage,
});

/* ---------------- State ---------------- */

type Patient = {
  name: string; phone: string; nationalId: string;
  gender: "male" | "female" | null; reason: string;
};

type Insurance = {
  useInsurance: boolean;
  providerId: string | null;
  policyNumber: string;
  memberId: string;
  verify: null | {
    eligible: boolean;
    reason: string;
    message: string;
    coverage_percent: number | null;
    consultation_fee: number | null;
    covered_amount: number | null;
    estimated_cost: number | null;
    patient_share: number | null;
  };
};

const INITIAL_INSURANCE: Insurance = {
  useInsurance: false,
  providerId: null,
  policyNumber: "",
  memberId: "",
  verify: null,
};

type State = {
  step: number;
  doctorId: string | null;
  date: string | null;
  time: string | null;
  patient: Patient;
  insurance: Insurance;
  result: { ok: true; reference: string } | null;
};

const INITIAL: State = {
  step: 1, doctorId: null, date: null, time: null,
  patient: { name: "", phone: "", nationalId: "", gender: null, reason: "" },
  insurance: INITIAL_INSURANCE,
  result: null,
};

type Action =
  | { t: "set"; p: Partial<State> }
  | { t: "patient"; p: Partial<Patient> }
  | { t: "insurance"; p: Partial<Insurance> }
  | { t: "goto"; step: number };

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "set": return { ...s, ...a.p };
    case "patient": return { ...s, patient: { ...s.patient, ...a.p } };
    case "insurance": return { ...s, insurance: { ...s.insurance, ...a.p } };
    case "goto": return { ...s, step: Math.max(1, Math.min(5, a.step)) };
  }
}

/* ---------------- Data ---------------- */

type Doctor = {
  id: string; name_ar: string; title_ar: string | null; photo_url: string | null;
  specialty_id: string; specialty_name_ar: string | null;
  branch_id: string | null; branch_name_ar: string | null;
  booking_enabled: boolean;
};

async function fetchDoctors(): Promise<Doctor[]> {
  const { data, error } = await supabase.rpc("list_public_doctors", { _limit: 300, _offset: 0 });
  if (error) throw error;
  return (data ?? []) as unknown as Doctor[];
}

async function fetchMonthAvailability(doctorId: string, year: number, month: number) {
  const p = new URLSearchParams({ doctor_id: doctorId, year: String(year), month: String(month) });
  const res = await fetch(`/api/public/book/month-availability?${p}`);
  const j = await res.json();
  return (j?.dates ?? []) as string[];
}

async function fetchDayAvailability(doctorId: string, date: string) {
  const p = new URLSearchParams({ doctor_id: doctorId, date });
  const res = await fetch(`/api/public/book/availability?${p}`);
  const j = await res.json();
  return { times: (j?.times ?? []) as string[], booked: (j?.booked ?? []) as string[] };
}

async function submitBooking(payload: {
  doctor_id: string; specialty_id: string | null;
  appointment_date: string; appointment_time: string;
  patient_name: string; patient_phone: string; national_id: string | null;
  gender: "male" | "female"; reason: string | null;
  insurance_provider_id: string | null;
  insurance_policy_number: string | null;
  insurance_member_id: string | null;
}) {
  const res = await fetch("/api/public/book/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, reminder_24h: true, reminder_2h: true }),
  });
  return (await res.json()) as { ok: boolean; message?: string; reference?: string };
}

type InsuranceProvider = {
  id: string; name_ar: string; name_en: string | null;
  coverage_tier: "comprehensive" | "basic" | "limited";
  coverage_percent: number; notes_ar: string | null;
};

async function fetchInsuranceProviders(): Promise<InsuranceProvider[]> {
  const { data, error } = await supabase
    .from("insurance_providers")
    .select("id, name_ar, name_en, coverage_tier, coverage_percent, notes_ar")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InsuranceProvider[];
}

async function verifyInsurance(payload: {
  doctor_id: string; provider_id: string;
  policy_number: string | null; member_id: string | null;
}) {
  const res = await fetch("/api/public/insurance/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as {
    ok: boolean; eligible?: boolean; reason?: string; message?: string;
    coverage_percent: number | null; consultation_fee: number | null;
    covered_amount: number | null; estimated_cost: number | null;
    patient_share: number | null;
  };
}

/* ---------------- Component ---------------- */

function NewReservationPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/reservations/new" });
  const [state, dispatch] = useReducer(reducer, INITIAL, (s) => ({
    ...s,
    doctorId: search.doctor ?? null,
    step: search.doctor ? 2 : (search.step ?? 1),
  }));

  const { data: doctors = [] } = useQuery({
    queryKey: ["res-doctors"], queryFn: fetchDoctors, staleTime: 5 * 60_000,
  });

  const { profile } = useSessionProfile();

  const doctor = useMemo(
    () => doctors.find((d) => d.id === state.doctorId) ?? null,
    [doctors, state.doctorId],
  );

  // sync step to URL
  useEffect(() => {
    navigate({ search: { doctor: state.doctorId ?? undefined, step: state.step }, replace: true });
  }, [state.step, state.doctorId, navigate]);

  // Prefill patient data from the signed-in profile (only when fields are still blank)
  useEffect(() => {
    if (!profile) return;
    const p = state.patient;
    const patch: Partial<Patient> = {};
    if (!p.name.trim() && profile.full_name) patch.name = profile.full_name;
    if (!p.phone.trim() && profile.phone) patch.phone = profile.phone;
    if (!p.nationalId.trim() && profile.national_id) patch.nationalId = profile.national_id;
    if (!p.gender && profile.gender) patch.gender = profile.gender;
    if (Object.keys(patch).length > 0) dispatch({ t: "patient", p: patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.userId]);


  const goto = (step: number) => dispatch({ t: "goto", step });

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="container-modern mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-3">
          <Link to="/reservations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
            <ArrowRight className="h-4 w-4" /> عودة للحجوزات
          </Link>
          <div className="text-sm font-semibold hidden sm:block">حجز موعد جديد</div>
          {profile ? (
            <Link
              to="/portal"
              className="inline-flex items-center gap-1.5 rounded-full border bg-primary/5 text-primary px-3 h-9 text-xs font-semibold hover:bg-primary/10"
            >
              بوابة المريض
            </Link>
          ) : (
            <Link
              to="/auth"
              search={{ redirect: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/reservations/new" }}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 h-9 text-xs font-semibold hover:bg-muted"
            >
              دخول
            </Link>
          )}
        </div>
      </header>


      <div className="container-modern mx-auto max-w-5xl px-4 py-8">
        <Steps step={state.step} />

        <div className="mt-8 bg-card border rounded-2xl p-6 md:p-8 shadow-sm">
          {state.step === 1 && (
            <StepDoctor doctors={doctors} value={state.doctorId} onPick={(id) => {
              dispatch({ t: "set", p: { doctorId: id, date: null, time: null } });
              goto(2);
            }} />
          )}
          {state.step === 2 && doctor && (
            <StepDate doctor={doctor} value={state.date} onPick={(d) => {
              dispatch({ t: "set", p: { date: d, time: null } });
              goto(3);
            }} onBack={() => goto(1)} />
          )}
          {state.step === 3 && doctor && state.date && (
            <StepTime doctorId={doctor.id} date={state.date} value={state.time} onPick={(t) => {
              dispatch({ t: "set", p: { time: t } });
              goto(4);
            }} onBack={() => goto(2)} />
          )}
          {state.step === 4 && (
            <StepPatient
              patient={state.patient}
              insurance={state.insurance}
              doctorId={state.doctorId}
              onChange={(p) => dispatch({ t: "patient", p })}
              onInsuranceChange={(p) => dispatch({ t: "insurance", p })}
              onNext={() => goto(5)}
              onBack={() => goto(3)}
            />
          )}
          {state.step === 5 && doctor && state.date && state.time && (
            <StepConfirm
              doctor={doctor}
              date={state.date}
              time={state.time}
              patient={state.patient}
              insurance={state.insurance}
              result={state.result}
              signedIn={!!profile}
              onSuccess={(reference) => dispatch({ t: "set", p: { result: { ok: true, reference } } })}
              onBack={() => goto(4)}
            />
          )}

          {state.step === 2 && !doctor && <EmptyPick onBack={() => goto(1)} />}
          {state.step >= 3 && (!doctor || !state.date) && <EmptyPick onBack={() => goto(1)} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Stepper ---------------- */

const STEP_LABELS = [
  { icon: Stethoscope, label: "الطبيب" },
  { icon: CalendarIcon, label: "التاريخ" },
  { icon: Clock, label: "الوقت" },
  { icon: User, label: "بياناتك" },
  { icon: ClipboardCheck, label: "التأكيد" },
];

function Steps({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between gap-2 max-w-3xl mx-auto">
      {STEP_LABELS.map((s, i) => {
        const num = i + 1;
        const done = step > num;
        const active = step === num;
        const Icon = s.icon;
        return (
          <div key={num} className="flex-1 flex flex-col items-center relative">
            {i > 0 && (
              <div className={`absolute top-5 right-1/2 w-full h-0.5 -z-0 ${done || active ? "bg-primary" : "bg-border"}`} />
            )}
            <div className={`relative z-10 h-10 w-10 rounded-full grid place-items-center border-2 transition ${
              done ? "bg-primary border-primary text-primary-foreground"
                : active ? "bg-primary/10 border-primary text-primary"
                : "bg-card border-border text-muted-foreground"
            }`}>
              {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
            </div>
            <div className={`mt-2 text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Step 1: Doctor ---------------- */

function StepDoctor({ doctors, value, onPick }: {
  doctors: Doctor[]; value: string | null; onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const active = doctors.filter((d) => d.booking_enabled);
    if (!q.trim()) return active;
    const n = q.trim();
    return active.filter((d) =>
      d.name_ar?.includes(n) || d.specialty_name_ar?.includes(n) || d.branch_name_ar?.includes(n),
    );
  }, [doctors, q]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">اختر الطبيب</h2>
      <p className="text-sm text-muted-foreground mb-5">ابحث بالاسم أو التخصص أو الفرع.</p>
      <Input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="ابحث…" className="mb-5 h-11" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[520px] overflow-y-auto pr-1">
        {list.map((d) => {
          const active = value === d.id;
          return (
            <button key={d.id} type="button" onClick={() => onPick(d.id)}
              className={`text-right rounded-xl border-2 p-4 transition ${
                active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"
              }`}>
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-full bg-primary/10 text-primary grid place-items-center font-bold text-sm shrink-0 overflow-hidden">
                  {d.photo_url ? <img src={d.photo_url} alt={d.name_ar} className="h-full w-full object-cover" />
                    : d.name_ar.replace(/^د\.?\s*/, "").split(/\s+/).slice(0, 2).map((x) => x[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{d.name_ar}</div>
                  {d.title_ar && <div className="text-xs text-muted-foreground truncate">{d.title_ar}</div>}
                  {d.specialty_name_ar && <div className="text-xs text-primary font-semibold mt-0.5 truncate">{d.specialty_name_ar}</div>}
                  {d.branch_name_ar && (
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{d.branch_name_ar}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {list.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-10">
            لا يوجد أطباء مطابقون.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Step 2: Date ---------------- */

function StepDate({ doctor, value, onPick, onBack }: {
  doctor: Doctor; value: string | null; onPick: (d: string) => void; onBack: () => void;
}) {
  const today = riyadhTodayIso();
  const [cursor, setCursor] = useState(() => {
    const d = new Date(today + "T00:00:00");
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const { data: available = [], isLoading } = useQuery({
    queryKey: ["res-month", doctor.id, cursor.year, cursor.month],
    queryFn: () => fetchMonthAvailability(doctor.id, cursor.year, cursor.month),
    staleTime: 60_000,
  });

  const availSet = useMemo(() => new Set(available), [available]);
  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const firstDay = new Date(cursor.year, cursor.month - 1, 1).getDay(); // 0=Sun

  const prevMonth = () => setCursor((c) => c.month === 1 ? { year: c.year - 1, month: 12 } : { ...c, month: c.month - 1 });
  const nextMonth = () => setCursor((c) => c.month === 12 ? { year: c.year + 1, month: 1 } : { ...c, month: c.month + 1 });

  const monthLabel = new Date(cursor.year, cursor.month - 1, 1).toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">اختر التاريخ</h2>
        <Button variant="ghost" size="sm" onClick={onBack}>تغيير الطبيب</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        الطبيب: <span className="font-semibold text-foreground">{doctor.name_ar}</span>
      </p>

      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="icon" onClick={prevMonth}><ArrowRight className="h-4 w-4" /></Button>
          <div className="font-semibold">{monthLabel}</div>
          <Button variant="outline" size="icon" onClick={nextMonth}><ArrowLeft className="h-4 w-4" /></Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">
          {["أحد", "إثن", "ثلا", "أرب", "خمس", "جمع", "سبت"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const iso = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isPast = iso < today;
            const isAvail = availSet.has(iso);
            const isSelected = value === iso;
            const disabled = isPast || !isAvail || isLoading;
            return (
              <button key={iso} type="button" disabled={disabled} onClick={() => onPick(iso)}
                className={`aspect-square rounded-lg text-sm font-medium transition ${
                  isSelected ? "bg-primary text-primary-foreground"
                    : disabled ? "text-muted-foreground/40 cursor-not-allowed"
                    : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                }`}>
                {day}
              </button>
            );
          })}
        </div>
        {isLoading && <div className="text-center text-xs text-muted-foreground mt-3">جاري تحميل الأيام المتاحة…</div>}
        {!isLoading && available.length === 0 && (
          <div className="text-center text-sm text-muted-foreground mt-4 p-4 bg-muted/50 rounded-lg">
            لا توجد مواعيد متاحة هذا الشهر. جرّب الشهر التالي.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Step 3: Time ---------------- */

function StepTime({ doctorId, date, value, onPick, onBack }: {
  doctorId: string; date: string; value: string | null; onPick: (t: string) => void; onBack: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["res-avail", doctorId, date],
    queryFn: () => fetchDayAvailability(doctorId, date),
  });

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("ar-SA-u-ca-gregory",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const bookedSet = useMemo(() => new Set(data?.booked ?? []), [data]);
  const allSlots = useMemo(() => {
    const times = data?.times ?? [];
    return [...times, ...(data?.booked ?? [])].sort();
  }, [data]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">اختر الوقت</h2>
        <Button variant="ghost" size="sm" onClick={onBack}>تغيير التاريخ</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{dateLabel}</p>

      {isLoading ? (
        <div className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : allSlots.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">لا توجد أوقات متاحة في هذا اليوم.</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-w-3xl mx-auto">
          {allSlots.map((t) => {
            const isBooked = bookedSet.has(t);
            const isSelected = value === t;
            return (
              <button key={t} type="button" disabled={isBooked} onClick={() => onPick(t)}
                className={`py-3 rounded-lg text-sm font-semibold border-2 transition ${
                  isSelected ? "bg-primary border-primary text-primary-foreground"
                    : isBooked ? "bg-muted border-border text-muted-foreground/50 line-through cursor-not-allowed"
                    : "bg-card border-border hover:border-primary hover:bg-primary/5"
                }`}>
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Step 4: Patient ---------------- */

function StepPatient({ patient, onChange, onNext, onBack }: {
  patient: Patient; onChange: (p: Partial<Patient>) => void;
  onNext: () => void; onBack: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    const name = patient.name.trim();
    if (name.length < NAME_MIN) e.name = "الاسم قصير جدًا";
    else if (name.length > NAME_MAX) e.name = "الاسم طويل جدًا";
    else if (!NAME_RE.test(name)) e.name = "الاسم يحتوي على أحرف غير مسموحة";
    else if (name.split(/\s+/).filter(Boolean).length < 2) e.name = "أدخل الاسم كاملاً (اسمان على الأقل)";

    const phone = patient.phone.replace(/[\s\-()]/g, "");
    if (phone.length < PHONE_MIN) e.phone = "رقم الجوال قصير جدًا";
    else if (phone.length > PHONE_MAX) e.phone = "رقم الجوال طويل جدًا";
    else if (!SA_PHONE_RE.test(phone)) e.phone = "رقم جوال سعودي غير صالح (مثال: 05XXXXXXXX)";

    if (patient.nationalId && !SA_NID_RE.test(patient.nationalId)) e.nationalId = "رقم هوية غير صالح";
    if (!patient.gender) e.gender = "اختر الجنس";
    if (patient.reason.length > REASON_MAX) e.reason = `الحد ${REASON_MAX} حرفًا`;

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">بيانات المريض</h2>
        <Button variant="ghost" size="sm" onClick={onBack}>عودة</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">جميع الحقول المميّزة بـ * إلزامية.</p>

      <div className="space-y-4 max-w-xl mx-auto">
        <div>
          <Label htmlFor="name">الاسم الكامل *</Label>
          <Input id="name" value={patient.name} onChange={(e) => onChange({ name: e.target.value })}
            placeholder="مثال: محمد أحمد الغامدي" maxLength={NAME_MAX} className="mt-1.5" />
          {errors.name && <div className="text-xs text-destructive mt-1">{errors.name}</div>}
        </div>

        <div>
          <Label htmlFor="phone">رقم الجوال *</Label>
          <Input id="phone" type="tel" dir="ltr" value={patient.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="05XXXXXXXX" maxLength={PHONE_MAX} className="mt-1.5" />
          {errors.phone && <div className="text-xs text-destructive mt-1">{errors.phone}</div>}
        </div>

        <div>
          <Label htmlFor="nid">رقم الهوية / الإقامة (اختياري)</Label>
          <Input id="nid" type="text" dir="ltr" value={patient.nationalId}
            onChange={(e) => onChange({ nationalId: e.target.value })}
            placeholder="10 أرقام" maxLength={10} className="mt-1.5" />
          {errors.nationalId && <div className="text-xs text-destructive mt-1">{errors.nationalId}</div>}
        </div>

        <div>
          <Label>الجنس *</Label>
          <RadioGroup value={patient.gender ?? ""}
            onValueChange={(v) => onChange({ gender: v as "male" | "female" })}
            className="flex gap-6 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="male" id="g-m" /> ذكر
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="female" id="g-f" /> أنثى
            </label>
          </RadioGroup>
          {errors.gender && <div className="text-xs text-destructive mt-1">{errors.gender}</div>}
        </div>

        <div>
          <Label htmlFor="reason">سبب الزيارة (اختياري)</Label>
          <Textarea id="reason" value={patient.reason}
            onChange={(e) => onChange({ reason: e.target.value })}
            placeholder="اذكر بإيجاز سبب زيارتك…" maxLength={REASON_MAX}
            className="mt-1.5 min-h-24" />
          <div className="text-xs text-muted-foreground text-left mt-1">
            {patient.reason.length}/{REASON_MAX}
          </div>
          {errors.reason && <div className="text-xs text-destructive mt-1">{errors.reason}</div>}
        </div>

        <Button onClick={handleNext} className="w-full h-11 mt-4">
          متابعة إلى المراجعة
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Step 5: Confirm ---------------- */

function StepConfirm({ doctor, date, time, patient, result, signedIn, onSuccess, onBack }: {
  doctor: Doctor; date: string; time: string; patient: Patient;
  result: State["result"]; signedIn: boolean;
  onSuccess: (ref: string) => void; onBack: () => void;
}) {
  const mut = useMutation({
    mutationFn: submitBooking,
    onSuccess: (r) => {
      if (r.ok && r.reference) onSuccess(r.reference);
    },
  });

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("ar-SA-u-ca-gregory",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const submit = () => {
    mut.mutate({
      doctor_id: doctor.id,
      specialty_id: doctor.specialty_id ?? null,
      appointment_date: date,
      appointment_time: time,
      patient_name: patient.name.trim(),
      patient_phone: patient.phone.replace(/[\s\-()]/g, ""),
      national_id: patient.nationalId?.trim() || null,
      gender: patient.gender!,
      reason: patient.reason.trim() || null,
    });
  };

  if (result) {
    return <BookingSuccess reference={result.reference} doctor={doctor} date={dateLabel} time={time} phone={patient.phone} signedIn={signedIn} />;
  }


  const errorMsg = mut.data && !mut.data.ok ? mut.data.message : mut.error instanceof Error ? mut.error.message : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">مراجعة وتأكيد</h2>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={mut.isPending}>تعديل</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">راجع تفاصيل حجزك قبل التأكيد.</p>

      <div className="max-w-xl mx-auto space-y-4">
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <Row label="الطبيب" value={`${doctor.name_ar}${doctor.title_ar ? ` — ${doctor.title_ar}` : ""}`} />
          {doctor.specialty_name_ar && <Row label="التخصص" value={doctor.specialty_name_ar} />}
          {doctor.branch_name_ar && <Row label="الفرع" value={doctor.branch_name_ar} />}
          <Row label="التاريخ" value={dateLabel} />
          <Row label="الوقت" value={time} />
        </div>

        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <Row label="الاسم" value={patient.name} />
          <Row label="الجوال" value={patient.phone} dir="ltr" />
          {patient.nationalId && <Row label="الهوية" value={patient.nationalId} dir="ltr" />}
          <Row label="الجنس" value={patient.gender === "male" ? "ذكر" : "أنثى"} />
          {patient.reason && <Row label="السبب" value={patient.reason} />}
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 text-destructive text-sm p-3">
            {errorMsg}
          </div>
        )}

        <Button onClick={submit} disabled={mut.isPending} className="w-full h-12 text-base">
          {mut.isPending ? <><Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التأكيد…</>
            : "تأكيد الحجز"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, dir }: { label: string; value: string; dir?: "ltr" | "rtl" }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-semibold text-left" dir={dir}>{value}</span>
    </div>
  );
}

/* ---------------- Success ---------------- */

function BookingSuccess({ reference, doctor, date, time, phone, signedIn }: {
  reference: string; doctor: Doctor; date: string; time: string; phone: string; signedIn: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="text-center max-w-lg mx-auto py-4">
      <div className="h-16 w-16 rounded-full bg-green-100 text-green-600 grid place-items-center mx-auto mb-4">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h2 className="text-2xl font-bold mb-2">تم تأكيد حجزك</h2>
      <p className="text-muted-foreground mb-6">سنرسل لك تذكيرًا قبل الموعد.</p>

      <div className="bg-muted/50 rounded-xl p-4 mb-4">
        <div className="text-xs text-muted-foreground mb-1">رقم المرجع</div>
        <div className="flex items-center justify-center gap-2">
          <div className="text-2xl font-bold font-mono">{reference}</div>
          <Button variant="ghost" size="icon" onClick={copy}>
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="text-right space-y-2 bg-card border rounded-xl p-4 mb-6">
        <Row label="الطبيب" value={doctor.name_ar} />
        <Row label="التاريخ" value={date} />
        <Row label="الوقت" value={time} />
        <Row label="الجوال" value={phone} dir="ltr" />
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        احتفظ برقم المرجع لإدارة حجزك لاحقًا.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        {signedIn ? (
          <Link to="/portal"
            className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90">
            فتح بوابة المريض
          </Link>
        ) : (
          <Link to="/auth" search={{ redirect: "/portal" }}
            className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90">
            سجّل الدخول لإدارة حجوزاتك
          </Link>
        )}
        <Link to="/reservations/manage" search={{ ref: reference }}
          className="flex-1 inline-flex items-center justify-center rounded-lg border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted">
          تتبع بالمرجع
        </Link>
        <Link to="/reservations"
          className="flex-1 inline-flex items-center justify-center rounded-lg border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted">
          حجز جديد
        </Link>
      </div>

    </div>
  );
}

/* ---------------- Empty ---------------- */

function EmptyPick({ onBack }: { onBack: () => void }) {
  return (
    <div className="text-center py-8">
      <p className="text-muted-foreground mb-4">لم يتم اختيار الطبيب بعد.</p>
      <Button onClick={onBack}>اختيار طبيب</Button>
    </div>
  );
}
