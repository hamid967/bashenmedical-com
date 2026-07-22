import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DemoBadgeProps {
  show?: boolean;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Visual marker for records seeded as demo data (is_demo=true / is_mock=true).
 * Renders nothing when show is false so callers can pass a row's flag directly.
 */
export function DemoBadge({ show = true, className, size = "sm" }: DemoBadgeProps) {
  if (!show) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-amber-400/60 bg-amber-100/70 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 font-semibold tracking-wider",
        size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5",
        className,
      )}
      title="بيانات تجريبية — Demo data"
    >
      DEMO
    </Badge>
  );
}

export default DemoBadge;
