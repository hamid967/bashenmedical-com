import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from "react";

/**
 * PortalInput — canonical text input primitive for the patient portal.
 * All styling reads from var(--ds-*) tokens only.
 */
export interface PortalInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  containerClassName?: string;
}

export const PortalInput = forwardRef<HTMLInputElement, PortalInputProps>(function PortalInput(
  {
    label,
    hint,
    error,
    leadingIcon,
    trailingIcon,
    id,
    containerClassName = "",
    className = "",
    disabled,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedById = hint || error ? `${inputId}-desc` : undefined;
  const invalid = Boolean(error);

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-[12.5px] font-semibold"
          style={{ color: "var(--ds-ink-900)" }}
        >
          {label}
        </label>
      )}
      <div
        className="relative flex items-center"
        style={{
          background: "#ffffff",
          border: `1px solid ${invalid ? "var(--ds-error-500)" : "var(--ds-border-strong)"}`,
          borderRadius: "var(--ds-radius-md)",
          transition: "border-color var(--ds-dur-base) var(--ds-ease-out), box-shadow var(--ds-dur-base) var(--ds-ease-out)",
        }}
      >
        {leadingIcon && (
          <span
            className="pl-3 inline-flex items-center"
            style={{ color: "var(--ds-ink-400)" }}
            aria-hidden
          >
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedById}
          className={[
            "flex-1 min-w-0 bg-transparent outline-none",
            "h-10 px-3 text-sm",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "placeholder:opacity-70",
            className,
          ].join(" ")}
          style={{ color: "var(--ds-ink-900)" }}
          onFocus={(e) => {
            const el = e.currentTarget.parentElement as HTMLElement | null;
            if (el) {
              el.style.borderColor = invalid ? "var(--ds-error-500)" : "var(--ds-brand-500)";
              el.style.boxShadow = "var(--ds-shadow-glow)";
            }
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            const el = e.currentTarget.parentElement as HTMLElement | null;
            if (el) {
              el.style.borderColor = invalid ? "var(--ds-error-500)" : "var(--ds-border-strong)";
              el.style.boxShadow = "none";
            }
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {trailingIcon && (
          <span
            className="pr-3 inline-flex items-center"
            style={{ color: "var(--ds-ink-400)" }}
            aria-hidden
          >
            {trailingIcon}
          </span>
        )}
      </div>
      {(hint || error) && (
        <p
          id={describedById}
          className="text-[12px]"
          style={{ color: invalid ? "var(--ds-error-500)" : "var(--ds-ink-600)" }}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
