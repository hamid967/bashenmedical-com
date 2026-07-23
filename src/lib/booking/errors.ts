/**
 * Central error mapping for the /book flow.
 *
 * Every user-visible booking error goes through here so AR/EN copy, recovery
 * action, and correlation-ID surfacing stay consistent across StepReview,
 * StepSuccess, StepTime (hold expiry), and the OTP verification step.
 *
 * Keep code names aligned with the server contract in
 * `src/routes/api/public/book/create.ts` and `src/lib/booking-submit.ts`.
 */

export type BookingErrorCode =
  | "SLOT_TAKEN"
  | "HOLD_EXPIRED"
  | "HOLD_MISSING"
  | "INVALID_IDEMPOTENCY_KEY"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "OTP_RATE_LIMITED"
  | "OTP_PROVIDER_UNAVAILABLE"
  | "INSURANCE_UNVERIFIED"
  | "VALIDATION"
  | "NETWORK"
  | "TIMEOUT"
  | "SERVER"
  | "SESSION_EXPIRED"
  | "UNKNOWN";

export type BookingErrorRecovery =
  | "retry"
  | "refetch-slots"
  | "resend-otp"
  | "restart"
  | "contact-support"
  | "sign-in"
  | "none";

export type LocalizedCopy = { ar: string; en: string };

export type BookingErrorDescriptor = {
  code: BookingErrorCode;
  title: LocalizedCopy;
  message: LocalizedCopy;
  recovery: BookingErrorRecovery;
  /** True when the error is definitely recoverable in-flow without a full restart. */
  recoverable: boolean;
};

const DESCRIPTORS: Record<BookingErrorCode, Omit<BookingErrorDescriptor, "code">> = {
  SLOT_TAKEN: {
    title: { ar: "الموعد لم يعد متاحًا", en: "Slot no longer available" },
    message: {
      ar: "تم حجز هذا الوقت للتو. سنقترح عليك أقرب الأوقات المتاحة.",
      en: "This time was just booked. We'll suggest the nearest available slots.",
    },
    recovery: "refetch-slots",
    recoverable: true,
  },
  HOLD_EXPIRED: {
    title: { ar: "انتهت مهلة الحجز المؤقت", en: "Reservation hold expired" },
    message: {
      ar: "انتهت المهلة قبل إتمام الحجز. اختر الوقت مرة أخرى للاحتفاظ به.",
      en: "The hold expired before you finished. Please pick the time again.",
    },
    recovery: "refetch-slots",
    recoverable: true,
  },
  HOLD_MISSING: {
    title: { ar: "لا يوجد حجز مؤقت", en: "No active hold" },
    message: {
      ar: "يجب اختيار وقت متاح أولاً قبل التأكيد.",
      en: "You must pick an available time before confirming.",
    },
    recovery: "refetch-slots",
    recoverable: true,
  },
  INVALID_IDEMPOTENCY_KEY: {
    title: { ar: "انتهت صلاحية الجلسة", en: "Session expired" },
    message: {
      ar: "انتهت صلاحية جلسة الحجز. ابدأ من جديد للاحتفاظ ببياناتك.",
      en: "Your booking session expired. Please restart to keep your data.",
    },
    recovery: "restart",
    recoverable: false,
  },
  OTP_INVALID: {
    title: { ar: "رمز التحقق غير صحيح", en: "Invalid verification code" },
    message: {
      ar: "الرمز الذي أدخلته غير صحيح. تحقّق ثم حاول مجددًا.",
      en: "The code you entered is not correct. Please check and try again.",
    },
    recovery: "retry",
    recoverable: true,
  },
  OTP_EXPIRED: {
    title: { ar: "انتهت صلاحية الرمز", en: "Code expired" },
    message: {
      ar: "انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا.",
      en: "The verification code expired. Please request a new one.",
    },
    recovery: "resend-otp",
    recoverable: true,
  },
  OTP_RATE_LIMITED: {
    title: { ar: "محاولات كثيرة", en: "Too many attempts" },
    message: {
      ar: "تم تجاوز عدد المحاولات المسموح. حاول بعد بضع دقائق.",
      en: "You've reached the attempt limit. Please try again in a few minutes.",
    },
    recovery: "none",
    recoverable: false,
  },
  OTP_PROVIDER_UNAVAILABLE: {
    title: { ar: "خدمة الرسائل غير متاحة", en: "SMS service unavailable" },
    message: {
      ar: "تعذّر إرسال رسالة التحقق حاليًا. تواصل مع الاستقبال أو حاول لاحقًا.",
      en: "We couldn't send the verification SMS right now. Contact reception or try later.",
    },
    recovery: "contact-support",
    recoverable: false,
  },
  INSURANCE_UNVERIFIED: {
    title: { ar: "التأمين غير مفعّل", en: "Insurance not verified" },
    message: {
      ar: "لم يتم التحقق من تغطية التأمين. يمكنك المتابعة كدفع ذاتي أو المحاولة لاحقًا.",
      en: "Insurance eligibility isn't verified. You can continue as self-pay or try again.",
    },
    recovery: "retry",
    recoverable: true,
  },
  VALIDATION: {
    title: { ar: "بيانات غير مكتملة", en: "Missing information" },
    message: {
      ar: "بعض الحقول المطلوبة ناقصة أو غير صحيحة. راجع النموذج ثم حاول مجددًا.",
      en: "Some required fields are missing or invalid. Please review and retry.",
    },
    recovery: "retry",
    recoverable: true,
  },
  NETWORK: {
    title: { ar: "تعذّر الاتصال", en: "Connection problem" },
    message: {
      ar: "تحقّق من اتصال الإنترنت ثم حاول مرة أخرى.",
      en: "Check your internet connection and try again.",
    },
    recovery: "retry",
    recoverable: true,
  },
  TIMEOUT: {
    title: { ar: "استغرق الطلب وقتًا طويلاً", en: "Request took too long" },
    message: {
      ar: "لم يستجب الخادم في الوقت المتوقع. حاول مرة أخرى.",
      en: "The server didn't respond in time. Please try again.",
    },
    recovery: "retry",
    recoverable: true,
  },
  SERVER: {
    title: { ar: "خطأ مؤقت في الخادم", en: "Temporary server error" },
    message: {
      ar: "حدث خطأ مؤقت. حاول مرة أخرى بعد قليل.",
      en: "A temporary error occurred. Please try again shortly.",
    },
    recovery: "retry",
    recoverable: true,
  },
  SESSION_EXPIRED: {
    title: { ar: "انتهت صلاحية الجلسة", en: "Session expired" },
    message: {
      ar: "انتهت جلستك. سجّل الدخول مرة أخرى للمتابعة.",
      en: "Your session expired. Please sign in again to continue.",
    },
    recovery: "sign-in",
    recoverable: false,
  },
  UNKNOWN: {
    title: { ar: "تعذّر إتمام الحجز", en: "Couldn't complete booking" },
    message: {
      ar: "حدث خطأ غير متوقع. حاول مرة أخرى أو تواصل مع الاستقبال.",
      en: "An unexpected error occurred. Please try again or contact reception.",
    },
    recovery: "retry",
    recoverable: true,
  },
};

/** Resolve a code (any casing) or free-form string into a descriptor. */
export function describeBookingError(input: string | null | undefined): BookingErrorDescriptor {
  const normalized = (input ?? "").toString().trim().toUpperCase().replace(/-/g, "_");
  const code = (normalized in DESCRIPTORS ? normalized : "UNKNOWN") as BookingErrorCode;
  return { code, ...DESCRIPTORS[code] };
}

/** Map the transport-level `BookingSubmitKind` to a booking error code. */
export function kindToCode(
  kind: string | null | undefined,
  serverCode?: string | null,
): BookingErrorCode {
  if (serverCode) {
    const d = describeBookingError(serverCode);
    if (d.code !== "UNKNOWN") return d.code;
  }
  switch (kind) {
    case "validation":
      return "VALIDATION";
    case "conflict":
      return "SLOT_TAKEN";
    case "network":
      return "NETWORK";
    case "timeout":
      return "TIMEOUT";
    case "server":
    case "db":
      return "SERVER";
    default:
      return "UNKNOWN";
  }
}

/** Localized single-line label. */
export function localizedMessage(
  descriptor: BookingErrorDescriptor,
  lang: "ar" | "en",
): string {
  return descriptor.message[lang];
}

/** Format a correlation ID for user-facing display (never expose raw tokens). */
export function formatCorrelationId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.toString().trim();
  if (trimmed.length < 4) return null;
  // Short suffix is enough for support to find the trace row.
  return trimmed.slice(-8).toUpperCase();
}
