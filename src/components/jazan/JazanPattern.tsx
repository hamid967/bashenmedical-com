/**
 * JazanPattern — original decorative SVG pattern inspired by Jazan heritage
 * (geometric diamonds, palm fronds, mountain terraces, woven textiles).
 *
 * NOT the official Jazan region emblem — an original motif built for
 * Baeshen Medical Center. Safe for decorative use anywhere.
 *
 * Variants:
 *   - subtle   (default) — very low opacity, safe under text
 *   - standard — moderate opacity for banners / dividers
 *   - featured — vivid, use only for hero / intro accents
 */
import { cn } from "@/lib/utils";

export type JazanVariant = "subtle" | "standard" | "featured";

type Props = {
  variant?: JazanVariant;
  className?: string;
  /** Repeat orientation of the strip. */
  orientation?: "horizontal" | "vertical";
  /** aria-hidden always true — decorative only. */
};

const VARIANT_OPACITY: Record<JazanVariant, number> = {
  subtle: 0.18,
  standard: 0.55,
  featured: 1,
};

export function JazanPattern({ variant = "subtle", className, orientation = "horizontal" }: Props) {
  const opacity = VARIANT_OPACITY[variant];
  const viewBox = orientation === "horizontal" ? "0 0 96 24" : "0 0 24 96";
  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
      className={cn("pointer-events-none select-none", className)}
      style={{ opacity }}
    >
      <defs>
        <pattern id="jazan-diamonds-motif" width="24" height="24" patternUnits="userSpaceOnUse">
          {/* outer diamond — deep teal */}
          <path
            d="M12 2 L22 12 L12 22 L2 12 Z"
            fill="none"
            stroke="var(--jazan-teal, #075E63)"
            strokeWidth="1"
          />
          {/* inner diamond — muted gold */}
          <path d="M12 6 L18 12 L12 18 L6 12 Z" fill="var(--jazan-gold, #C7A46B)" opacity="0.6" />
          {/* core dot — terracotta */}
          <circle cx="12" cy="12" r="1.6" fill="var(--jazan-terracotta, #B85C3C)" />
          {/* palm-frond hint at corners */}
          <path
            d="M0 12 L4 10 M0 12 L4 14"
            stroke="var(--jazan-teal, #075E63)"
            strokeWidth="0.6"
            opacity="0.7"
          />
          <path
            d="M24 12 L20 10 M24 12 L20 14"
            stroke="var(--jazan-teal, #075E63)"
            strokeWidth="0.6"
            opacity="0.7"
          />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#jazan-diamonds-motif)" />
    </svg>
  );
}

export default JazanPattern;
