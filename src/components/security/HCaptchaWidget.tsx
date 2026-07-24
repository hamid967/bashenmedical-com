/**
 * hCaptcha widget with explicit render + imperative reset.
 *
 * Why not `@hcaptcha/react-hcaptcha`?
 *  - Avoids an extra dependency and keeps the widget SSR-safe (script is
 *    loaded lazily on mount, never during import).
 *
 * Behaviour contract used by the forms:
 *  - `onToken(token)` fires when the user solves the challenge.
 *  - `onToken(null)` fires when the token expires or errors out.
 *  - Parent MUST call `ref.current?.reset()` after every submit attempt
 *    (success OR failure); hCaptcha tokens are single-use and reusing one
 *    is a common retry-bypass vector.
 *  - If `VITE_HCAPTCHA_SITE_KEY` is not configured we render nothing and
 *    export `HCAPTCHA_ENABLED = false` so callers can degrade gracefully
 *    in non-prod. Production endpoints still fail closed server-side.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

export const HCAPTCHA_ENABLED = Boolean(SITE_KEY);

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          size?: "normal" | "compact" | "invisible";
          theme?: "light" | "dark";
        },
      ) => string;
      reset: (id?: string) => void;
      getResponse: (id?: string) => string;
      execute: (id?: string) => void;
      remove?: (id: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function ensureScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.hcaptcha) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("hcaptcha_script_load_failed"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface HCaptchaHandle {
  reset: () => void;
  getToken: () => string | null;
}

interface Props {
  onToken?: (token: string | null) => void;
  className?: string;
  theme?: "light" | "dark";
}

export const HCaptchaWidget = forwardRef<HCaptchaHandle, Props>(function HCaptchaWidget(
  { onToken, className, theme = "light" },
  ref,
) {
  const container = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!SITE_KEY || !container.current) return;
    let cancelled = false;
    ensureScript()
      .then(() => {
        if (cancelled || !container.current || !window.hcaptcha) return;
        // Only render once per mount.
        if (widgetId.current) return;
        try {
          widgetId.current = window.hcaptcha.render(container.current, {
            sitekey: SITE_KEY,
            theme,
            callback: (token: string) => onToken?.(token),
            "expired-callback": () => onToken?.(null),
            "error-callback": () => onToken?.(null),
          });
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
    // Intentionally exclude onToken/theme to avoid re-rendering the widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    (): HCaptchaHandle => ({
      reset: () => {
        try {
          if (widgetId.current && window.hcaptcha) {
            window.hcaptcha.reset(widgetId.current);
          }
        } catch {
          /* ignore */
        }
      },
      getToken: () => {
        try {
          if (widgetId.current && window.hcaptcha) {
            return window.hcaptcha.getResponse(widgetId.current) || null;
          }
        } catch {
          /* ignore */
        }
        return null;
      },
    }),
    [],
  );

  if (!SITE_KEY) return null;
  if (failed) {
    return (
      <p className={`text-sm text-destructive ${className ?? ""}`}>
        تعذّر تحميل التحقق البشري. حدّث الصفحة وحاول مرة أخرى.
      </p>
    );
  }
  return <div ref={container} className={className ?? "my-3"} />;
});
