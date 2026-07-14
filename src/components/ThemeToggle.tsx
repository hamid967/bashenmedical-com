import { useEffect } from "react";

/**
 * Dark mode was removed as part of the full light-theme redesign.
 * This component now only ensures any legacy `.dark` class is cleared
 * from the HTML element and renders nothing. Kept as an export so
 * existing imports remain valid without touching every call site.
 */
export function ThemeToggle(_props: { className?: string }) {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
      try {
        window.localStorage.removeItem("baeshen-theme");
      } catch {
        /* ignore */
      }
    }
  }, []);
  return null;
}
