/**
 * JazanIntro — lightweight 8–12s cinematic Jazan-heritage intro overlay.
 *
 * - Pure inline SVG + CSS transitions, no heavy video/lottie.
 * - Skip button + reduced-motion static alternative.
 * - Shows once per configurable period (localStorage, default 7 days).
 * - No autoplay audio.
 *
 * Config lives in `INTRO_CONFIG` below — swap to a DB-driven read if needed.
 */
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import bmcLogoAsset from "@/assets/bmc-logo-transparent.png.asset.json";
import { JazanPattern } from "@/components/jazan/JazanPattern";
import { useJazanSettings } from "@/components/jazan/JazanSettingsProvider";
import { trackEvent } from "@/lib/analytics";

const bmcLogo = bmcLogoAsset.url;

const STORAGE_KEY = "bmc_jazan_intro_last_v1";
const DISABLED_KEY = "bmc_jazan_intro_disabled_v1";
const DEBUG_KEY = "bmc_jazan_intro_debug";

/** Debug logging gated on Vite DEV or a manual localStorage flag (`bmc_jazan_intro_debug=1`). */
function isDebugEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem(DEBUG_KEY) === "1") return true;
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function debugLog(event: string, payload: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;
  const stamp = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `%c[JazanIntro]%c ${event} %c${stamp}`,
    "color:#075E63;font-weight:bold",
    "color:inherit;font-weight:600",
    "color:#9AA0A6;font-weight:normal",
  );
  if ("reason" in payload) {
    // eslint-disable-next-line no-console
    console.log("reason:", payload.reason);
  }
  if ("duration_ms" in payload) {
    // eslint-disable-next-line no-console
    console.log("duration_ms:", payload.duration_ms);
  }
  // eslint-disable-next-line no-console
  console.log("payload:", payload);
  // eslint-disable-next-line no-console
  console.groupEnd();
}

/** Fallback defaults; live values come from JazanSettingsProvider. */
export const INTRO_CONFIG = {
  enabled: true,
  cooldownHours: 24 * 7,
  durationMs: 10_000,
  textAr: {
    tagline: "من جازان… نعتني بصحتكم",
    brand: "مجمع باعشن الطبي",
  },
  textEn: {
    tagline: "From Jazan… we care for your health",
    brand: "Baeshen Medical Center",
  },
};

function shouldShow(enabled: boolean, cooldownHours: number): boolean {
  if (!enabled) return false;
  try {
    if (localStorage.getItem(DISABLED_KEY) === "1") return false;
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) return true;
    const ageMs = Date.now() - Number(last);
    return ageMs > cooldownHours * 3_600_000;
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function markDisabled() {
  try {
    localStorage.setItem(DISABLED_KEY, "1");
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

function readLang(): "ar" | "en" {
  try {
    const l = localStorage.getItem("lang");
    if (l === "en" || l === "ar") return l;
    return document.documentElement.dir === "ltr" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

export function JazanIntro() {
  const settings = useJazanSettings();
  const introCfg = settings.intro;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4>(0);
  const reduced = useReducedMotion();
  const [lang, setLang] = useState<"ar" | "en">("ar");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const skipBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const shownAtRef = useRef<number>(0);
  const endedRef = useRef<boolean>(false);

  const endIntro = (reason: "completed" | "skipped" | "escape" | "disabled" | "reduced_motion") => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (reason === "disabled") {
      markDisabled();
    } else {
      markSeen();
    }
    const endedPayload = {
      reason,
      duration_ms: shownAtRef.current ? Date.now() - shownAtRef.current : 0,
      lang,
      reduced_motion: reduced,
      disabled_forever: reason === "disabled",
    };
    trackEvent("jazan_intro_ended", endedPayload);
    debugLog("jazan_intro_ended", endedPayload);
    setVisible(false);
    window.setTimeout(() => setMounted(false), 500);
  };

  const dismiss = () => endIntro("skipped");

  useEffect(() => {
    setLang(readLang());
    if (!shouldShow(introCfg.enabled, introCfg.cooldownHours)) {
      trackEvent("jazan_intro_suppressed", {
        reason: !introCfg.enabled
          ? "disabled_by_settings"
          : typeof window !== "undefined" && localStorage.getItem(DISABLED_KEY) === "1"
            ? "user_opted_out"
            : "cooldown",
      });
      return;
    }
    setMounted(true);
    shownAtRef.current = Date.now();
    trackEvent("jazan_intro_shown", {
      cooldown_hours: introCfg.cooldownHours,
      duration_ms: introCfg.durationMs,
    });
    requestAnimationFrame(() => setVisible(true));
  }, [introCfg.enabled, introCfg.cooldownHours]);

  useEffect(() => {
    if (!mounted) return;
    if (reduced) {
      const t = window.setTimeout(() => endIntro("reduced_motion"), 3_000);
      return () => window.clearTimeout(t);
    }
    const total = Math.max(4_000, introCfg.durationMs);
    const seq: Array<{ t: number; phase: 0 | 1 | 2 | 3 | 4 }> = [
      { t: Math.round(total * 0.04), phase: 1 },
      { t: Math.round(total * 0.24), phase: 2 },
      { t: Math.round(total * 0.5), phase: 3 },
      { t: Math.round(total * 0.74), phase: 4 },
    ];
    const timers = seq.map(({ t, phase }) => window.setTimeout(() => setPhase(phase), t));
    const end = window.setTimeout(() => endIntro("completed"), total);
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, reduced, introCfg.durationMs]);

  // Focus management: save previous focus, focus skip button, restore on unmount.
  // Escape closes; Tab is trapped inside the dialog.
  useEffect(() => {
    if (!mounted) return;
    prevFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const raf = requestAnimationFrame(() => skipBtnRef.current?.focus());

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusable = (): HTMLElement[] => {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        endIntro("escape");
        return;
      }
      if (e.key === "Tab") {
        const focusables = getFocusable();
        if (focusables.length === 0) {
          e.preventDefault();
          skipBtnRef.current?.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        try { prev.focus(); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted) return null;
  const isAr = lang === "ar";
  const text = isAr
    ? { tagline: introCfg.taglineAr, brand: introCfg.headlineAr }
    : { tagline: introCfg.taglineEn, brand: introCfg.headlineEn };
  const logoSrc = introCfg.logoUrl?.trim() || bmcLogo;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      dir={isAr ? "rtl" : "ltr"}
      className="fixed inset-0 z-[100] transition-opacity duration-500"
      style={{
        opacity: visible ? 1 : 0,
        background:
          "radial-gradient(60% 60% at 50% 40%, #FFFFFF 0%, var(--jazan-ivory) 55%, var(--jazan-sand-warm) 100%)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <p id={descId} className="sr-only">
        {isAr
          ? "شاشة مقدمة قصيرة. اضغط زر تخطي أو مفتاح Escape للانتقال إلى المحتوى."
          : "Short intro screen. Press the skip button or Escape to continue."}
      </p>

      {/* faint Jazan pattern edges */}
      <div className="absolute inset-x-0 top-0 h-16 opacity-40" aria-hidden="true">
        <JazanPattern variant="standard" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-16 opacity-40 rotate-180" aria-hidden="true">
        <JazanPattern variant="standard" />
      </div>

      {/* Controls — Skip + Don't show again, both 44×44 min */}
      <div className="absolute top-4 end-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => endIntro("disabled")}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--jazan-hairline)] bg-white/70 backdrop-blur px-4 py-2 text-xs font-medium text-[var(--jazan-teal)] shadow-sm hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--jazan-teal)]"
          aria-label={isAr ? "عدم عرض المقدمة مجددًا" : "Don't show intro again"}
        >
          {isAr ? "لا تُظهرها مجددًا" : "Don't show again"}
        </button>
        <button
          ref={skipBtnRef}
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-[var(--jazan-hairline-strong)] bg-white/80 backdrop-blur px-4 py-2 text-sm font-semibold text-[var(--jazan-teal)] shadow-sm hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--jazan-teal)]"
          aria-label={isAr ? "تخطي المقدمة" : "Skip intro"}
        >
          <span>{isAr ? "تخطي" : "Skip"}</span>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Reduced-motion static poster */}
      {reduced ? (
        <div className="absolute inset-0 grid place-items-center text-center px-6">
          <div className="max-w-md">
            <img
              src={logoSrc}
              alt=""
              aria-hidden="true"
              width={96}
              height={96}
              className="mx-auto h-24 w-24 object-contain"
            />
            <h2 id={titleId} className="mt-4 text-2xl md:text-3xl font-extrabold text-[var(--jazan-teal)]">
              {text.brand}
            </h2>
            <p className="mt-2 text-sm md:text-base text-[var(--jazan-terracotta)] font-semibold">
              {text.tagline}
            </p>
          </div>
        </div>
      ) : (
        <CinematicStage phase={phase} text={text} logoSrc={logoSrc} titleId={titleId} />
      )}
    </div>
  );
}

function CinematicStage({
  phase,
  text,
  logoSrc,
  titleId,
}: {
  phase: 0 | 1 | 2 | 3 | 4;
  text: { tagline: string; brand: string };
  logoSrc: string;
  titleId: string;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6 overflow-hidden">
      {/* Cinematic SVG canvas */}
      <svg
        viewBox="0 0 800 500"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="j-int-mtn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--jazan-teal)" }} stopOpacity="0" />
            <stop offset="100%" style={{ stopColor: "var(--jazan-teal)" }} stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id="j-int-mtn2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--jazan-palm)" }} stopOpacity="0" />
            <stop offset="100%" style={{ stopColor: "var(--jazan-palm)" }} stopOpacity="0.32" />
          </linearGradient>
          <linearGradient id="j-int-terr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--jazan-terracotta)" }} stopOpacity="0" />
            <stop offset="100%" style={{ stopColor: "var(--jazan-terracotta)" }} stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {/* Geometric lines form (phase >= 1) */}
        <g
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transition: "opacity 900ms ease-out",
            stroke: "var(--jazan-gold)",
          }}
          strokeWidth="0.8"
          fill="none"
        >
          <path d="M100 250 L400 100 L700 250 L400 400 Z" opacity="0.55" />
          <path d="M180 250 L400 160 L620 250 L400 340 Z" opacity="0.7" />
          <path d="M260 250 L400 210 L540 250 L400 290 Z" />
          <circle cx="400" cy="250" r="4" style={{ fill: "var(--jazan-terracotta)" }} stroke="none" />
        </g>

        {/* Mountain/coast landscape (phase >= 2) */}
        <g
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 1200ms ease-out, transform 1200ms ease-out",
          }}
        >
          <path
            d="M0 380 L120 320 L260 360 L420 290 L580 350 L720 300 L800 340 L800 500 L0 500 Z"
            fill="url(#j-int-mtn)"
          />
          <path
            d="M0 420 L160 360 L340 400 L520 360 L700 400 L800 380 L800 500 L0 500 Z"
            fill="url(#j-int-mtn2)"
          />
          <path
            d="M0 460 L200 430 L400 455 L620 425 L800 450 L800 500 L0 500 Z"
            fill="url(#j-int-terr)"
          />
          {/* coastal reflection dashes */}
          <line
            x1="0"
            y1="478"
            x2="800"
            y2="478"
            style={{ stroke: "var(--jazan-teal-light)" }}
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="4 8"
          />
          {/* palm frond, corner */}
          <g
            style={{ stroke: "var(--jazan-palm)" }}
            strokeWidth="1"
            fill="none"
            opacity="0.55"
            strokeLinecap="round"
          >
            <path d="M60 500 L60 360" />
            {Array.from({ length: 6 }).map((_, i) => {
              const y = 360 + i * 22;
              const len = 30 - i * 3;
              return (
                <g key={i}>
                  <path d={`M60 ${y} Q ${60 - len / 2} ${y - 10} ${60 - len} ${y - 6}`} />
                  <path d={`M60 ${y} Q ${60 + len / 2} ${y - 10} ${60 + len} ${y - 6}`} />
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Logo + text overlay (phase >= 3) */}
      <div className="relative z-10 text-center">
        <div
          style={{
            opacity: phase >= 3 ? 1 : 0,
            transform: phase >= 3 ? "scale(1)" : "scale(0.92)",
            transition: "opacity 800ms ease-out, transform 800ms ease-out",
          }}
        >
          <img
            src={logoSrc}
            alt=""
            width={96}
            height={96}
            className="mx-auto h-24 w-24 object-contain drop-shadow-[0_6px_18px_rgba(7,94,99,0.25)]"
          />
        </div>

        <p
          className="mt-4 text-lg md:text-2xl font-semibold text-[var(--jazan-terracotta)]"
          style={{
            opacity: phase >= 3 ? 1 : 0,
            transform: phase >= 3 ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 900ms ease-out 150ms, transform 900ms ease-out 150ms",
          }}
        >
          {text.tagline}
        </p>
        <h1
          id={titleId}
          className="mt-2 text-2xl md:text-4xl font-extrabold text-[var(--jazan-teal)] tracking-tight"
          style={{
            opacity: phase >= 4 ? 1 : 0,
            transform: phase >= 4 ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 900ms ease-out, transform 900ms ease-out",
            letterSpacing: "-0.02em",
          }}
        >
          {text.brand}
        </h1>

        {/* small divider ornament under brand */}
        <div
          className="mx-auto mt-4 h-3 w-24 opacity-80"
          style={{
            opacity: phase >= 4 ? 1 : 0,
            transition: "opacity 700ms ease-out 200ms",
          }}
        >
          <svg viewBox="0 0 96 12" className="h-full w-full" aria-hidden="true">
            <line
              x1="0"
              y1="6"
              x2="36"
              y2="6"
              style={{ stroke: "var(--jazan-gold)" }}
              strokeWidth="1"
            />
            <path
              d="M48 1 L58 6 L48 11 L38 6 Z"
              style={{ fill: "var(--jazan-gold)" }}
              opacity="0.8"
            />
            <line
              x1="60"
              y1="6"
              x2="96"
              y2="6"
              style={{ stroke: "var(--jazan-gold)" }}
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default JazanIntro;
