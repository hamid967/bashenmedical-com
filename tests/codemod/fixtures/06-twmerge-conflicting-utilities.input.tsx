import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";
import { cn } from "@/lib/utils";

// twMerge وظيفته حل التعارض بين utilities لنفس الخاصية.
// نُثبِّت هنا أن codemod يستبدل كل utility على حدة دون كسر منطق twMerge.

export const A = ({ selected }: { selected: boolean }) => (
  <button
    className={twMerge(
      "bg-white text-slate-900 border border-gray-200",
      "bg-slate-50",
      selected && "bg-blue-600 text-white border-blue-700",
      "hover:bg-neutral-100",
    )}
  >
    A
  </button>
);

export const B = ({ tone, big }: { tone: "ok" | "warn" | "err"; big: boolean }) => (
  <div
    className={twMerge(
      clsx(
        "bg-white text-gray-700",
        "text-slate-900",
        big && "text-black",
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
        `bg-white border-gray-200 ${dense ? "border-slate-100" : "border-neutral-200"}`,
        pad === "sm" ? "bg-slate-50" : "bg-white",
      ),
      "text-slate-900 text-gray-800",
      dense && ["text-neutral-700", "text-stone-900"],
    )}
  >
    C
  </section>
);
