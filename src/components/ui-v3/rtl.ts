/**
 * ui-v3 RTL helpers — automatic direction handling for every wrapper.
 *
 * Consumers never call these directly; Button/Field/Dialog/SectionCard read
 * from `useDirection()` internally so pages don't need per-component `dir`
 * props. Direction is inherited from the nearest ancestor `[dir]` attribute
 * (usually `<html dir="ar">`), which matches the platform's i18n behavior.
 */
import * as React from "react";

export type Direction = "ltr" | "rtl";

/**
 * Resolve the effective writing direction for a mounted element.
 * SSR-safe: returns `"ltr"` on the server, then re-resolves on hydration.
 */
export function useDirection(ref?: React.RefObject<Element | null>): Direction {
  const [dir, setDir] = React.useState<Direction>("ltr");

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const read = (): Direction => {
      const el = ref?.current ?? document.documentElement;
      // `getComputedStyle` returns the resolved direction even when `dir` isn't
      // set on the closest ancestor (falls back to `<html>`).
      const cs = window.getComputedStyle(el as Element).direction;
      return cs === "rtl" ? "rtl" : "ltr";
    };

    setDir(read());

    // Re-read when `<html dir>` flips (language switcher).
    const target = document.documentElement;
    const obs = new MutationObserver(() => setDir(read()));
    obs.observe(target, { attributes: true, attributeFilter: ["dir", "lang"] });
    return () => obs.disconnect();
  }, [ref]);

  return dir;
}

/**
 * `dir="auto"` on free-text inputs lets the browser pick alignment based on
 * the first strongly-typed character. That's what we want for names, emails,
 * and search boxes inside an Arabic UI where content may be English.
 *
 * Skipped for inputs where the value is numeric/opaque (`number`, `tel`,
 * `email`, `url`, `password`) — those should follow UI direction.
 */
export function shouldAutoDir(type?: string): boolean {
  if (!type) return true; // default <input> is type="text"
  return type === "text" || type === "search";
}
