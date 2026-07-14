/**
 * JazanDivider — decorative section divider with a heritage ornament center.
 * Purely decorative (aria-hidden).
 */
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  variant?: "subtle" | "standard";
};

export function JazanDivider({ className, variant = "standard" }: Props) {
  const lineColor =
    variant === "subtle"
      ? "var(--jazan-teal, #075E63)"
      : "var(--jazan-teal, #075E63)";
  const lineOpacity = variant === "subtle" ? 0.18 : 0.35;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center gap-3 w-full my-6 text-[var(--jazan-teal,#075E63)]",
        className,
      )}
    >
      <span
        className="h-px flex-1"
        style={{
          background: `linear-gradient(90deg, transparent, ${lineColor} 40%, ${lineColor} 60%, transparent)`,
          opacity: lineOpacity,
        }}
      />
      <svg viewBox="0 0 40 16" className="h-4 w-10 shrink-0" aria-hidden="true">
        <path
          d="M2 8 L8 8"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.6"
        />
        <path
          d="M12 8 L20 2 L28 8 L20 14 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d="M16 8 L20 5 L24 8 L20 11 Z"
          fill="var(--jazan-gold, #C7A46B)"
          opacity="0.7"
        />
        <circle
          cx="20"
          cy="8"
          r="1.2"
          fill="var(--jazan-terracotta, #B85C3C)"
        />
        <path
          d="M32 8 L38 8"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
      <span
        className="h-px flex-1"
        style={{
          background: `linear-gradient(90deg, transparent, ${lineColor} 40%, ${lineColor} 60%, transparent)`,
          opacity: lineOpacity,
        }}
      />
    </div>
  );
}

export default JazanDivider;
