import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";
import { cn } from "@/lib/utils";

// twMerge وظيفته حل التعارض بين utilities لنفس الخاصية.
// نُثبِّت هنا أن codemod يستبدل كل utility على حدة دون كسر منطق twMerge.

export const A = ({ selected }: { selected: boolean }) => (
  <button
    className={twMerge(
      "bg-[color:var(--portal-surface-1)] text-[color:var(--portal-ink)] border border-[color:var(--portal-surface-3)]",
      "bg-[color:var(--portal-surface-1)]",
      selected && "bg-[color:var(--portal-primary)] text-[color:var(--portal-on-primary)] border-[color:var(--portal-primary)]",
      "hover:bg-[color:var(--portal-surface-2)]",
    )}
  >
    A
  </button>
);

export const B = ({ tone, big }: { tone: "ok" | "warn" | "err"; big: boolean }) => (
  <div
    className={twMerge(
      clsx(
        "bg-[color:var(--portal-surface-1)] text-[color:var(--portal-ink-2)]",
        "text-[color:var(--portal-ink)]",
        big && "text-[color:var(--portal-ink)]",
      ),
      tone === "ok" && "bg-emerald-50 text-emerald-700",
      tone === "warn" && "bg-amber-50 text-amber-700",
      tone === "err" && "bg-red-50 text-red-700",
      "border border-zinc-200 border-slate-200",
    )}
  >
    B
  </div>
);

export const C = ({ pad, dense }: { pad: "sm" | "md"; dense: boolean }) => (
  <section
    className={cn(
      twMerge(
        `bg-[color:var(--portal-surface-1)] border-[color:var(--portal-surface-3)] ${dense ? "border-slate-100" : "border-neutral-200"}`,
        pad === "sm" ? "bg-[color:var(--portal-surface-1)]" : "bg-[color:var(--portal-surface-1)]",
      ),
      "text-slate-900 text-gray-800",
      dense && ["text-neutral-700", "text-stone-900"],
    )}
  >
    C
  </section>
);
