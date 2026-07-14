import { Globe } from "lucide-react";
import { useI18n, SUPPORTED_LANGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LABELS: Record<Lang, string> = {
  ar: "العربية",
  en: "English",
};

type Props = {
  variant?: "toggle" | "menu";
  className?: string;
};

export function LanguageSwitcher({ variant = "toggle", className }: Props) {
  const { lang, setLang } = useI18n();

  if (variant === "menu") {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        {SUPPORTED_LANGS.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition",
              lang === code
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {LABELS[code]}
          </button>
        ))}
      </div>
    );
  }

  const next: Lang = lang === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs font-medium hover:bg-muted",
        className,
      )}
    >
      <Globe className="h-3.5 w-3.5" aria-hidden="true" />
      {LABELS[next]}
    </button>
  );
}
