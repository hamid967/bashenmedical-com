import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

/**
 * PortalButton — canonical action primitive for the patient portal.
 * Reads colors, radii, shadows and motion exclusively from var(--ds-*) tokens.
 */
export interface PortalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
}

const sizeMap: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export const PortalButton = forwardRef<HTMLButtonElement, PortalButtonProps>(function PortalButton(
  {
    variant = "primary",
    size = "md",
    leadingIcon,
    trailingIcon,
    fullWidth,
    loading,
    disabled,
    className = "",
    children,
    style,
    ...rest
  },
  ref,
) {
  const variantStyle: React.CSSProperties =
    variant === "primary"
      ? {
          background: "var(--ds-brand-700)",
          color: "#ffffff",
          border: "1px solid var(--ds-brand-700)",
          boxShadow: "var(--ds-shadow-sm)",
        }
      : variant === "secondary"
        ? {
            background: "var(--ds-brand-50)",
            color: "var(--ds-brand-700)",
            border: "1px solid color-mix(in oklab, var(--ds-brand-500) 18%, transparent)",
          }
        : variant === "danger"
          ? {
              background: "var(--ds-error-500)",
              color: "#ffffff",
              border: "1px solid var(--ds-error-500)",
              boxShadow: "var(--ds-shadow-sm)",
            }
          : variant === "outline"
            ? {
                background: "transparent",
                color: "var(--ds-ink-900)",
                border: "1px solid var(--ds-border-strong)",
              }
            : {
                background: "transparent",
                color: "var(--ds-ink-900)",
                border: "1px solid transparent",
              };

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--ds-radius-md)]",
        "transition-[transform,box-shadow,background,color,border-color]",
        "focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed",
        "active:translate-y-[1px]",
        sizeMap[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transitionDuration: "var(--ds-dur-base)",
        transitionTimingFunction: "var(--ds-ease-out)",
        ...variantStyle,
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = "var(--ds-shadow-glow)";
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow =
          variant === "primary" || variant === "danger" ? "var(--ds-shadow-sm)" : "none";
        rest.onBlur?.(e);
      }}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      )}
      {!loading && leadingIcon && <span className="shrink-0 inline-flex">{leadingIcon}</span>}
      <span className="truncate">{children}</span>
      {!loading && trailingIcon && <span className="shrink-0 inline-flex">{trailingIcon}</span>}
    </button>
  );
});
