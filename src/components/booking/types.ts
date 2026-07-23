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
  /** Server-issued OTP challenge id from a successful booking-purpose verification. */
  verificationChallengeId: string | null;
  /** Phone the user completed OTP verification for. Must match patient.phone at submit time. */
  verifiedPhone: string | null;
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
  verificationChallengeId: null,
  verifiedPhone: null,
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
      return { ...s, step: Math.max(1, Math.min(10, a.step)) };
    case "reset":
      return { ...INITIAL };
  }
}

export const STORAGE_KEY = "booking:draft";

/* ---------------- Draft versioning + expiry ----------------
 * The persisted draft is wrapped in an envelope with explicit metadata so
 * loads can validate freshness deterministically instead of guessing:
 *
 *   { version, savedAt, expiresAt, state }
 *
 * Bump DRAFT_VERSION whenever the State shape changes; older envelopes get
 * discarded on load. `expiresAt` is stamped at save time (savedAt + TTL);
 * once the wall clock passes it, the draft is dropped — a 24h stale
 * reservation is more confusing than an empty form.
 */
export const DRAFT_VERSION = 5;
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type DraftEnvelope = {
  version: number;
  savedAt: number;   // epoch ms — when the draft was written
  expiresAt: number; // epoch ms — hard cutoff; ignored after this
  state: State;
};

// Legacy envelope written by DRAFT_VERSION=2 (flat state + `_v`/`_savedAt`).
type LegacyFlatDraft = State & { _v?: number; _savedAt?: number };

function isEnvelope(value: unknown): value is DraftEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    "version" in value &&
    "state" in value &&
    "savedAt" in value &&
    "expiresAt" in value
  );
}

export function saveDraft(state: State): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const envelope: DraftEnvelope = {
      version: DRAFT_VERSION,
      savedAt: now,
      expiresAt: now + DRAFT_TTL_MS,
      state,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
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

    const parsed: unknown = JSON.parse(raw);
    const now = Date.now();

    // Discard anything that doesn't match the current envelope shape/version
    // or has passed its expiresAt. Legacy flat drafts are dropped too — they
    // don't carry an explicit expiresAt so we can't trust them.
    if (!isEnvelope(parsed)) {
      // Best-effort: peek at legacy `_savedAt` for observability, then drop.
      const legacy = parsed as LegacyFlatDraft | null;
      void legacy?._v;
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return { ...INITIAL, ...initial };
    }

    if (parsed.version !== DRAFT_VERSION || now >= parsed.expiresAt) {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return { ...INITIAL, ...initial };
    }

    const clean = parsed.state;
    // Success survives reload: if the persisted draft is on step 10, keep it
    // there and IGNORE the URL step (URL still shows the last pushed value,
    // typically step=9 from the review step).
    if (clean.step === 10) return { ...INITIAL, ...clean };
    // Merge nested patient explicitly so newly-added fields (e.g.
    // isNewPatient) pick up their defaults from INITIAL even for drafts
    // persisted before those fields existed.
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
 * (e.g. a shared link with ?step=9 but no doctor). Step 10 (success) is
 * intentionally excluded — it's only reachable through a successful submit.
 */
export function maxReachableStep(
  s: State,
  patientOk: boolean,
  insuranceOk: boolean = false,
): number {
  let r = 1;
  if (s.serviceType || s.branchId || s.specialtyId || s.doctorId) r = 2;
  if (s.branchId || s.specialtyId || s.doctorId) r = 3;
  if (s.specialtyId || s.doctorId) r = 4;
  if (s.doctorId) r = 5;
  if (s.doctorId && s.date) r = 6;
  if (s.doctorId && s.date && s.time) r = 7;
  if (s.doctorId && s.date && s.time && patientOk) r = 8;
  if (s.doctorId && s.date && s.time && patientOk && insuranceOk) r = 9;
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

/* ---------------- Insurance validation ----------------
 * The insurance step gates the wizard: a booking may only progress to review
 * when the payer decision is unambiguous — either "self-pay" (no coverage
 * expected) OR an insurance provider has been selected AND eligibility has
 * been verified. If verification comes back not-eligible, the user must
 * either fix the coverage details or switch to self-pay before continuing.
 */
export const insuranceSchema = z
  .object({
    payerType: z.enum(["self", "insurance"], { message: "insurance.errors.payerRequired" }),
    insuranceProviderId: z.string().nullable(),
    insuranceEstimate: z
      .object({ eligible: z.boolean() })
      .passthrough()
      .nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.payerType === "self") return;
    if (!v.insuranceProviderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["insuranceProviderId"],
        message: "insurance.errors.providerRequired",
      });
      return;
    }
    if (!v.insuranceEstimate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["insuranceEstimate"],
        message: "insurance.errors.notVerified",
      });
      return;
    }
    if (!v.insuranceEstimate.eligible) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["insuranceEstimate"],
        message: "insurance.errors.notEligible",
      });
    }
  });

export type InsuranceErrors = Partial<
  Record<"payerType" | "insuranceProviderId" | "insuranceEstimate", string>
>;

export function validateInsurance(p: State["patient"]): {
  ok: boolean;
  errors: InsuranceErrors;
} {
  const r = insuranceSchema.safeParse({
    payerType: p.payerType,
    insuranceProviderId: p.insuranceProviderId,
    insuranceEstimate: p.insuranceEstimate,
  });
  if (r.success) return { ok: true, errors: {} };
  const errors: InsuranceErrors = {};
  for (const issue of r.error.issues) {
    const k = issue.path[0] as keyof InsuranceErrors;
    if (k && !errors[k]) errors[k] = issue.message;
  }
  return { ok: false, errors };
}
