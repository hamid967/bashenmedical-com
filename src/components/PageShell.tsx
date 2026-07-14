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
      {/* Light warm mint → sky gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(135deg, var(--brand-mint) 0%, var(--brand-sky) 55%, var(--background) 100%)",
        }}
        aria-hidden
      />
      {/* Soft radial teal + gold glow */}
      <div
        className="absolute inset-0 -z-10 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, color-mix(in oklab, var(--brand) 18%, transparent), transparent 55%), radial-gradient(circle at 85% 70%, color-mix(in oklab, var(--brand-gold) 20%, transparent), transparent 60%)",
        }}
        aria-hidden
      />
      {/* Faint dotted pattern */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--brand-deep) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
        aria-hidden
      />
      <div className="container-app py-14 md:py-20">
        {eyebrow && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--brand-gold-soft)] bg-white/70 backdrop-blur px-3.5 py-1 text-xs font-semibold text-[color:var(--brand-deep)]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--brand-gold)" }}
              aria-hidden
            />
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-[color:var(--brand-deep)] leading-[1.15]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 max-w-2xl text-base md:text-lg text-muted-foreground leading-8">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-6">{children}</div>}
        {/* Gold underline accent */}
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
