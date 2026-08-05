import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(145deg, var(--brand-mint) 0%, var(--brand-sky) 48%, var(--background) 100%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 -z-10 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 12% 18%, color-mix(in oklab, var(--brand) 16%, transparent), transparent 52%), radial-gradient(ellipse at 88% 72%, color-mix(in oklab, var(--brand-gold) 18%, transparent), transparent 58%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 -z-10 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--brand-deep) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />
      <div className="container-app py-14 md:py-20">
        {eyebrow && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--brand-gold-soft)] bg-white/75 backdrop-blur px-3.5 py-1 text-xs font-semibold tracking-wide text-[color:var(--brand-deep)]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--brand-gold)" }}
              aria-hidden
            />
            {eyebrow}
          </div>
        )}
        <h1 className="brand-mark text-3xl md:text-5xl max-w-3xl">{title}</h1>
        {subtitle && <p className="section-lede text-base md:text-lg">{subtitle}</p>}
        {children && <div className="mt-6">{children}</div>}
        <div
          className="mt-8 h-[3px] w-16 rounded-full"
          style={{ background: "var(--brand-gold)" }}
          aria-hidden
        />
      </div>
    </section>
  );
}

export function SectionCard({
  icon,
  title,
  desc,
  children,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <div className="group bento-card p-6">
      {icon && (
        <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[color:var(--brand-mist)] text-[color:var(--brand-deep)] ring-1 ring-[color:var(--brand-gold-soft)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {desc && <p className="mt-1.5 text-sm text-muted-foreground leading-7">{desc}</p>}
      {children}
    </div>
  );
}

/** Shared section header for public pages — one eyebrow, one title, one lede. */
export function SectionHeader({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? <div className="section-eyebrow mb-2">{eyebrow}</div> : null}
        <h2 className="section-heading">{title}</h2>
        {lede ? <p className="section-lede">{lede}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
