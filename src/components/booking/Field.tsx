import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

/**
 * Accessible form field wrapper.
 * - Generates a stable id, wires <label htmlFor> to the child control.
 * - Injects aria-describedby/aria-required/aria-invalid on the child.
 * - Renders an optional static hint and an error message as role="alert".
 *
 * For grouped controls (e.g., radiogroup of buttons) prefer a native
 * <fieldset><legend> instead of this component — a <label> pointing at a
 * non-focusable wrapping div has no clickable target for the label text.
 */
export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  const enhanced = isValidElement(children)
    ? cloneElement(children as ReactElement<any>, {
        id,
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className="block">
      <label htmlFor={id} className="block text-xs font-semibold mb-1.5">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {enhanced}
      {hint && (
        <div id={hintId} className="text-[11px] text-muted-foreground mt-1">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
