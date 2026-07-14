/**
 * JazanIconFrame — decorative frame that wraps an icon with a heritage
 * diamond outline and warm background. Purely visual.
 * Responsive sizes scale down on small screens; always `shrink-0`.
 */
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-9 w-9 sm:h-10 sm:w-10",
  md: "h-10 w-10 sm:h-12 sm:w-12",
  lg: "h-12 w-12 sm:h-16 sm:w-16",
};

export function JazanIconFrame({ children, className, size = "md" }: Props) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-grid place-items-center rounded-2xl shrink-0",
        "bg-[var(--jazan-ivory,#FCF9F2)] text-[var(--jazan-teal,#075E63)]",
        "ring-1 ring-[var(--jazan-gold,#C7A46B)]/50",
        "shadow-[0_2px_10px_-6px_rgba(7,94,99,0.25)]",
        SIZE[size],
        className,
      )}
    >
      {/* corner diamonds — mirrored automatically in RTL via symmetry */}
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 h-full w-full opacity-70"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <path d="M4 4 L8 4 L4 8 Z" fill="var(--jazan-gold,#C7A46B)" opacity="0.7" />
        <path d="M36 4 L32 4 L36 8 Z" fill="var(--jazan-gold,#C7A46B)" opacity="0.7" />
        <path d="M4 36 L8 36 L4 32 Z" fill="var(--jazan-gold,#C7A46B)" opacity="0.7" />
        <path d="M36 36 L32 36 L36 32 Z" fill="var(--jazan-gold,#C7A46B)" opacity="0.7" />
      </svg>
      <span className="relative z-10 inline-flex items-center justify-center">
        {children}
      </span>
    </span>
  );
}

export default JazanIconFrame;
