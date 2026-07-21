import { type ReactNode } from "react";

export function PortalSection({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-6 md:mb-8 ${className}`}>
      {(title || action) && (
        <div className="mb-3 md:mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base md:text-lg font-semibold text-[color:var(--portal-ink)] tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-[12.5px] md:text-[13px] text-[color:var(--portal-ink-3)] mt-0.5">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
