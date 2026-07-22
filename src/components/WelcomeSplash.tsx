import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import bmcLogoAsset from "@/assets/bmc-logo.jpg.asset.json";

const bmcLogo = bmcLogoAsset.url;

const KEY = "baeshen_welcome_seen_v1";

/**
 * Short (~1.6s) welcome screen shown once per session after the intro,
 * before the home page becomes fully interactive.
 * Dismissible via Enter/Escape/Space or the skip button.
 */
export function WelcomeSplash() {
  const [visible, setVisible] = useState(false);
  const reduce = useReducedMotion();
  const skipBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
    setVisible(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {}
    setVisible(true);
    const t = setTimeout(dismiss, reduce ? 400 : 1700);
    return () => clearTimeout(t);
  }, [reduce, dismiss]);

  // Focus management + keyboard dismissal (Enter / Escape / Space).
  useEffect(() => {
    if (!visible) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    // Focus the skip button so keyboard users land on the dismissal control.
    const rafId = requestAnimationFrame(() => skipBtnRef.current?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        dismiss();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Restore focus to what the user had before the splash appeared.
      prevFocusRef.current?.focus?.();
    };
  }, [visible, dismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-splash-title"
          aria-describedby="welcome-splash-desc"
          className="fixed inset-0 z-[9998] flex items-center justify-center overflow-hidden bg-[#07101f]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,217,192,0.18),rgba(7,16,31,0.95)_65%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_70%,rgba(123,97,255,0.18),transparent_60%)]" />

          {/* Skip button — top corner, keyboard-focusable, min 44x44 target */}
          <button
            ref={skipBtnRef}
            type="button"
            onClick={dismiss}
            aria-label="تخطي شاشة الترحيب والانتقال إلى المحتوى"
            className="group absolute top-6 left-6 md:top-8 md:left-10 z-20 inline-flex min-h-11 items-center gap-3 rounded-full border border-white/15 bg-white/[0.05] px-5 py-2.5 text-xs tracking-[0.35em] uppercase text-[#e8edf3] backdrop-blur-md transition hover:bg-white/[0.12] hover:border-[#00D9C0]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D9C0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07101f]"
          >
            <span aria-hidden="true">تخطي</span>
            <svg
              aria-hidden="true"
              className="h-3 w-3 rotate-180 transition-transform group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <p id="welcome-splash-desc" className="sr-only">
            شاشة ترحيب قصيرة. اضغط زر تخطي أو مفتاح Escape أو Enter للانتقال إلى الصفحة الرئيسية.
          </p>

          <motion.div
            className="relative z-10 flex flex-col items-center text-center px-6"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative">
              <motion.div
                aria-hidden="true"
                className="absolute -inset-6 rounded-full border border-[#00D9C0]/30"
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.2, 0.6] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                aria-hidden="true"
                className="absolute -inset-12 rounded-full border border-[#7B61FF]/20"
                animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-b from-[#132749] to-[#07101f] p-1 shadow-[0_0_60px_rgba(0,217,192,0.25)]">
                <div className="w-full h-full rounded-full border border-[#c9a84c]/30 bg-[#07101f] flex items-center justify-center overflow-hidden">
                  <img
                    src={bmcLogo}
                    alt=""
                    aria-hidden="true"
                    className="w-[85%] h-[85%] object-contain"
                  />
                </div>
              </div>
            </div>

            <motion.p
              className="mt-8 text-[10px] tracking-[0.5em] uppercase text-[#00D9C0]/80 font-light"
              initial={{ opacity: 0, letterSpacing: "0.2em" }}
              animate={{ opacity: 1, letterSpacing: "0.5em" }}
              transition={{ delay: 0.15, duration: 0.7 }}
            >
              Welcome
            </motion.p>
            <motion.h2
              id="welcome-splash-title"
              className="mt-3 text-2xl md:text-3xl text-[#e8edf3] tracking-wide"
              style={{ fontFamily: '"DM Serif Display","Instrument Serif",serif' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.6 }}
            >
              أهلاً بكم في مجمع باعشن الطبي
            </motion.h2>

            <motion.div
              aria-hidden="true"
              className="mt-6 h-px w-40 overflow-hidden bg-white/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-transparent via-[#00D9C0] to-transparent"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
              />
            </motion.div>

            <p className="mt-6 text-[10px] tracking-[0.3em] uppercase text-[#e8edf3]/50">
              اضغط <kbd className="rounded border border-white/20 px-1.5 py-0.5 mx-1">Esc</kbd>{" "}
              للتخطي
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
