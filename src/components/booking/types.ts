import { z } from "zod";

/* ================================================================
   Booking Wizard — shared types, constants, validators, reducer
   Extracted from src/routes/book.tsx (behavior-preserving).
   ================================================================ */

export type ServiceType = "clinic" | "radiology" | "lab" | "followup";
export type Gender = "male" | "female";

export type PayerType = "self" | "insurance";

export type InsuranceEstimate = {
  eligible: boolean;
  reason?: string | null;
  message?: string | null;
  coverage_percent?: number | null;
  consultation_fee?: number | null;
  covered_amount?: number | null;
  estimated_cost?: number | null;
  patient_share?: number | null;
} | null;

export type State = {
  step: number; // 1..9
  serviceType: ServiceType | null;
  branchId: string | null;
  specialtyId: string | null;
  doctorId: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  patient: {
    name: string;
    phone: string;
    email: string;
    nationalId: string;
    gender: Gender | null;
    reason: string;
    reminder24h: boolean;
    reminder2h: boolean;
    payerType: PayerType;
    insuranceProviderId: string | null;
    insurancePolicyNumber: string;
    insuranceMemberId: string;
    insuranceEstimate: InsuranceEstimate;
    isNewPatient: boolean; // first-time visitor flag
  };
};

export const INITIAL: State = {
  step: 1,
  serviceType: null,
  branchId: null,
  specialtyId: null,
  doctorId: null,
  date: null,
  time: null,
  patient: {
    name: "",
    phone: "",
    email: "",
    nationalId: "",
    gender: null,
    reason: "",
    reminder24h: true,
    reminder2h: true,
    payerType: "self",
    insuranceProviderId: null,
    insurancePolicyNumber: "",
    insuranceMemberId: "",
    insuranceEstimate: null,
    isNewPatient: false,
  },
};


export type Action =
  | { t: "set"; p: Partial<State> }
  | { t: "setPatient"; p: Partial<State["patient"]> }
  | { t: "goto"; step: number }
  | { t: "reset" };

export function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "set":
      return { ...s, ...a.p };
    case "setPatient":
      return { ...s, patient: { ...s.patient, ...a.p } };
    case "goto":
      return { ...s, step: Math.max(1, Math.min(9, a.step)) };
    case "reset":
      return { ...INITIAL };
  }
}

export const STORAGE_KEY = "booking:draft";

/* ---------------- Draft versioning + expiry ----------------
 * Bump DRAFT_VERSION whenever the persisted State shape changes so old
 * drafts get discarded instead of hydrating into a broken UI. Drafts also
 * expire after DRAFT_TTL_MS since last save — a 24h stale reservation is
 * more confusing than an empty form.
 */
export const DRAFT_VERSION = 2;
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type PersistedDraft = State & { _v?: number; _savedAt?: number };

export function saveDraft(state: State): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedDraft = { ...state, _v: DRAFT_VERSION, _savedAt: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadDraft(initial: Partial<State>): State {
  if (typeof window === "undefined") return { ...INITIAL, ...initial };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...INITIAL, ...initial };
    const parsed = JSON.parse(raw) as PersistedDraft;
    const version = parsed._v ?? 1;
    const savedAt = parsed._savedAt ?? 0;
    const expired = savedAt > 0 && Date.now() - savedAt > DRAFT_TTL_MS;
    if (version !== DRAFT_VERSION || expired) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return { ...INITIAL, ...initial };
    }
    // Strip metadata before merging so it never lands in the reducer state.
    const { _v: _v, _savedAt: _s, ...clean } = parsed;
    void _v;
    void _s;
    // Success survives reload: if the persisted draft is on step 9,
    // keep it there and IGNORE the URL step (URL still shows the last
    // pushed value, typically step=8 from the review step).
    if (clean.step === 9) return { ...INITIAL, ...clean };
    // Merge nested patient explicitly so newly-added fields (e.g. isNewPatient)
    // pick up their defaults from INITIAL even for drafts persisted before v2.
    return {
      ...INITIAL,
      ...clean,
      patient: { ...INITIAL.patient, ...(clean.patient ?? {}) },
      ...initial,
    };
  } catch {
    return { ...INITIAL, ...initial };
  }
}


/* ---------------- Availability response ---------------- */
export type AvailResp = { ok: boolean; times: string[]; booked: string[] };

/* ---------------- Step reachability ----------------
 * Highest step whose prerequisites are satisfied by the current state.
 * Used to clamp a URL-supplied `?step=` that outruns the real data
 * (e.g. a shared link with ?step=8 but no doctor). Step 9 (success) is
 * intentionally excluded — it's only reachable through a successful submit.
 */
export function maxReachableStep(s: State, patientOk: boolean): number {
  let r = 1;
  if (s.serviceType || s.branchId || s.specialtyId || s.doctorId) r = 2;
  if (s.branchId || s.specialtyId || s.doctorId) r = 3;
  if (s.specialtyId || s.doctorId) r = 4;
  if (s.doctorId) r = 5;
  if (s.doctorId && s.date) r = 6;
  if (s.doctorId && s.date && s.time) r = 7;
  if (s.doctorId && s.date && s.time && patientOk) r = 8;
  return r;
}

/* ---------------- Formatting helpers ---------------- */
export function formatArDate(iso: string | null, lang: "ar" | "en"): string {
  if (!iso) return "—";
  try {
    const locale = lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US";
    return new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Riyadh",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso + "T00:00:00+03:00"));
  } catch {
    return iso;
  }
}

/* ---------------- Patient validation ---------------- */
// Limits/regex are the single source of truth in src/lib/booking-limits.ts
// so the client and the /api/public/book/create endpoint stay in sync.
export {
  NAME_MIN,
  NAME_MAX,
  PHONE_MIN,
  PHONE_MAX,
  NID_MAX,
  REASON_MAX,
  PHONE_RE,
  SA_PHONE_RE,
  SA_NID_RE,
  NAME_RE,
} from "@/lib/booking-limits";
import {
  NAME_MIN,
  NAME_MAX,
  PHONE_MIN,
  PHONE_MAX,
  REASON_MAX,
  SA_PHONE_RE,
  SA_NID_RE,
  NAME_RE,
} from "@/lib/booking-limits";

export const patientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(NAME_MIN, "الاسم قصير جدًا (٢ أحرف على الأقل)")
    .max(NAME_MAX, "الاسم طويل جدًا")
    .regex(NAME_RE, "الاسم يحتوي على أحرف غير مسموحة")
    .refine(
      (v) => v.split(/\s+/).filter(Boolean).length >= 2,
      "أدخل الاسم كاملاً (اسمان على الأقل)",
    ),
  phone: z
    .string()
    .trim()
    .min(PHONE_MIN, "رقم الجوال قصير جدًا")
    .max(PHONE_MAX, "رقم الجوال طويل جدًا")
    .refine(
      (v) => SA_PHONE_RE.test(v.replace(/[\s\-()]/g, "")),
      "رقم جوال سعودي غير صالح (مثال: 05XXXXXXXX)",
    ),
  email: z
    .string()
    .trim()
    .max(255, "البريد الإلكتروني طويل جدًا")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "بريد إلكتروني غير صالح"),
  nationalId: z
    .string()
    .trim()
    .refine((v) => v === "" || SA_NID_RE.test(v), "رقم هوية غير صالح (10 أرقام يبدأ بـ 1 أو 2)"),
  gender: z.enum(["male", "female"], { message: "اختر الجنس" }),
  reason: z.string().trim().max(REASON_MAX, `السبب طويل جدًا (الحد ${REASON_MAX} حرفًا)`),
});

export type PatientErrors = Partial<
  Record<"name" | "phone" | "email" | "nationalId" | "gender" | "reason", string>
>;

export function validatePatient(p: State["patient"]): { ok: boolean; errors: PatientErrors } {
  const r = patientSchema.safeParse({
    name: p.name,
    phone: p.phone,
    email: p.email,
    nationalId: p.nationalId,
    gender: p.gender ?? undefined,
    reason: p.reason,
  });
  if (r.success) return { ok: true, errors: {} };
  const errors: PatientErrors = {};
  for (const issue of r.error.issues) {
    const k = issue.path[0] as keyof PatientErrors;
    if (k && !errors[k]) errors[k] = issue.message;
  }
  return { ok: false, errors };
}
