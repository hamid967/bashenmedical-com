import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PortalBreadcrumb = { label: string; to?: string };

/**
 * PortalPageHeader — unified page header for /portal/* routes.
 * Renders a title, optional description, breadcrumb trail, and actions.
 * All styling is driven by design tokens in styles.css (`.portal-root`).
 */
export function PortalPageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  isAr = true,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: PortalBreadcrumb[];
  actions?: ReactNode;
  isAr?: boolean;
  eyebrow?: ReactNode;
}) {
  const Chevron = isAr ? ChevronLeft : ChevronRight;
  return (
    <header className="mb-6 md:mb-8">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label={isAr ? "مسار التنقل" : "Breadcrumb"}
          className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-[color:var(--portal-ink-3)]"
        >
          {breadcrumbs.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              {i > 0 && <Chevron className="h-3.5 w-3.5 opacity-60" aria-hidden />}
              {b.to ? (
                <Link
                  to={b.to}
                  className="hover:text-[color:var(--portal-primary)] transition-colors"
                >
                  {b.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-[color:var(--portal-ink-2)] font-medium">
                  {b.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--portal-secondary)]">
              {eyebrow}
            </div>
          )}
          <h1 className="text-2xl md:text-3xl font-bold text-[color:var(--portal-ink)] leading-tight tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-sm md:text-[15px] text-[color:var(--portal-ink-2)] max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="shrink-0 flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
