/**
 * JazanSectionLabel — small heritage eyebrow label used above section titles.
 * Responsive: shrinks gracefully on small screens; the trailing dashed line
 * hides on narrow viewports to avoid overflow. RTL-safe via logical spacing.
 */
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
};

export function JazanSectionLabel({ children, className, align = "start" }: Props) {
  const alignCls =
    align === "center" ? "justify-center" : align === "end" ? "justify-end" : "justify-start";
  return (
    <div
      className={cn("flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-full", alignCls, className)}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[var(--jazan-terracotta,#B85C3C)] shrink-0"
        aria-hidden="true"
      >
        <path
          d="M8 1 L15 8 L8 15 L1 8 Z"
          fill="none"
          stroke="var(--jazan-teal,#075E63)"
          strokeWidth="1"
        />
        <path d="M8 4 L12 8 L8 12 L4 8 Z" fill="var(--jazan-gold,#C7A46B)" opacity="0.7" />
        <circle cx="8" cy="8" r="1.1" fill="currentColor" />
      </svg>
      <span className="min-w-0 truncate text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--jazan-teal,#075E63)]">
        {children}
      </span>
      <svg
        viewBox="0 0 24 4"
        className="hidden sm:block h-1 w-6 shrink-0 text-[var(--jazan-gold,#C7A46B)]"
        aria-hidden="true"
      >
        <line
          x1="0"
          y1="2"
          x2="24"
          y2="2"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      </svg>
    </div>
  );
}

export default JazanSectionLabel;
