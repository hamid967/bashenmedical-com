/**
 * Returns a React Query `refetchInterval` function that polls at `activeMs`
 * while the tab is visible, and slows to `hiddenMs` (or pauses entirely
 * when `hiddenMs` is `false`) while `document.visibilityState === "hidden"`.
 *
 * SSR-safe: returns `activeMs` when `document` is undefined.
 */
export function visibilityAwareInterval(activeMs: number, hiddenMs: number | false = false) {
  return () => {
    if (typeof document === "undefined") return activeMs;
    return document.visibilityState === "visible" ? activeMs : hiddenMs;
  };
}
