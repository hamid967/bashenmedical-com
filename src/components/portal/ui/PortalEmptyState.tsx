import { type ReactNode } from "react";
import { PortalCard } from "./PortalCard";

export function PortalEmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <PortalCard className={`p-8 md:p-10 text-center ${className}`}>
      {icon && (
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl grid place-items-center bg-[color:var(--portal-primary-50)] text-[color:var(--portal-primary)]">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-[color:var(--portal-ink)]">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-[color:var(--portal-ink-2)] max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </PortalCard>
  );
}
