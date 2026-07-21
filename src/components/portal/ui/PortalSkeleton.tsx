export function PortalSkeleton({
  className = "",
  rounded = "rounded-xl",
}: {
  className?: string;
  rounded?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={`portal-shimmer bg-[color:var(--portal-surface-3)] ${rounded} ${className}`}
    />
  );
}

export function PortalCardSkeleton() {
  return (
    <div className="portal-card p-5 space-y-3">
      <PortalSkeleton className="h-3 w-24" rounded="rounded-full" />
      <PortalSkeleton className="h-8 w-40" />
      <PortalSkeleton className="h-3 w-full" rounded="rounded-full" />
      <PortalSkeleton className="h-3 w-2/3" rounded="rounded-full" />
    </div>
  );
}
