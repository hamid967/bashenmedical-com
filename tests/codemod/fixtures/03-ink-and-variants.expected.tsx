import { clsx } from "clsx";
export const C = ({ active }: { active: boolean }) => (
  <button
    className={clsx(
      "bg-[color:var(--portal-surface-1)] text-[color:var(--portal-ink-2)] border-[color:var(--portal-surface-3)]",
      "hover:bg-[color:var(--portal-surface-2)] focus:text-[color:var(--portal-ink)]",
      active && "bg-[color:var(--portal-primary)] text-[color:var(--portal-on-primary)]",
    )}
  >
    ok
  </button>
);
