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
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import bmcLogoAsset from "@/assets/bmc-logo-transparent.png.asset.json";
import { JazanPattern } from "@/components/jazan/JazanPattern";

const bmcLogo = bmcLogoAsset.url;

const STORAGE_KEY = "bmc_jazan_intro_last_v1";

/** Editable defaults. A Super Admin panel can override these later. */
export const INTRO_CONFIG = {
  enabled: true,
  /** Show again after this many hours since last view (0 = every visit). */
  cooldownHours: 24 * 7,
  /** Total cinematic length in ms (8–12s recommended). */
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

function shouldShow(): boolean {
  if (!INTRO_CONFIG.enabled) return false;
  try {
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) return true;
    const ageMs = Date.now() - Number(last);
    return ageMs > INTRO_CONFIG.cooldownHours * 3_600_000;
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
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<0 | 1 | 2 | 3 | 4>(0);
  const reduced = useReducedMotion();
  const [lang, setLang] = useState<"ar" | "en">("ar");

  useEffect(() => {
    setLang(readLang());
    if (!shouldShow()) return;
    setMounted(true);
    // next frame → trigger fade-in
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (reduced) {
      // Static poster: auto-dismiss after 3s
      const t = window.setTimeout(dismiss, 3_000);
      return () => window.clearTimeout(t);
    }
    // Cinematic sequence: pattern → landscape → logo → tagline → brand → out
    const seq: Array<{ t: number; phase: 0 | 1 | 2 | 3 | 4 }> = [
      { t: 400, phase: 1 },
      { t: 2_400, phase: 2 },
      { t: 5_000, phase: 3 },
      { t: 7_400, phase: 4 },
    ];
    const timers = seq.map(({ t, phase }) => window.setTimeout(() => setPhase(phase), t));
    const end = window.setTimeout(dismiss, INTRO_CONFIG.durationMs);
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, reduced]);

  const dismiss = () => {
    markSeen();
    setVisible(false);
    window.setTimeout(() => setMounted(false), 500);
  };

  if (!mounted) return null;
  const isAr = lang === "ar";
  const text = isAr ? INTRO_CONFIG.textAr : INTRO_CONFIG.textEn;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isAr ? "مقدمة مجمع باعشن الطبي" : "Baeshen Medical intro"}
      dir={isAr ? "rtl" : "ltr"}
      className="fixed inset-0 z-[100] transition-opacity duration-500"
      style={{
        opacity: visible ? 1 : 0,
        background:
          "radial-gradient(60% 60% at 50% 40%, #FFFFFF 0%, #FCF9F2 55%, #F6E9D2 100%)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* faint Jazan pattern edges */}
      <div className="absolute inset-x-0 top-0 h-16 opacity-40">
        <JazanPattern variant="standard" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-16 opacity-40 rotate-180">
        <JazanPattern variant="standard" />
      </div>

      {/* Skip button */}
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-4 end-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--jazan-gold)]/60 bg-white/80 backdrop-blur px-3 py-1.5 text-xs font-semibold text-[var(--jazan-teal)] shadow-sm hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jazan-teal)]"
        aria-label={isAr ? "تخطي المقدمة" : "Skip intro"}
      >
        {isAr ? "تخطي المقدمة" : "Skip intro"}
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Reduced-motion static poster */}
      {reduced ? (
        <div className="absolute inset-0 grid place-items-center text-center px-6">
          <div className="max-w-md">
            <img
              src={bmcLogo}
              alt=""
              width={96}
              height={96}
              className="mx-auto h-24 w-24 object-contain"
            />
            <h2 className="mt-4 text-2xl md:text-3xl font-extrabold text-[var(--jazan-teal)]">
              {text.brand}
            </h2>
            <p className="mt-2 text-sm md:text-base text-[var(--jazan-terracotta)] font-semibold">
              {text.tagline}
            </p>
          </div>
        </div>
      ) : (
        <CinematicStage phase={phase} text={text} />
      )}
    </div>
  );
}

function CinematicStage({
  phase,
  text,
}: {
  phase: 0 | 1 | 2 | 3 | 4;
  text: { tagline: string; brand: string };
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
            <stop offset="0%" stopColor="#075E63" stopOpacity="0" />
            <stop offset="100%" stopColor="#075E63" stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id="j-int-mtn2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#24745E" stopOpacity="0" />
            <stop offset="100%" stopColor="#24745E" stopOpacity="0.32" />
          </linearGradient>
          <linearGradient id="j-int-terr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B85C3C" stopOpacity="0" />
            <stop offset="100%" stopColor="#B85C3C" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {/* Geometric lines form (phase >= 1) */}
        <g
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transition: "opacity 900ms ease-out",
          }}
          stroke="#C7A46B"
          strokeWidth="0.8"
          fill="none"
        >
          <path d="M100 250 L400 100 L700 250 L400 400 Z" opacity="0.55" />
          <path d="M180 250 L400 160 L620 250 L400 340 Z" opacity="0.7" />
          <path d="M260 250 L400 210 L540 250 L400 290 Z" />
          <circle cx="400" cy="250" r="4" fill="#B85C3C" stroke="none" />
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
            stroke="#0B8585"
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="4 8"
          />
          {/* palm frond, corner */}
          <g
            stroke="#24745E"
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
            src={bmcLogo}
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
              stroke="#C7A46B"
              strokeWidth="1"
            />
            <path
              d="M48 1 L58 6 L48 11 L38 6 Z"
              fill="#C7A46B"
              opacity="0.8"
            />
            <line
              x1="60"
              y1="6"
              x2="96"
              y2="6"
              stroke="#C7A46B"
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default JazanIntro;
