import { useId, type ReactNode } from "react";

export function StepShell({ title, children }: { lang: "ar" | "en"; title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xl md:text-2xl font-bold mb-5 text-center">{title}</h2>
      {children}
    </section>
  );
}
