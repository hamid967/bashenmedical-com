import { useId } from "react";
import type React from "react";

export function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const labelId = useId();
  return (
    <div>
      <div id={labelId} className="font-semibold text-sm mb-2.5 text-foreground/90">
        {title}
      </div>
      <div
        className="space-y-2 max-h-56 overflow-y-auto pe-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        role="group"
        aria-labelledby={labelId}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
