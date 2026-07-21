import { type ReactNode } from "react";

export type PortalDataListItem = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
};

/**
 * PortalDataList — mobile-first alternative to dense tables.
 * Use inside a PortalCard body. Two-column on desktop, stacked rows on mobile.
 */
export function PortalDataList({
  items,
  className = "",
}: {
  items: PortalDataListItem[];
  className?: string;
}) {
  return (
    <dl className={`divide-y divide-[color:var(--portal-border)] ${className}`}>
      {items.map((it) => (
        <div
          key={it.key}
          className="py-3 grid grid-cols-1 sm:grid-cols-[minmax(140px,1fr)_2fr] gap-1 sm:gap-6 first:pt-0 last:pb-0"
        >
          <dt className="text-[12.5px] font-medium text-[color:var(--portal-ink-3)] uppercase tracking-wide">
            {it.label}
          </dt>
          <dd className="min-w-0">
            <div className="text-sm font-medium text-[color:var(--portal-ink)] break-words">
              {it.value}
            </div>
            {it.hint && (
              <div className="text-[12px] text-[color:var(--portal-ink-3)] mt-0.5">{it.hint}</div>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
