/**
 * Shared Zod primitives for the public /book/* GET endpoints.
 *
 * All error messages are stable string codes (never localized prose) so the
 * client can map them to translations and E2E tests can assert on them
 * without fragile substring matching. Codes are kept in one place so the
 * three availability endpoints (availability, month-availability,
 * resolve-any-doctor) stay perfectly in sync.
 *
 * Convention:
 *   - `invalid_<field>`     — malformed value (regex/type/uuid failure)
 *   - `<field>_out_of_range` — numerically valid but outside accepted window
 *   - `missing_scope`       — neither doctor_id nor specialty_id provided
 */
import { z } from "zod";

/** Error codes returned in `{ ok:false, error: <code> }` bodies. */
export const BookingErrorCode = {
  invalid_date: "invalid_date",
  invalid_calendar_date: "invalid_calendar_date",
  date_out_of_range: "date_out_of_range",
  invalid_time: "invalid_time",
  time_out_of_range: "time_out_of_range",
  invalid_year: "invalid_year",
  invalid_month: "invalid_month",
  invalid_doctor_id: "invalid_doctor_id",
  invalid_specialty_id: "invalid_specialty_id",
  invalid_branch_id: "invalid_branch_id",
  invalid_session: "invalid_session",
  missing_scope: "missing_scope",
  invalid_query: "invalid_query",
} as const;
export type BookingErrorCode = (typeof BookingErrorCode)[keyof typeof BookingErrorCode];

/** Rolling accepted window relative to Riyadh "today" — matches the calendar
 *  UI which never lets a patient pick a slot more than ~2y ahead or before
 *  today. Anything outside gets a stable `date_out_of_range` code. */
const MAX_DAYS_IN_PAST = 1; // allow "today" even across TZ drift
const MAX_DAYS_IN_FUTURE = 730; // ~2 years

function isRealCalendarDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const A = Date.UTC(ay, am - 1, ad);
  const B = Date.UTC(by, bm - 1, bd);
  return Math.round((A - B) / 86_400_000);
}

function riyadhTodayIso(): string {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

/**
 * `YYYY-MM-DD` with three tiers of checks so the error message tells the
 * client exactly which rule failed:
 *   1. shape (regex)                  → invalid_date
 *   2. real calendar day (e.g. 02-30) → invalid_calendar_date
 *   3. inside acceptance window       → date_out_of_range
 */
export const IsoDate = z
  .string({ error: BookingErrorCode.invalid_date })
  .regex(/^\d{4}-\d{2}-\d{2}$/, BookingErrorCode.invalid_date)
  .refine(isRealCalendarDate, { message: BookingErrorCode.invalid_calendar_date })
  .refine(
    (iso) => {
      const delta = daysBetween(iso, riyadhTodayIso());
      return delta >= -MAX_DAYS_IN_PAST && delta <= MAX_DAYS_IN_FUTURE;
    },
    { message: BookingErrorCode.date_out_of_range },
  );

/**
 * `HH:MM` on a 24-hour clock. Regex enforces two-digit segments; refine
 * enforces the semantic range (00-23 / 00-59) so "25:00" and "10:70" get
 * `time_out_of_range` instead of a shape error.
 */
export const IsoTime = z
  .string({ error: BookingErrorCode.invalid_time })
  .regex(/^\d{2}:\d{2}$/, BookingErrorCode.invalid_time)
  .refine(
    (s) => {
      const [h, m] = s.split(":").map(Number);
      return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    },
    { message: BookingErrorCode.time_out_of_range },
  );

/** UUID with the error code baked in — one place to change the wording. */
export const DoctorId = z.string().uuid(BookingErrorCode.invalid_doctor_id);
export const SpecialtyId = z.string().uuid(BookingErrorCode.invalid_specialty_id);
export const BranchId = z.string().uuid(BookingErrorCode.invalid_branch_id);

/**
 * Wizard session id used to skip the caller's own slot holds. Format is a
 * client-generated opaque string — we only assert it looks like a printable
 * token of reasonable length so a malicious client can't stuff arbitrary
 * bytes into a query key that later ends up in cache keys.
 */
export const SessionId = z
  .string()
  .min(1, BookingErrorCode.invalid_session)
  .max(128, BookingErrorCode.invalid_session)
  .regex(/^[A-Za-z0-9_.:-]+$/, BookingErrorCode.invalid_session);

export const YearField = z.coerce
  .number({ error: BookingErrorCode.invalid_year })
  .int(BookingErrorCode.invalid_year)
  .min(2000, BookingErrorCode.invalid_year)
  .max(2100, BookingErrorCode.invalid_year);

export const MonthField = z.coerce
  .number({ error: BookingErrorCode.invalid_month })
  .int(BookingErrorCode.invalid_month)
  .min(1, BookingErrorCode.invalid_month)
  .max(12, BookingErrorCode.invalid_month);

/** Extract the first Zod issue's `message` and coerce it to a known code. */
export function firstZodErrorCode(err: z.ZodError): BookingErrorCode {
  const raw = err.issues[0]?.message;
  if (raw && raw in BookingErrorCode) return raw as BookingErrorCode;
  return BookingErrorCode.invalid_query;
}
