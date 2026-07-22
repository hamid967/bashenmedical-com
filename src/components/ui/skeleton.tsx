import { cn } from "@/lib/utils";

/**
 * Unified skeleton primitive — uses `.skeleton-neon` so every loading
 * placeholder shares one shimmer/pulse system, with `prefers-reduced-motion`
 * automatically honored via the utility's media query in styles.css.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton-neon", className)} {...props} />;
}

export { Skeleton };
