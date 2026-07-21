import { type ReactNode, forwardRef } from "react";

type Variant = "default" | "elevated" | "sunken" | "outline";

/**
 * PortalCard — the canonical surface primitive for the patient portal.
 * Prefer this over ad-hoc `bg-white rounded-2xl border` combinations.
 */
export const PortalCard = forwardRef<HTMLDivElement, {
  children: ReactNode;
  variant?: Variant;
  interactive?: boolean;
  className?: string;
  as?: "div" | "section" | "article";
} & React.HTMLAttributes<HTMLDivElement>>(function PortalCard(
  { children, variant = "default", interactive = false, className = "", as = "div", ...rest },
  ref,
) {
  const base =
    variant === "elevated"
      ? "portal-card-elevated"
      : variant === "sunken"
        ? "portal-card-sunken"
        : variant === "outline"
          ? "border border-[color:var(--ds-border)] rounded-[var(--ds-radius-lg)] bg-transparent"
          : "portal-card";
  const hover = interactive ? "portal-card-hover cursor-pointer" : "";
  const Tag = as as "div";
  return (
    <Tag
      ref={ref}
      className={`${base} ${hover} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export function PortalCardHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-5 pt-5 pb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 ${className}`}>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-[color:var(--portal-ink)] truncate">{title}</div>
        {description && (
          <div className="text-[12.5px] text-[color:var(--portal-ink-3)] mt-0.5 leading-relaxed">{description}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PortalCardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}

export function PortalCardFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-5 py-3 border-t border-[color:var(--portal-border)] flex items-center justify-end gap-2 ${className}`}>
      {children}
    </div>
  );
}
