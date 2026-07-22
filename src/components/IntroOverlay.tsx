import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  ShieldCheck,
  Users,
  Activity,
  Award,
  Building2,
  Clock,
  Star,
  ClipboardList,
  Info,
  Stethoscope,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import bmcLogoAsset from "@/assets/bmc-logo-transparent.png.asset.json";
import introNarrationAsset from "@/assets/intro-narration-ar.mp3.asset.json";
import {
  DEFAULT_INTRO_SETTINGS,
  resolveIcon,
  type IntroSettingsRow,
  type SceneKey,
} from "@/lib/intro-config";
import { LazyImage, LazyVideo } from "@/components/LazyMedia";
import { prefetchMedia, prefetchCompletedBefore, getPrefetchStatus } from "@/lib/media-prefetch";

const bmcLogo = bmcLogoAsset.url;
const introNarrationUrl = introNarrationAsset.url;

const SESSION_KEY = "baeshen_intro_seen_v3";
const DISABLE_KEY = "baeshen_intro_disabled";
const ANALYTICS_STATE_KEY = "baeshen_intro_analytics_v1";

type IntroOutcome =
  "skip" | "complete" | "cta_book" | "cta_services" | "disabled_forever" | "reduced_motion_close";

type IntroAnalyticsState = {
  shown_at: number;
  outcome?: IntroOutcome;
  outcome_at?: number;
  elapsed_ms?: number;
  scene?: string;
  variant?: "full" | "reduced";
};

function readAnalyticsState(): IntroAnalyticsState | null {
  try {
    const raw = sessionStorage.getItem(ANALYTICS_STATE_KEY);
    return raw ? (JSON.parse(raw) as IntroAnalyticsState) : null;
  } catch {
    return null;
  }
}

function writeAnalyticsState(state: IntroAnalyticsState) {
  try {
    sessionStorage.setItem(ANALYTICS_STATE_KEY, JSON.stringify(state));
  } catch {
    /* noop */
  }
}

function sceneFromMs(ms: number): string {
  if (ms < 4000) return "pulse";
  if (ms < 8000) return "brand";
  if (ms < 16000) return "services";
  if (ms < 23000) return "stats";
  if (ms < 27000) return "booking";
  return "final";
}

const CHARCOAL = "#0a0f16";
const CHARCOAL_SOFT = "#111823";
const CRESCENT_RED = "#c8232c";
const BAESHEN_BLUE = "#1e3a5f";
const BAESHEN_BLUE_SOFT = "#2f5a8f";
const SILVER = "#d7dce3";
const GOLD = "#c9a84c";

const TOTAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Resolved service / stat shapes used by the scene components
// ---------------------------------------------------------------------------
type IntroService = {
  id: string;
  titleAr: string;
  titleEn: string;
  Icon: LucideIcon;
  image?: string;
  video?: string;
};
type Stat = {
  id: string;
  labelAr: string;
  value: number;
  suffix?: string;
  prefix?: string;
  Icon: LucideIcon;
  source: string;
  updatedAt: number;
  live?: boolean;
  image?: string;
};

function useIntroPreferences() {
  const [disabled, setDisabled] = useState(false);
  useEffect(() => {
    try {
      setDisabled(localStorage.getItem(DISABLE_KEY) === "1");
    } catch {
      /* noop */
    }
  }, []);
  return { disabled };
}

// Fetch admin-editable intro settings. Falls back to hardcoded defaults on
// error so the overlay never blocks the visitor.
function useIntroSettings(enabled: boolean): IntroSettingsRow {
  const [settings, setSettings] = useState<IntroSettingsRow>(DEFAULT_INTRO_SETTINGS);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("intro_settings")
        .select("*")
        .eq("id", "default")
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const row = data as unknown as Partial<IntroSettingsRow>;
      setSettings({
        ...DEFAULT_INTRO_SETTINGS,
        ...row,
        services:
          Array.isArray(row.services) && row.services.length
            ? row.services
            : DEFAULT_INTRO_SETTINGS.services,
        stat_metrics:
          Array.isArray(row.stat_metrics) && row.stat_metrics.length
            ? row.stat_metrics
            : DEFAULT_INTRO_SETTINGS.stat_metrics,
        scene_order:
          Array.isArray(row.scene_order) && row.scene_order.length
            ? row.scene_order
            : DEFAULT_INTRO_SETTINGS.scene_order,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return settings;
}

function usePublicClinicStatistics(enabled: boolean, settings: IntroSettingsRow) {
  const [stats, setStats] = useState<Stat[]>([]);
  const updatedAtMs = Date.parse(settings.updated_at) || Date.now();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      // For any `live` metric, look it up in the DB. Currently only "doctors" is wired.
      const needsDoctors = settings.stat_metrics.some((m) => m.live && m.id === "doctors");
      let doctorsCount: number | null = null;
      if (needsDoctors) {
        try {
          const r = await supabase
            .from("doctors")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true);
          doctorsCount = r.error ? null : (r.count ?? null);
        } catch {
          doctorsCount = null;
        }
      }
      if (cancelled) return;
      const now = Date.now();
      const out: Stat[] = [];
      for (const m of settings.stat_metrics) {
        let value: number | null = m.value ?? null;
        let updated = updatedAtMs;
        if (m.live && m.id === "doctors") {
          value = doctorsCount;
          updated = now;
        }
        if (value == null || value <= 0) continue;
        out.push({
          id: m.id,
          labelAr: m.labelAr,
          value,
          prefix: m.prefix,
          suffix: m.suffix,
          Icon: resolveIcon(m.icon, Award),
          image: m.image,
          source: m.source,
          updatedAt: updated,
          live: !!m.live,
        });
      }
      setStats(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, settings, updatedAtMs]);
  return stats;
}

function formatUpdatedAt(ms: number): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function useTicker(active: boolean) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      setMs(t - start);
      if (t - start < TOTAL_MS) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return ms;
}

function Counter({
  value,
  prefix = "",
  suffix = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span>
      {prefix}
      {n.toLocaleString("ar-EG")}
      {suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------
export function IntroOverlay({ theme = "dark" as "dark" | "light" }) {
  void theme;
  const prefersReducedMotion = useReducedMotion();
  const { disabled } = useIntroPreferences();
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [muted, setMuted] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [caption, setCaption] = useState<string>("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const narrationRef = useRef<HTMLAudioElement | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const shownAtRef = useRef<number>(0);
  const shownFiredRef = useRef(false);
  const outcomeFiredRef = useRef(false);
  const msRef = useRef(0);
  const skipBtnRef = useRef<HTMLButtonElement | null>(null);
  const reducedCloseBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  const [announcedScene, setAnnouncedScene] = useState<string>("");
  const sceneLabels: Record<string, string> = useMemo(
    () => ({
      pulse: "المشهد الأول: نبض من قلب صبيا",
      brand: "المشهد الثاني: هوية مجمع باعشن الطبي",
      services: "المشهد الثالث: خدماتنا الطبية",
      stats: "المشهد الرابع: أرقامنا",
      booking: "المشهد الخامس: خطوات الحجز",
      final: "المشهد الأخير: احجز موعدك الآن",
      reduced: "مقدمة مختصرة لمجمع باعشن الطبي",
    }),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (disabled) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
    } catch {
      /* noop */
    }
    setVisible(true);
  }, [disabled]);

  const ms = useTicker(visible && !prefersReducedMotion);
  useEffect(() => {
    msRef.current = ms;
  }, [ms]);
  const settings = useIntroSettings(visible);
  const services: IntroService[] = useMemo(
    () =>
      settings.services.map((s) => ({
        id: s.id,
        titleAr: s.titleAr,
        titleEn: s.titleEn,
        Icon: resolveIcon(s.icon, Stethoscope),
        image: s.image,
        video: s.video,
      })),
    [settings],
  );
  const stats = usePublicClinicStatistics(visible, settings);

  // Sync aria-live announcements with scene changes
  const currentScene = prefersReducedMotion ? "reduced" : sceneFromMs(ms);
  useEffect(() => {
    if (!visible) return;
    setAnnouncedScene(sceneLabels[currentScene] ?? "");
  }, [visible, currentScene, sceneLabels]);

  // Announce when live statistics finish loading
  const [statsAnnouncement, setStatsAnnouncement] = useState<string>("");
  useEffect(() => {
    if (!visible || currentScene !== "stats" || stats.length === 0) return;
    const parts = stats
      .filter((s) => s.value > 0)
      .slice(0, 4)
      .map((s) => `${s.prefix ?? ""}${s.value}${s.suffix ?? ""} ${s.labelAr}`);
    if (parts.length) setStatsAnnouncement(`تحديث الإحصائيات: ${parts.join("، ")}`);
  }, [visible, currentScene, stats]);

  // Fire `intro_shown` once per session when the overlay first appears
  useEffect(() => {
    if (!visible || shownFiredRef.current) return;
    shownFiredRef.current = true;
    shownAtRef.current = Date.now();
    const variant: "full" | "reduced" = prefersReducedMotion ? "reduced" : "full";
    writeAnalyticsState({ shown_at: shownAtRef.current, variant });
    trackEvent("intro_shown", {
      variant,
      audio_muted_default: true,
      total_duration_ms: prefersReducedMotion ? 2500 : TOTAL_MS,
    });
  }, [visible, prefersReducedMotion]);

  const finish = (reason: IntroOutcome = "complete", target?: string) => {
    if (fading) return;
    setFading(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* noop */
    }
    stopHeartbeat();

    if (!outcomeFiredRef.current) {
      outcomeFiredRef.current = true;
      const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : msRef.current;
      const scene = prefersReducedMotion ? "reduced" : sceneFromMs(msRef.current);
      const eventName = reason === "complete" ? "intro_completed" : "intro_skipped";
      const props = {
        reason,
        scene,
        elapsed_ms: elapsed,
        variant: prefersReducedMotion ? "reduced" : "full",
        audio_enabled: !muted,
        target: target ?? null,
      };
      trackEvent(eventName, props);
      // Persist the outcome so later code (or a debug panel) can see what happened this session
      const prev = readAnalyticsState() ?? { shown_at: shownAtRef.current || Date.now() };
      writeAnalyticsState({
        ...prev,
        outcome: reason,
        outcome_at: Date.now(),
        elapsed_ms: elapsed,
        scene,
        variant: prefersReducedMotion ? "reduced" : "full",
      });
    }

    setTimeout(() => {
      setVisible(false);
      if (target) navigate({ to: target }).catch(() => {});
    }, 500);
  };

  // Auto-finish
  useEffect(() => {
    if (!visible) return;
    const dur = prefersReducedMotion ? 2500 : TOTAL_MS + 200;
    const t = window.setTimeout(() => finish("complete"), dur);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, prefersReducedMotion]);

  const startHeartbeat = () => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;
      const beat = (delay: number, freq = 60, gain = 0.22) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        const now = ctx.currentTime + delay;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(gain, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        o.connect(g).connect(ctx.destination);
        o.start(now);
        o.stop(now + 0.3);
      };
      const cycle = () => {
        beat(0, 62, 0.24);
        beat(0.2, 55, 0.18);
      };
      cycle();
      heartbeatTimerRef.current = window.setInterval(cycle, 1000);
      setAudioReady(true);
    } catch (err) {
      console.warn("[IntroOverlay] audio unavailable:", err);
      setAudioFailed(true);
      setAudioReady(false);
      setMuted(true);
    }
  };

  const stopHeartbeat = () => {
    if (heartbeatTimerRef.current) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    try {
      audioCtxRef.current?.close();
    } catch {
      /* noop */
    }
    audioCtxRef.current = null;
    setAudioReady(false);
  };

  const playNarration = () => {
    try {
      const el = narrationRef.current;
      if (!el) return;
      el.currentTime = 0;
      el.volume = 0.9;
      void el.play().catch(() => {});
    } catch {
      /* noop */
    }
  };
  const stopNarration = () => {
    try {
      narrationRef.current?.pause();
    } catch {
      /* noop */
    }
    setCaption("");
  };

  // Time-synced Arabic captions for the narration audio (total ≈ 21.4s).
  const NARRATION_CUES: Array<{ t: number; text: string }> = useMemo(
    () => [
      { t: 0.0, text: "من قلب صبيا… تبدأ رعايتنا" },
      { t: 3.6, text: "مجمع باعشن الطبي" },
      { t: 6.2, text: "صحتك… أولويتنا" },
      { t: 8.8, text: "رعاية متكاملة، فريق من الاستشاريين" },
      { t: 13.4, text: "وخدمات تخصصية على مدار الأسبوع" },
      { t: 17.6, text: "احجز موعدك الآن" },
      { t: 21.4, text: "" },
    ],
    [],
  );

  useEffect(() => {
    const el = narrationRef.current;
    if (!el) return;
    const onTime = () => {
      const now = el.currentTime;
      let active = "";
      for (const cue of NARRATION_CUES) {
        if (now >= cue.t) active = cue.text;
        else break;
      }
      setCaption((prev) => (prev === active ? prev : active));
    };
    const onEnd = () => setCaption("");
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
    };
  }, [NARRATION_CUES]);

  const toggleMute = () => {
    if (muted) {
      startHeartbeat();
      playNarration();
      setMuted(false);
    } else {
      stopHeartbeat();
      stopNarration();
      setMuted(true);
    }
  };

  useEffect(
    () => () => {
      stopHeartbeat();
      stopNarration();
    },
    [],
  );

  // Focus management: capture previous focus on open, focus Skip button,
  // restore focus on close. Also close on Escape.
  useEffect(() => {
    if (!visible) return;
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const target = prefersReducedMotion ? reducedCloseBtnRef.current : skipBtnRef.current;
    // Defer to next frame so the element is mounted and focusable
    const raf = requestAnimationFrame(() => target?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish("skip", undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus();
        } catch {
          /* noop */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, prefersReducedMotion]);

  const disableForever = () => {
    try {
      localStorage.setItem(DISABLE_KEY, "1");
    } catch {
      /* noop */
    }
    finish("disabled_forever");
  };

  // Timeline windows (ms)
  const T = useMemo<Record<SceneKey, number[]>>(
    () => ({
      pulse: [0, 4000],
      brand: [4000, 8000],
      services: [8000, 16000],
      stats: [16000, 23000],
      booking: [23000, 27000],
      final: [27000, 30000],
    }),
    [],
  );

  const inWindow = (w: number[]) => ms >= w[0] && ms < w[1];

  // ------------------------------------------------------------------
  // Prefetch upcoming scene media.
  //
  // Primary mechanism: IntersectionObserver on every mounted scene root
  // (`[data-scene]`). When a scene enters the viewport, we look up the
  // NEXT scene in `settings.scene_order` and warm its media in idle time.
  // Fallback: per-scene setTimeout that fires `prefetch_lead_ms` before
  // the scene starts, so coverage still works if IO doesn't fire (rare).
  // Both paths call `prefetchMedia`, which dedupes and honors Save-Data.
  // ------------------------------------------------------------------
  const prefetchEnabled = settings.prefetch_enabled;
  const LEAD_MS = Math.max(0, Math.min(10000, settings.prefetch_lead_ms ?? 1500));
  const scenesContainerRef = useRef<HTMLDivElement | null>(null);
  const prefetchedScenes = useRef<Set<SceneKey>>(new Set());

  const sceneMediaFor = (key: SceneKey): Array<{ url: string; kind: "image" | "video" }> => {
    if (key === "services") {
      const out: Array<{ url: string; kind: "image" | "video" }> = [];
      for (const s of services) {
        if (s.video) out.push({ url: s.video, kind: "video" });
        else if (s.image) out.push({ url: s.image, kind: "image" });
      }
      return out;
    }
    if (key === "stats") {
      return stats
        .filter((s) => s.image)
        .map((s) => ({ url: s.image as string, kind: "image" as const }));
    }
    return [];
  };

  const runPrefetch = (key: SceneKey) => {
    if (prefetchedScenes.current.has(key)) return;
    prefetchedScenes.current.add(key);
    const urls = sceneMediaFor(key);
    if (urls.length) prefetchMedia(urls);
  };

  // IntersectionObserver + MutationObserver: prefetch the NEXT scene when
  // the current scene enters the viewport.
  useEffect(() => {
    if (!visible || prefersReducedMotion || !prefetchEnabled) return;
    const container = scenesContainerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") return;
    const order = settings.scene_order;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const key = (e.target as HTMLElement).dataset.scene as SceneKey | undefined;
          if (!key) continue;

          // Report how this scene's own media was prefetched vs mount time.
          const mountAt = performance.now();
          const urls = sceneMediaFor(key);
          if (urls.length) {
            let completed = 0;
            let inFlight = 0;
            let notStarted = 0;
            let maxPrefetchMs = 0;
            for (const u of urls) {
              const st = getPrefetchStatus(u.url);
              if (!st) {
                notStarted += 1;
                continue;
              }
              if (prefetchCompletedBefore(u.url, mountAt)) {
                completed += 1;
                if (st.completedAt)
                  maxPrefetchMs = Math.max(maxPrefetchMs, st.completedAt - st.startedAt);
              } else {
                inFlight += 1;
              }
            }
            trackEvent("intro_scene_prefetch_report", {
              scene: key,
              total: urls.length,
              completed,
              in_flight: inFlight,
              not_started: notStarted,
              all_ready_before_mount: completed === urls.length,
              max_prefetch_ms: Math.round(maxPrefetchMs),
            });
          }

          const idx = order.indexOf(key);
          const next = order[idx + 1];
          if (next) runPrefetch(next);
          io.unobserve(e.target);
        }
      },
      { root: null, threshold: 0.1 },
    );
    const observeAll = () => {
      container.querySelectorAll<HTMLElement>("[data-scene]").forEach((el) => io.observe(el));
    };
    observeAll();
    const mo = new MutationObserver(() => observeAll());
    mo.observe(container, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, prefersReducedMotion, prefetchEnabled, settings.scene_order, services, stats]);

  // Time-based safety net: prefetch each scene LEAD_MS before its start.
  const sceneWindows: Record<SceneKey, number[]> = T;
  useEffect(() => {
    if (!visible || prefersReducedMotion || !prefetchEnabled) return;
    for (const key of settings.scene_order) {
      const win = sceneWindows[key];
      if (!win) continue;
      if (ms >= win[0] - LEAD_MS && ms < win[1]) runPrefetch(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visible,
    prefersReducedMotion,
    prefetchEnabled,
    LEAD_MS,
    ms,
    settings.scene_order,
    services,
    stats,
  ]);

  if (!visible) return null;

  // Reduced motion: 3-second logo reveal
  if (prefersReducedMotion) {
    return (
      <div
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-reduced-title"
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 px-6"
        style={{ background: CHARCOAL }}
      >
        {logoFailed ? (
          <LogoTextFallback />
        ) : (
          <img
            src={bmcLogo}
            alt="مجمع باعشن الطبي"
            onError={() => setLogoFailed(true)}
            className="w-44 h-44 object-contain"
            width={176}
            height={176}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        )}
        <p
          id="intro-reduced-title"
          className="text-white/85 text-lg"
          style={{ fontFamily: "Cairo, sans-serif" }}
        >
          مجمع باعشن الطبي — صحتك أولويتنا
        </p>
        <button
          ref={reducedCloseBtnRef}
          onClick={() => finish("reduced_motion_close")}
          className="mt-2 rounded-full bg-white/10 hover:bg-white/20 text-white/90 px-6 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          الدخول للموقع
        </button>
        <span className="sr-only" aria-live="polite">
          {announcedScene}
        </span>
      </div>
    );
  }

  const progress = Math.min(1, ms / TOTAL_MS);

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-dialog-title"
      aria-describedby="intro-scene-live"
      className={`fixed inset-0 z-[9999] overflow-hidden transition-opacity duration-500 ${fading ? "opacity-0" : "opacity-100"}`}
      style={{
        background: `radial-gradient(ellipse at 50% 40%, ${CHARCOAL_SOFT} 0%, ${CHARCOAL} 70%)`,
        fontFamily: "Cairo, sans-serif",
      }}
    >
      <h2 id="intro-dialog-title" className="sr-only">
        مقدمة مجمع باعشن الطبي
      </h2>
      {/* Live regions: scene changes and stat counters */}
      <div id="intro-scene-live" className="sr-only" aria-live="polite" aria-atomic="true">
        {announcedScene}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {statsAnnouncement}
      </div>
      {/* Ambient blue glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 55%, rgba(30,58,95,0.35), transparent 60%)`,
        }}
      />
      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage: `linear-gradient(${SILVER}22 1px, transparent 1px), linear-gradient(90deg, ${SILVER}22 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <audio
        ref={narrationRef}
        src={introNarrationUrl}
        preload="auto"
        playsInline
        aria-hidden="true"
      />
      {/* Top controls: skip always visible from second 1 */}
      <div className="absolute top-5 md:top-8 inset-x-5 md:inset-x-10 flex justify-between items-center z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            disabled={audioFailed}
            className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] backdrop-blur-md px-4 py-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={audioFailed ? "الصوت غير متاح" : muted ? "تشغيل الصوت" : "كتم الصوت"}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${audioFailed ? "bg-white/20" : audioReady ? "bg-emerald-400" : "bg-white/40"}`}
            />
            <span className="text-[10px] tracking-[0.3em] uppercase text-white/80">
              {audioFailed ? "بدون صوت" : muted ? "الصوت" : "كتم"}
            </span>
          </button>
          <button
            onClick={disableForever}
            className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] backdrop-blur-md px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-white/60"
            aria-label="عدم عرض المقدمة مرة أخرى"
          >
            عدم العرض مجددًا
          </button>
        </div>

        <button
          ref={skipBtnRef}
          onClick={() => finish("skip")}
          className="flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.08] hover:bg-white/[0.15] backdrop-blur-md px-5 py-2.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
          aria-label="تخطي المقدمة والانتقال للصفحة الرئيسية (اضغط Escape)"
        >
          <span className="text-xs tracking-[0.3em] uppercase text-white/90">تخطي المقدمة</span>
          <svg
            aria-hidden="true"
            className="w-3.5 h-3.5 text-white/80 rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ============ SCENES ============ */}
      <div ref={scenesContainerRef} className="relative z-10 h-full w-full">
        <AnimatePresence>
          {inWindow(T.pulse) && <ScenePulse key="pulse" />}
          {inWindow(T.brand) && (
            <SceneBrand key="brand" logoFailed={logoFailed} onError={() => setLogoFailed(true)} />
          )}
          {inWindow(T.services) && <SceneServices key="services" services={services} />}
          {inWindow(T.stats) && <SceneStats key="stats" stats={stats} />}
          {inWindow(T.booking) && <SceneBooking key="booking" />}
          {inWindow(T.final) && (
            <SceneFinal
              key="final"
              logoFailed={logoFailed}
              onError={() => setLogoFailed(true)}
              onBook={() => finish("cta_book", "/book")}
              onServices={() => finish("cta_services", "/services")}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Caption bar (Arabic narration subtitles) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 md:bottom-16 z-20 flex justify-center px-4">
        <AnimatePresence mode="wait">
          {caption && !muted ? (
            <motion.div
              key={caption}
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="max-w-[92%] md:max-w-2xl rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 px-5 py-2.5 text-center text-white text-base md:text-xl font-medium shadow-[0_10px_40px_rgba(0,0,0,0.55)]"
              style={{ fontFamily: "Cairo, sans-serif" }}
            >
              {caption}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-64 h-[2px] bg-white/10 overflow-hidden rounded-full">
        <div
          className="h-full"
          style={{
            width: `${progress * 100}%`,
            background: `linear-gradient(90deg, ${GOLD}, ${SILVER})`,
            transition: "width 100ms linear",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const fadeSwap = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } },
  exit: { opacity: 0, scale: 1.02, transition: { duration: 0.5, ease: EASE } },
} as const;

function ScenePulse() {
  return (
    <motion.div
      data-scene="pulse"
      className="absolute inset-0 flex flex-col items-center justify-center gap-8"
      {...fadeSwap}
    >
      <svg viewBox="0 0 600 200" className="w-[90%] max-w-3xl h-40">
        <defs>
          <filter id="pulseGlow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <motion.path
          d="M0 100 L120 100 L150 100 L170 60 L190 140 L210 40 L230 160 L250 100 L600 100"
          fill="none"
          stroke={CRESCENT_RED}
          strokeWidth={3}
          strokeLinecap="round"
          filter="url(#pulseGlow)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.2, ease: "easeInOut" }}
        />
        {/* crescent morph in from right */}
        <motion.path
          d="M480 100 A55 55 0 1 0 480 100.1 A42 42 0 1 1 480 100 Z"
          fill={CRESCENT_RED}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 2.0 }}
          style={{ transformOrigin: "480px 100px" }}
        />
      </svg>
      <motion.div
        className="text-center space-y-1"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.7 }}
      >
        <p className="text-white text-2xl md:text-4xl font-semibold">من قلب صبيا… تبدأ رعايتنا</p>
        <p className="text-white/60 text-sm md:text-base tracking-wide">
          From the Heart of Sabya, Our Care Begins
        </p>
      </motion.div>
    </motion.div>
  );
}

function SceneBrand({ logoFailed, onError }: { logoFailed: boolean; onError: () => void }) {
  return (
    <motion.div
      data-scene="brand"
      className="absolute inset-0 flex flex-col items-center justify-center gap-6"
      {...fadeSwap}
    >
      <div className="relative">
        <div
          className="absolute -inset-10 rounded-full"
          style={{ boxShadow: `0 0 90px 10px ${BAESHEN_BLUE}66` }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -inset-6 rounded-full pointer-events-none"
          style={{
            border: `1px solid ${GOLD}66`,
            boxShadow: `inset 0 0 30px ${GOLD}22, 0 0 40px ${GOLD}33`,
          }}
          initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: 360 }}
          transition={{
            opacity: { duration: 1.2 },
            scale: { duration: 1.2 },
            rotate: { duration: 40, repeat: Infinity, ease: "linear" },
          }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -inset-16 rounded-full pointer-events-none"
          style={{ border: `1px dashed ${GOLD}33` }}
          animate={{ rotate: -360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        />
        {logoFailed ? (
          <LogoTextFallback size="w-48 h-48 md:w-56 md:h-56" />
        ) : (
          <motion.img
            src={bmcLogo}
            alt="مجمع باعشن الطبي"
            onError={onError}
            width={224}
            height={224}
            loading="lazy"
            decoding="async"
            className="relative w-48 h-48 md:w-56 md:h-56 object-contain drop-shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: EASE }}
          />
        )}
        {/* Silver sweep */}
        <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
          <motion.div
            className="absolute top-0 -left-1/2 w-1/2 h-full"
            style={{
              background:
                "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)",
              filter: "blur(6px)",
            }}
            initial={{ x: "-100%" }}
            animate={{ x: "350%" }}
            transition={{ duration: 1.6, delay: 0.9, ease: "easeInOut" }}
          />
        </div>
      </div>
      <motion.div
        className="text-center space-y-1"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.6 }}
      >
        <p className="text-white text-2xl md:text-3xl font-bold">مجمع باعشن الطبي</p>
        <p className="text-white/80 text-sm md:text-base">خبرة طبية متكاملة لرعاية تستحق الثقة</p>
        <p className="text-white/50 text-xs md:text-sm mt-1">
          Baeshen Medical Complex — Integrated Medical Expertise. Care You Can Trust.
        </p>
      </motion.div>
    </motion.div>
  );
}

function SceneServices({ services }: { services: IntroService[] }) {
  // Show services in waves of 3
  const waves: IntroService[][] = [];
  for (let i = 0; i < services.length; i += 3) waves.push(services.slice(i, i + 3));
  return (
    <motion.div
      data-scene="services"
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6"
      {...fadeSwap}
    >
      <p className="text-white/90 text-lg md:text-xl tracking-wide">خدماتنا الطبية</p>
      <div className="flex flex-col gap-6 w-full max-w-4xl">
        {waves.map((wave, wi) => (
          <motion.div
            key={wi}
            className="grid grid-cols-3 gap-4 md:gap-6"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: [0, 1, 1, 0], y: [14, 0, 0, -8] }}
            transition={{ duration: 2.0, delay: wi * 1.9, times: [0, 0.2, 0.85, 1] }}
            style={{ position: wi === 0 ? "relative" : "absolute", left: 0, right: 0 }}
          >
            {wave.map((s) => (
              <div
                key={s.id}
                className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm px-3 py-5 md:px-6 md:py-6"
              >
                {s.video ? (
                  <LazyVideo
                    src={s.video}
                    className="w-20 h-14 md:w-24 md:h-16 object-cover rounded-lg"
                    width={96}
                    height={64}
                  />
                ) : s.image ? (
                  <LazyImage
                    src={s.image}
                    alt={s.titleAr}
                    className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-lg"
                    width={80}
                    height={80}
                  />
                ) : (
                  <s.Icon
                    className="w-8 h-8 md:w-10 md:h-10"
                    style={{ color: BAESHEN_BLUE_SOFT }}
                  />
                )}
                <span className="text-white text-sm md:text-base font-medium text-center">
                  {s.titleAr}
                </span>
                <span className="text-white/40 text-[10px] md:text-xs tracking-wide">
                  {s.titleEn}
                </span>
              </div>
            ))}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function SceneStats({ stats }: { stats: Stat[] }) {
  const visible = stats.filter((s) => s.value > 0).slice(0, 4);
  return (
    <motion.div
      data-scene="stats"
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6"
      {...fadeSwap}
    >
      <motion.p
        className="text-white/70 text-xs md:text-sm tracking-[0.35em] uppercase"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        أرقام تنمو بثقتكم · Numbers Made Possible by Your Trust
      </motion.p>
      <TooltipProvider delayDuration={150}>
        <div
          className={`grid gap-4 md:gap-6 w-full max-w-5xl ${visible.length <= 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}
        >
          {visible.map((s, i) => (
            <motion.div
              key={s.id}
              className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 md:p-6 flex flex-col items-center text-center gap-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.15, duration: 0.6 }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`مصدر الإحصائية: ${s.source}. آخر تحديث: ${formatUpdatedAt(s.updatedAt)}`}
                    className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] px-2 py-0.5 text-[10px] text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                  >
                    <Info className="w-3 h-3" aria-hidden="true" />
                    <span>{s.live ? "مباشر" : "معتمد"}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-right">
                  <p className="text-xs font-semibold mb-1">
                    {s.live ? "بيانات مباشرة" : "بيانات معتمدة"}
                  </p>
                  <p className="text-xs opacity-90">المصدر: {s.source}</p>
                  <p className="text-[11px] opacity-70 mt-1">
                    آخر تحديث: {formatUpdatedAt(s.updatedAt)}
                  </p>
                </TooltipContent>
              </Tooltip>
              {s.image ? (
                <LazyImage
                  src={s.image}
                  alt={s.labelAr}
                  className="w-12 h-12 object-cover rounded-full"
                  width={48}
                  height={48}
                />
              ) : (
                <s.Icon className="w-6 h-6" style={{ color: GOLD }} />
              )}
              <div className="text-white text-2xl md:text-4xl font-bold">
                <Counter value={s.value} prefix={s.prefix} suffix={s.suffix} />
              </div>
              <div className="text-white/70 text-xs md:text-sm">{s.labelAr}</div>
              <div className="text-white/40 text-[10px] mt-1">
                {s.live
                  ? "مباشر من قاعدة بيانات المجمع"
                  : `محدَّث: ${formatUpdatedAt(s.updatedAt)}`}
              </div>
            </motion.div>
          ))}
        </div>
      </TooltipProvider>
      {visible.length === 0 && (
        <p className="text-white/50 text-sm">رعاية طبية متكاملة على مدار الأسبوع</p>
      )}
    </motion.div>
  );
}

function SceneBooking() {
  const steps = [
    { Icon: Building2, ar: "اختر الفرع" },
    { Icon: Stethoscope, ar: "اختر الطبيب" },
    { Icon: CalendarCheck, ar: "اختر الموعد" },
    { Icon: ShieldCheck, ar: "تأكيد الحجز" },
    { Icon: ClipboardList, ar: "استلام التفاصيل" },
  ];
  return (
    <motion.div
      data-scene="booking"
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6"
      {...fadeSwap}
    >
      <motion.p
        className="text-white text-2xl md:text-3xl font-semibold text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        موعدك الطبي… بخطوات بسيطة
      </motion.p>
      <p className="text-white/60 text-sm md:text-base">Your Appointment in a Few Simple Steps</p>
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between gap-2 md:gap-4">
          {steps.map((st, i) => (
            <motion.div
              key={i}
              className="flex-1 flex flex-col items-center gap-2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.35, duration: 0.5 }}
            >
              <div
                className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center border"
                style={{ borderColor: `${GOLD}66`, background: `${BAESHEN_BLUE}66` }}
              >
                <st.Icon className="w-6 h-6 text-white" />
              </div>
              <span className="text-white/85 text-[11px] md:text-sm text-center">{st.ar}</span>
              <span className="text-white/40 text-[10px]">{i + 1}</span>
            </motion.div>
          ))}
        </div>
        <motion.div
          className="mt-6 h-[2px] bg-white/10 overflow-hidden rounded"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <motion.div
            className="h-full"
            style={{ background: `linear-gradient(90deg, ${BAESHEN_BLUE}, ${CRESCENT_RED})` }}
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 3.4, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

function SceneFinal({
  logoFailed,
  onError,
  onBook,
  onServices,
}: {
  logoFailed: boolean;
  onError: () => void;
  onBook: () => void;
  onServices: () => void;
}) {
  return (
    <motion.div
      data-scene="final"
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6"
      {...fadeSwap}
    >
      <div className="relative">
        <motion.div
          className="absolute -inset-10 rounded-full"
          style={{ background: `radial-gradient(circle, ${CRESCENT_RED}44, transparent 60%)` }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -inset-6 rounded-full pointer-events-none"
          style={{
            border: `1px solid ${GOLD}66`,
            boxShadow: `inset 0 0 30px ${GOLD}22, 0 0 40px ${GOLD}33`,
          }}
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: 1, rotate: 360 }}
          transition={{
            opacity: { duration: 1.2 },
            rotate: { duration: 30, repeat: Infinity, ease: "linear" },
          }}
        />
        {logoFailed ? (
          <LogoTextFallback size="w-44 h-44 md:w-56 md:h-56" />
        ) : (
          <img
            src={bmcLogo}
            alt="مجمع باعشن الطبي"
            onError={onError}
            width={224}
            height={224}
            loading="lazy"
            decoding="async"
            className="relative w-44 h-44 md:w-56 md:h-56 object-contain drop-shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
          />
        )}
      </div>
      <div className="text-center space-y-1">
        <p className="text-white text-2xl md:text-3xl font-bold">مجمع باعشن الطبي</p>
        <p className="text-white/75 text-sm md:text-base">صحتك… أولويتنا</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
        <button
          onClick={onBook}
          className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm md:text-base font-semibold text-white shadow-lg transition hover:scale-[1.03]"
          style={{
            background: `linear-gradient(135deg, ${BAESHEN_BLUE}, ${CRESCENT_RED})`,
            boxShadow: `0 10px 30px ${CRESCENT_RED}55`,
          }}
        >
          احجز موعدك الآن
        </button>
        <button
          onClick={onServices}
          className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm md:text-base font-medium text-white/90 border border-white/25 hover:bg-white/10 transition"
        >
          اكتشف خدماتنا
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Text fallback for when the logo image fails
// ---------------------------------------------------------------------------
function LogoTextFallback({ size = "w-40 h-40" }: { size?: string }) {
  return (
    <div
      role="img"
      aria-label="Baeshen Medical Complex"
      className={`${size} flex flex-col items-center justify-center rounded-full text-center`}
      style={{
        background: `radial-gradient(circle at 50% 45%, ${BAESHEN_BLUE} 0%, ${CHARCOAL_SOFT} 75%)`,
        border: `1px solid ${GOLD}55`,
        boxShadow: `0 0 40px ${BAESHEN_BLUE}66`,
      }}
    >
      <Activity className="w-8 h-8 mb-1" style={{ color: CRESCENT_RED }} />
      <span className="text-white text-xl md:text-2xl font-bold">B.M.C</span>
      <span className="mt-0.5 text-[10px] tracking-[0.3em] uppercase" style={{ color: GOLD }}>
        Baeshen Medical
      </span>
    </div>
  );
}
