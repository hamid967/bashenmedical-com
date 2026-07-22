/**
 * Per-message threshold alerts for the AI assistants.
 * Shows a sonner toast (throttled) when a single message exceeds a
 * configurable credits or latency budget so the user gets a clear,
 * immediate warning — separate from the session-wide budget guard.
 *
 * Thresholds are persisted in localStorage so power users can raise
 * them; sensible defaults ship for everyone else.
 */
import { toast } from "sonner";

export type MessageAlertThresholds = {
  /** Warn when a single message costs more credits than this. */
  creditsPerMessage: number;
  /** Warn when a single message takes longer than this (ms). */
  latencyMsPerMessage: number;
};

export const DEFAULT_MESSAGE_ALERT_THRESHOLDS: MessageAlertThresholds = {
  creditsPerMessage: 0.05,
  latencyMsPerMessage: 20_000,
};

const LS_KEY = "baeshen.ai.msg_alert_thresholds";

export function getMessageAlertThresholds(): MessageAlertThresholds {
  if (typeof window === "undefined") return DEFAULT_MESSAGE_ALERT_THRESHOLDS;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_MESSAGE_ALERT_THRESHOLDS;
    const parsed = JSON.parse(raw) as Partial<MessageAlertThresholds>;
    return {
      creditsPerMessage:
        Number.isFinite(parsed.creditsPerMessage) && (parsed.creditsPerMessage as number) > 0
          ? (parsed.creditsPerMessage as number)
          : DEFAULT_MESSAGE_ALERT_THRESHOLDS.creditsPerMessage,
      latencyMsPerMessage:
        Number.isFinite(parsed.latencyMsPerMessage) && (parsed.latencyMsPerMessage as number) > 0
          ? (parsed.latencyMsPerMessage as number)
          : DEFAULT_MESSAGE_ALERT_THRESHOLDS.latencyMsPerMessage,
    };
  } catch {
    return DEFAULT_MESSAGE_ALERT_THRESHOLDS;
  }
}

export function setMessageAlertThresholds(next: Partial<MessageAlertThresholds>): void {
  if (typeof window === "undefined") return;
  const current = getMessageAlertThresholds();
  const merged = { ...current, ...next };
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(merged));
  } catch {
    /* ignore quota errors */
  }
}

const RECENT: Map<string, number> = new Map();
const DEDUPE_MS = 4000;

function shouldFire(key: string): boolean {
  const now = Date.now();
  const last = RECENT.get(key) ?? 0;
  if (now - last < DEDUPE_MS) return false;
  RECENT.set(key, now);
  return true;
}

function fmtCredits(n: number): string {
  if (!isFinite(n) || n <= 0) return "0";
  if (n < 0.001) return "<0.001";
  if (n < 1) return n.toFixed(3);
  return n.toFixed(2);
}

function fmtSeconds(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) : String(Math.round(s));
}

export function notifyMessageThresholds(input: {
  credits: number;
  elapsedMs: number;
  lang?: "ar" | "en";
  surface?: "public" | "portal" | "admin";
  thresholds?: MessageAlertThresholds;
}): void {
  if (typeof window === "undefined") return;
  const lang = input.lang ?? "ar";
  const isAr = lang === "ar";
  const t = input.thresholds ?? getMessageAlertThresholds();

  if (input.credits > t.creditsPerMessage && shouldFire(`credits:${input.surface ?? "x"}`)) {
    toast.warning(isAr ? "تكلفة رسالة مرتفعة" : "High message cost", {
      description: isAr
        ? `استهلكت هذه الرسالة ${fmtCredits(input.credits)} اعتماد (الحد ${fmtCredits(t.creditsPerMessage)}). فكّر في اختصار السؤال أو استخدام طراز أخف.`
        : `This message used ${fmtCredits(input.credits)} credits (limit ${fmtCredits(t.creditsPerMessage)}). Consider shortening the prompt or switching to a lighter model.`,
      duration: 6000,
    });
  }

  if (input.elapsedMs > t.latencyMsPerMessage && shouldFire(`latency:${input.surface ?? "x"}`)) {
    toast.warning(isAr ? "زمن التوليد طويل" : "Slow generation", {
      description: isAr
        ? `استغرقت هذه الرسالة ${fmtSeconds(input.elapsedMs)} ثانية (الحد ${fmtSeconds(t.latencyMsPerMessage)}). قد يكون الطراز مشغولًا — جرّب مرة أخرى أو استخدم طراز أسرع.`
        : `This message took ${fmtSeconds(input.elapsedMs)}s (limit ${fmtSeconds(t.latencyMsPerMessage)}s). The model may be busy — retry or switch to a faster model.`,
      duration: 6000,
    });
  }
}
