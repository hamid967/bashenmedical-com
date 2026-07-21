import { clsx } from "clsx";
export const C = ({ active }: { active: boolean }) => (
  <button
    className={clsx(
      "bg-slate-50 text-gray-700 border-zinc-200",
      "hover:bg-neutral-100 focus:text-stone-900",
      active && "bg-blue-600 text-white",
    )}
  >
    ok
  </button>
);
