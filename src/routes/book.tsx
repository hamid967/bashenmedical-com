/**
 * صفحة الحجز — Multi-step booking wizard (UDH-style)
 *   1. Service type      2. Branch       3. Specialty
 *   4. Doctor            5. Date         6. Time
 *   7. Patient info      8. Review       → submits then navigates to /booking-confirmation
 *
 * Uses existing public APIs:
 *   - list_public_branches / specialties / list_public_doctors  (Supabase RPC)
 *   - GET  /api/public/book/availability
 *   - POST /api/public/book/create  (via submitBooking helper)
 *
 * State is stored in sessionStorage under `booking:draft` so the user can
 * refresh mid-flow without losing progress. Deep links accept ?doctor= and
 * ?specialty= to jump straight to the doctor step from /doctors and
 * /specialties pages.
 *
 * Wizard step components live in src/components/booking/*.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { submitBooking, clearBookingIdempotencyKey } from "@/lib/booking-submit";
import { Button } from "@/components/ui/button";

import { fallback } from "@tanstack/zod-adapter";
import {
  loadDraft, reducer, STORAGE_KEY, validatePatient, maxReachableStep, type AvailResp,
} from "@/components/booking/types";
import { Stepper } from "@/components/booking/Stepper";
import { StepService } from "@/components/booking/StepService";
import { StepBranch } from "@/components/booking/StepBranch";
import { StepSpecialty } from "@/components/booking/StepSpecialty";
import { StepDoctor } from "@/components/booking/StepDoctor";
import { StepDate } from "@/components/booking/StepDate";
import { StepTime } from "@/components/booking/StepTime";
import { StepPatient } from "@/components/booking/StepPatient";
import { StepReview } from "@/components/booking/StepReview";
import { StepSuccess } from "@/components/booking/StepSuccess";
import { SummarySidebar } from "@/components/booking/SummarySidebar";
import { WaitlistCTA } from "@/components/booking/WaitlistCTA";
import { bmcOgImageMeta } from "@/lib/og-meta";

const search = z.object({
  specialty: z.string().optional(),
  doctor: z.string().optional(),
  branch: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  step: fallback(z.number().int(), 0).default(0),
});

export const Route = createFileRoute("/book")({
  validateSearch: search,
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "احجز موعدًا | مجمع باعشن الطبي" },
      { name: "description", content: "احجز موعدك مع أطبائنا خطوة بخطوة: اختر الفرع، التخصص، الطبيب، ثم الموعد المناسب." },
      { property: "og:title", content: "احجز موعدًا — مجمع باعشن الطبي" },
      { property: "og:description", content: "نظام حجز سريع وسهل عبر خطوات واضحة." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: BookPage,
});

/* ================================================================
   Data fetching helpers
   ================================================================ */

async function fetchBranches() {
  const { data } = await supabase.rpc("list_public_branches");
  return data ?? [];
}
async function fetchSpecialties() {
  const { data } = await supabase
    .from("specialties")
    .select("id,slug,name_ar,name_en,icon")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}
async function fetchDoctors(specialtyId: string | null, branchId: string | null) {
  const { data, error } = await supabase.rpc("list_public_doctors", {
    _limit: 200, _offset: 0, _branch_id: branchId ?? undefined,
  });
  if (error) return [];
  const list = (data ?? []) as any[];
  return specialtyId ? list.filter((d) => d.specialty_id === specialtyId) : list;
}

async function fetchAvailability(date: string, doctorId: string | null, specialtyId: string | null, branchId: string | null): Promise<AvailResp> {
  const p = new URLSearchParams({ date });
  if (doctorId) p.set("doctor_id", doctorId);
  else if (specialtyId) p.set("specialty_id", specialtyId);
  if (branchId) p.set("branch_id", branchId);
  const res = await fetch(`/api/public/book/availability?${p.toString()}`);
  if (!res.ok) return { ok: false, times: [], booked: [] };
  return (await res.json()) as AvailResp;
}

/* ================================================================
   Page
   ================================================================ */

function BookPage() {
  const searchParams = Route.useSearch();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [state, dispatch] = useReducer(reducer, undefined, () =>
    loadDraft({
      doctorId: searchParams.doctor ?? null,
      specialtyId: searchParams.specialty ?? null,
      branchId: searchParams.branch ?? null,
      date: searchParams.date ?? null,
      time: searchParams.time ?? null,
      // Prefer explicit ?step= (browser back/forward, refresh). Otherwise derive from deep-link.
      step: searchParams.step && searchParams.step >= 1 && searchParams.step <= 9
        ? searchParams.step
        : searchParams.doctor && searchParams.date && searchParams.time
        ? 8
        : searchParams.doctor && searchParams.date
        ? 6
        : searchParams.doctor
        ? 5
        : searchParams.specialty
        ? 4
        : 1,
    }),
  );

  // Persist draft to sessionStorage.
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  // Explicit step→URL sync helper: bumps state and pushes an entry so the
  // browser Back/Forward buttons walk the wizard naturally. Also called from
  // popstate below with `pushUrl=false` (browser already moved the URL).
  const goto = (step: number) => {
    dispatch({ t: "goto", step });
    if (step === 9) return; // success page: don't push
    if (typeof window === "undefined") return;
    navigate({
      to: "/book",
      search: (prev: Record<string, unknown>) => ({ ...prev, step }),
    });
  };




  // Deep-link fill-in: when the URL has no explicit step (schema default 0)
  // but state derived a step (e.g. 5 from ?doctor=&specialty=), REPLACE the
  // current entry so step appears in the URL without creating a duplicate.
  const didInitialFillRef = useRef(false);
  useEffect(() => {
    if (didInitialFillRef.current) return;
    didInitialFillRef.current = true;
    if (state.step !== 9 && searchParams.step === 0 && state.step >= 1) {
      navigate({
        to: "/book",
        search: (prev: Record<string, unknown>) => ({ ...prev, step: state.step }),
        replace: true,
      });
    }
  }, [state.step, searchParams.step, navigate]);

  // Restore state from URL on browser Back/Forward (popstate). URL is
  // authoritative here — dispatch without re-pushing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      if (window.location.pathname !== "/book") return;
      const params = new URLSearchParams(window.location.search);
      const s = parseInt(params.get("step") ?? "0", 10);
      if (s >= 1 && s <= 9) dispatch({ t: "goto", step: s });

    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);







  // Scroll to top of the wizard card whenever the step changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [state.step]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ doctorId: string; doctorName: string; time: string; date: string } | null>(null);
  const [findingAlt, setFindingAlt] = useState(false);
  // Success result survives reload — booking reference lives in
  // sessionStorage so the success screen (step=9) still renders after F5.
  // Without this, reload would drop `result` (React-only) and step=9 would
  // render an empty card even though state.step=9 persisted.
  const RESULT_KEY = "booking:result";
  const [result, setResult] = useState<{ reference: string | null; phone: string } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(RESULT_KEY);
      return raw ? (JSON.parse(raw) as { reference: string | null; phone: string }) : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (result) sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
      else sessionStorage.removeItem(RESULT_KEY);
    } catch {/* ignore */}
  }, [result]);

  const { data: branches = [] }    = useQuery({ queryKey: ["branches"], queryFn: fetchBranches, staleTime: 30 * 60_000 });
  const { data: specialties = [] } = useQuery({ queryKey: ["specialties-active"], queryFn: fetchSpecialties, staleTime: 30 * 60_000 });
  const { data: doctors = [] } = useQuery({
    queryKey: ["doctors-for-book", state.specialtyId, state.branchId],
    queryFn: () => fetchDoctors(state.specialtyId, state.branchId),
    enabled: state.step >= 4,
    staleTime: 5 * 60_000,
  });

  // If the user picked a doctor via deep link, auto-fill branch & specialty
  useEffect(() => {
    if (state.doctorId && !state.specialtyId && doctors.length) {
      const d = doctors.find((x: any) => x.id === state.doctorId);
      if (d) dispatch({ t: "set", p: { specialtyId: d.specialty_id, branchId: d.branch_id ?? state.branchId } });
    }
  }, [state.doctorId, state.specialtyId, doctors]);

  const { data: avail } = useQuery({
    queryKey: ["avail", state.date, state.doctorId, state.specialtyId, state.branchId],
    queryFn: () => fetchAvailability(state.date!, state.doctorId, state.specialtyId, state.branchId),
    enabled: !!state.date && state.step >= 6,
    staleTime: 20_000,
  });

  // Week-scan for the current doctor — used to decide whether to emphasize
  // the waitlist CTA. Uses the month-availability endpoint so it's one call.
  const { data: weekDates } = useQuery({
    queryKey: ["week-avail", state.doctorId, state.branchId],
    queryFn: async () => {
      const today = new Date();
      const y = today.getFullYear(); const m = today.getMonth() + 1;
      const p = new URLSearchParams({ year: String(y), month: String(m) });
      if (state.doctorId) p.set("doctor_id", state.doctorId);
      if (state.branchId) p.set("branch_id", state.branchId);
      const res = await fetch(`/api/public/book/month-availability?${p.toString()}`);
      if (!res.ok) return [] as string[];
      const j = await res.json();
      return (j?.dates ?? []) as string[];
    },
    enabled: !!state.doctorId && state.step >= 6,
    staleTime: 60_000,
  });

  const noWeekAvailability = useMemo(() => {
    if (!weekDates) return false;
    const today = new Date();
    const in7 = new Date(today.getTime() + 7 * 86400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const from = iso(today), to = iso(in7);
    return !weekDates.some((d) => d >= from && d <= to);
  }, [weekDates]);


  const patientValidation = useMemo(() => validatePatient(state.patient), [state.patient]);

  // Warn before losing an unsent draft: any patient input on step ≥ 4 counts.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasDraft =
      state.step >= 4 && state.step < 9 &&
      (state.patient.name.trim() !== "" || state.patient.phone.trim() !== "" || state.patient.nationalId.trim() !== "" || state.patient.reason.trim() !== "");
    if (!hasDraft) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.step, state.patient.name, state.patient.phone, state.patient.nationalId, state.patient.reason]);

  // Prefetch today's availability the moment a doctor is picked, so StepTime
  // renders instantly when the user reaches step 6.
  useEffect(() => {
    if (!state.doctorId) return;
    const today = new Date().toISOString().slice(0, 10);
    queryClient.prefetchQuery({
      queryKey: ["avail", today, state.doctorId, state.specialtyId, state.branchId],
      queryFn: () => fetchAvailability(today, state.doctorId, state.specialtyId, state.branchId),
      staleTime: 20_000,
    });
  }, [state.doctorId, state.specialtyId, state.branchId, queryClient]);

  // Consistency guard: clamp state.step to the highest step whose
  // prerequisites are actually met. Runs on every state change so a
  // deep link (?step=8 with no doctor), a stale sessionStorage draft, or
  // a manual URL edit always renders a valid step and the URL is
  // rewritten to match. Step 9 (success) is preserved — it's set only
  // after a real submit and never inferred from the URL.
  useEffect(() => {
    if (state.step === 9) return;
    const max = maxReachableStep(state, patientValidation.ok);
    if (state.step > max) {
      dispatch({ t: "goto", step: max });
      if (typeof window !== "undefined") {
        navigate({
          to: "/book",
          search: (prev: Record<string, unknown>) => ({ ...prev, step: max }),
          replace: true,
        });
      }
    }
  }, [state, patientValidation.ok, navigate]);

  const canNext = useMemo(() => {
    switch (state.step) {
      case 1: return !!state.serviceType;
      case 2: return !!state.branchId;
      case 3: return !!state.specialtyId;
      case 4: return !!state.doctorId;
      case 5: return !!state.date;
      case 6: return !!state.time;
      case 7: return patientValidation.ok;
      default: return true;
    }
  }, [state, patientValidation]);

  // Find an alternative doctor in the same specialty/branch with the earliest
  // slot on the same date (>= originally requested time when possible).
  async function findAlternativeDoctor(date: string, preferredTime: string | null) {
    if (!state.specialtyId) return null;
    const candidates = (doctors as any[])
      .filter((d) => d.id !== state.doctorId && d.specialty_id === state.specialtyId)
      .slice(0, 6);
    if (!candidates.length) return null;
    const results = await Promise.all(
      candidates.map(async (d) => {
        const a = await fetchAvailability(date, d.id, state.specialtyId, state.branchId);
        if (!a.ok || !a.times?.length) return null;
        const booked = new Set(a.booked ?? []);
        const free = a.times.filter((t) => !booked.has(t));
        if (!free.length) return null;
        const pick = (preferredTime && free.find((t) => t >= preferredTime)) || free[0];
        return { doctor: d, time: pick };
      }),
    );
    const found = results.filter(Boolean) as { doctor: any; time: string }[];
    if (!found.length) return null;
    found.sort((a, b) => a.time.localeCompare(b.time));
    const best = found[0];
    const name = lang === "ar" ? (best.doctor.name_ar || best.doctor.name_en) : (best.doctor.name_en || best.doctor.name_ar);
    return { doctorId: best.doctor.id as string, doctorName: name as string, time: best.time, date };
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    dispatch({ t: "set", p: { doctorId: suggestion.doctorId, date: suggestion.date, time: suggestion.time } });
    setSuggestion(null);
    setErrorMsg(null);
    goto(7);
  }

  async function handleSubmit() {
    setErrorMsg(null);
    setSuggestion(null);
    if (!patientValidation.ok) {
      setErrorMsg(lang === "ar" ? "يرجى تصحيح بيانات المريض قبل التأكيد" : "Please fix patient info before confirming");
      goto(7);
      return;
    }
    setSubmitting(true);
    // Pre-submit slot re-check: guard against the wall-clock case where the
    // slot got booked between step 6 and step 8. Cheaper than a full round-trip
    // to /create + friendly Arabic conflict message.
    try {
      const fresh = await fetchAvailability(state.date!, state.doctorId, state.specialtyId, state.branchId);
      if (fresh.ok && fresh.booked?.includes(state.time!)) {
        setSubmitting(false);
        setErrorMsg(lang === "ar"
          ? "هذا الموعد لم يعد متاحًا. اختر وقتًا آخر."
          : "This slot is no longer available. Please pick another time.");
        // Refresh the availability query so StepTime shows the updated state.
        queryClient.setQueryData(["avail", state.date, state.doctorId, state.specialtyId, state.branchId], fresh);
        const prevTime = state.time;
        dispatch({ t: "set", p: { time: null } });
        goto(6);
        // Fire-and-forget: look up an alternative doctor with the earliest slot.
        setFindingAlt(true);
        findAlternativeDoctor(state.date!, prevTime)
          .then((alt) => { if (alt) setSuggestion(alt); })
          .catch(() => {})
          .finally(() => setFindingAlt(false));
        return;
      }
    } catch {/* network hiccup — let the real submit surface the error */}
    const p = state.patient;
    const res = await submitBooking({
      patient_name: p.name.trim(),
      patient_phone: p.phone.trim(),
      appointment_date: state.date!,
      appointment_time: state.time!,
      reason: p.reason.trim() || undefined,
      national_id: p.nationalId.trim() || null,
      gender: p.gender ?? undefined,
      specialty_id: state.specialtyId,
      doctor_id: state.doctorId,
      reminder_24h: p.reminder24h,
      reminder_2h: p.reminder2h,
    });
    setSubmitting(false);
    if (res.ok) {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      toast.success(lang === "ar" ? "تم إنشاء الحجز بنجاح" : "Booking created");
      setResult({ reference: res.reference, phone: p.phone.trim() });
      goto(9);
    } else {
      setErrorMsg(res.message);
    }
  }

  function handleReset() {
    // Guard against accidental taps that would drop the reference/QR forever.
    if (typeof window !== "undefined" && result?.reference) {
      const msg = lang === "ar"
        ? "سيتم مسح تفاصيل الحجز الحالي من الشاشة. تأكد أنك احتفظت برقم الحجز. هل تريد المتابعة؟"
        : "The current booking details will be cleared from this screen. Make sure you saved the reference. Continue?";
      if (!window.confirm(msg)) return;
    }
    setResult(null);
    setErrorMsg(null);
    dispatch({ t: "reset" });
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(RESULT_KEY);
      clearBookingIdempotencyKey();
    } catch {}
    // Explicit step=1 — otherwise the zod validator defaults `step` to 0.
    navigate({ to: "/book", search: { step: 1 } });
  }

  const STEPS = lang === "ar"
    ? ["نوع الخدمة", "الفرع", "التخصص", "الطبيب", "التاريخ", "الوقت", "بياناتك", "المراجعة", "التأكيد"]
    : ["Service", "Branch", "Specialty", "Doctor", "Date", "Time", "Your info", "Review", "Confirmed"];

  // Displayed step for the indicator/progress bar — never allowed to exceed
  // the highest step whose prerequisites are met. Prevents a transient flash
  // where the URL/state briefly asks for step N but doctor/specialty/branch
  // are missing. The clamp effect further up rewrites state + URL to match;
  // this memo keeps the visual indicator honest until it runs.
  const displayedStep = state.step === 9
    ? 9
    : Math.min(state.step, maxReachableStep(state, patientValidation.ok));

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container-app py-8 md:py-12 max-w-5xl">
        <header className="mb-6 md:mb-8 text-center">
          <h1 className="text-2xl md:text-4xl font-bold">
            {lang === "ar" ? "احجز موعدك" : "Book an appointment"}
          </h1>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            {lang === "ar"
              ? "اتبع الخطوات لإتمام حجز موعدك — يمكنك الرجوع في أي وقت."
              : "Follow the steps to complete your booking — you can go back anytime."}
          </p>
        </header>

        <Stepper steps={STEPS} current={displayedStep} onJump={(i) => {
          if (state.step === 9) return;
          if (i + 1 < state.step) goto(i + 1);
        }}/>

        {state.step < 9 && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round(((displayedStep - 1) / 7) * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground text-center">
              {lang === "ar"
                ? `الخطوة ${displayedStep} من 8`
                : `Step ${displayedStep} of 8`}
            </div>
          </div>
        )}

        <div className={`mt-6 grid gap-6 ${state.step >= 2 && state.step <= 8 ? "md:grid-cols-[1fr,300px]" : ""}`}>
          <div className="rounded-2xl bg-card border border-border shadow-sm p-5 md:p-8 min-h-[420px]">
            {state.step === 1 && <StepService lang={lang} value={state.serviceType} onPick={(v) => { dispatch({ t: "set", p: { serviceType: v } }); goto(2); }}/>}
            {state.step === 2 && <StepBranch lang={lang} branches={branches} value={state.branchId} onPick={(v) => { dispatch({ t: "set", p: { branchId: v } }); goto(3); }}/>}
            {state.step === 3 && <StepSpecialty lang={lang} specialties={specialties} value={state.specialtyId} onPick={(v) => { dispatch({ t: "set", p: { specialtyId: v, doctorId: null } }); goto(4); }}/>}
            {state.step === 4 && <StepDoctor lang={lang} doctors={doctors} value={state.doctorId} onPick={(v) => { dispatch({ t: "set", p: { doctorId: v, date: null, time: null } }); goto(5); }}/>}
            {state.step === 5 && <StepDate lang={lang} value={state.date} onPick={(v) => { dispatch({ t: "set", p: { date: v, time: null } }); goto(6); }} doctorId={state.doctorId} specialtyId={state.specialtyId} branchId={state.branchId} onChangeDoctor={() => goto(4)} onChangeBranch={() => goto(2)}/>}
            {state.step === 6 && (
              <>
                {(findingAlt || suggestion) && (
                  <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3 md:p-4 text-sm">
                    {findingAlt && !suggestion && (
                      <span className="text-muted-foreground">
                        {lang === "ar" ? "جارٍ البحث عن طبيب بديل بأقرب موعد…" : "Looking for an alternative doctor…"}
                      </span>
                    )}
                    {suggestion && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                        <div>
                          <div className="font-medium">
                            {lang === "ar" ? "طبيب بديل متاح:" : "Alternative doctor available:"} {suggestion.doctorName}
                          </div>
                          <div className="text-muted-foreground">
                            {lang === "ar" ? "أقرب موعد" : "Earliest slot"}: {suggestion.time}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={acceptSuggestion}>
                            {lang === "ar" ? "احجز مع البديل" : "Book alternative"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                            {lang === "ar" ? "تجاهل" : "Dismiss"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <StepTime lang={lang} value={state.time} avail={avail} onPick={(v) => { dispatch({ t: "set", p: { time: v } }); goto(7); }}/>
                <div className="mt-4">
                  <WaitlistCTA
                    lang={lang}
                    doctorId={state.doctorId}
                    specialtyId={state.specialtyId}
                    branchId={state.branchId}
                    defaultName={state.patient.name}
                    defaultPhone={state.patient.phone}
                    emphasized={noWeekAvailability}
                  />
                </div>
              </>
            )}
            {state.step === 7 && <StepPatient lang={lang} value={state.patient} errors={patientValidation.errors} onChange={(p) => dispatch({ t: "setPatient", p })}/>}
            {state.step === 8 && <StepReview lang={lang} state={state} branches={branches} specialties={specialties} doctors={doctors} errorMsg={errorMsg} submitting={submitting} onSubmit={handleSubmit} patientValid={patientValidation.ok} onEditPatient={() => goto(7)}/>}
            {state.step === 9 && result && <StepSuccess lang={lang} state={state} branches={branches} specialties={specialties} doctors={doctors} reference={result.reference} phone={result.phone} onNewBooking={handleReset}/>}
          </div>

          {state.step >= 2 && state.step <= 8 && (
            <SummarySidebar
              lang={lang}
              state={state}
              branches={branches}
              specialties={specialties}
              doctors={doctors}
              onEdit={(step: number) => goto(step)}
            />
          )}
        </div>

        {state.step < 9 && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              disabled={state.step === 1}
              onClick={() => goto(state.step - 1)}
              className="gap-1"
            >
              {lang === "ar" ? <><ChevronRight className="h-4 w-4"/>السابق</> : <><ChevronLeft className="h-4 w-4"/>Back</>}
            </Button>

            {state.step < 8 && (
              <Button
                disabled={!canNext}
                onClick={() => goto(state.step + 1)}
                className="gap-1"
              >
                {lang === "ar" ? <>التالي<ChevronLeft className="h-4 w-4"/></> : <>Next<ChevronRight className="h-4 w-4"/></>}
              </Button>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {lang === "ar" ? "لديك حجز مسبق؟" : "Already booked?"}{" "}
          <Link to="/track" search={{ ref: undefined, phone4: undefined }} className="text-primary hover:underline">
            {lang === "ar" ? "تتبع حجزك" : "Track your booking"}
          </Link>
        </p>
      </div>
    </div>
  );
}
