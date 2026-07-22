import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "admin-console-theme";
type Theme = "light" | "dark";

export function useAdminTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    try {
      const saved = (localStorage.getItem(KEY) as Theme | null) ?? "light";
      setTheme(saved);
    } catch {
      /* ignore */
    }
  }, []);
  function toggle() {
    setTheme((t) => {
      const next: Theme = t === "light" ? "dark" : "light";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }
  return { theme, toggle };
}

export function ThemeSwitcher({
  theme,
  onToggle,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-md hover:bg-black/5 transition"
      aria-label={theme === "light" ? "الوضع الداكن" : "الوضع الفاتح"}
      title={theme === "light" ? "الوضع الداكن" : "الوضع الفاتح"}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5" style={{ color: "var(--ac-ink-2)" }} />
      ) : (
        <Sun className="h-5 w-5" style={{ color: "var(--ac-ink-2)" }} />
      )}
    </button>
  );
}
