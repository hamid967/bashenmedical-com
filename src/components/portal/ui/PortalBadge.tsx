import { type ReactNode } from "react";

export type PortalBadgeTone = "default" | "success" | "warning" | "error" | "muted";

const toneClass: Record<PortalBadgeTone, string> = {
  default: "portal-badge",
  success: "portal-badge portal-badge-success",
  warning: "portal-badge portal-badge-warning",
  error: "portal-badge portal-badge-error",
  muted: "portal-badge portal-badge-muted",
};

export function PortalBadge({
  children,
  tone = "default",
  icon,
  className = "",
}: {
  children: ReactNode;
  tone?: PortalBadgeTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span className={`${toneClass[tone]} ${className}`.trim()}>
      {icon && (
        <span aria-hidden className="inline-flex">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
