import { clsx } from "clsx";
import { cn } from "@/lib/utils";

export const A = ({ on, tone }: { on: boolean; tone: "ok" | "err" }) => (
  <div
    className={clsx([
      "bg-[color:var(--portal-surface-1)] text-[color:var(--portal-ink)]",
      ["border border-[color:var(--portal-surface-3)]", "hover:bg-[color:var(--portal-surface-1)]"],
      on ? "text-[color:var(--portal-success)]" : "text-[color:var(--portal-error)]",
      tone === "ok" ? ["bg-[color:var(--portal-success-50)]", "border-[color:var(--portal-success-50)]"] : ["bg-[color:var(--portal-error-50)]", "border-[color:var(--portal-error-50)]"],
    ])}
  >
    A
  </div>
);

export const B = ({ big, muted }: { big: boolean; muted: boolean }) => (
  <span
    className={cn(
      `bg-[color:var(--portal-surface-1)] ${big ? "text-slate-900" : "text-slate-700"} border-[color:var(--portal-surface-3)]`,
      `${muted ? "text-gray-500" : "text-black"} hover:bg-[color:var(--portal-surface-2)]`,
      big && `focus:text-[color:var(--portal-ink)] bg-[color:var(--portal-primary-50)]`,
    )}
  >
    B
  </span>
);

export const C = ({ state }: { state: "idle" | "loading" | "error" }) => (
  <button
    className={clsx(
      "bg-[color:var(--portal-surface-1)] text-[color:var(--portal-ink)]",
      state === "idle" && "border-[color:var(--portal-surface-3)]",
      state === "loading" && ["bg-[color:var(--portal-primary-50)]", "text-[color:var(--portal-primary)]"],
      state === "error" ? "bg-[color:var(--portal-error-50)] text-[color:var(--portal-error)]" : "hover:bg-[color:var(--portal-surface-1)]",
    )}
  >
    C
  </button>
);
