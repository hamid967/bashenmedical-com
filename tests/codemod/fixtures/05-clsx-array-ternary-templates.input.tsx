import { clsx } from "clsx";
import { cn } from "@/lib/utils";

export const A = ({ on, tone }: { on: boolean; tone: "ok" | "err" }) => (
  <div
    className={clsx([
      "bg-white text-slate-900",
      ["border border-gray-200", "hover:bg-neutral-50"],
      on ? "text-emerald-600" : "text-red-600",
      tone === "ok" ? ["bg-emerald-50", "border-emerald-200"] : ["bg-red-50", "border-red-200"],
    ])}
  >
    A
  </div>
);

export const B = ({ big, muted }: { big: boolean; muted: boolean }) => (
  <span
    className={cn(
      `bg-white ${big ? "text-slate-900" : "text-slate-700"} border-zinc-200`,
      `${muted ? "text-gray-500" : "text-black"} hover:bg-neutral-100`,
      big && `focus:text-stone-900 bg-sky-50`,
    )}
  >
    B
  </span>
);

export const C = ({ state }: { state: "idle" | "loading" | "error" }) => (
  <button
    className={clsx(
      "bg-white text-slate-900",
      state === "idle" && "border-gray-200",
      state === "loading" && ["bg-blue-50", "text-blue-700"],
      state === "error" ? "bg-red-50 text-red-700" : "hover:bg-neutral-50",
    )}
  >
    C
  </button>
);
