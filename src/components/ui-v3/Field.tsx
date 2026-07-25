/**
 * ui-v3 Field — one primitive to render a labelled form control with
 * help + unified error surface. Uses shared InlineError.
 *
 * Also supports:
 *  - `disabled`: propagates aria-disabled + visual dim to child control.
 *  - `loading`:  sets aria-busy on child control (skeleton left to consumer).
 */
import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { InlineError } from "./state";
import { shouldAutoDir } from "./rtl";

export interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  help?: React.ReactNode;
  error?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Renders label + control on the same row (for switches/checkboxes). */
  inline?: boolean;
}

export function Field({
  label,
  htmlFor,
  required,
  help,
  error,
  disabled,
  loading,
  className,
  children,
  inline,
}: FieldProps) {
  const helpId = htmlFor ? `${htmlFor}-help` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  const control = React.isValidElement(children)
    ? (() => {
        const childProps = children.props as {
          id?: string;
          disabled?: boolean;
          dir?: string;
          type?: string;
        };
        // Auto-apply `dir="auto"` on free-text inputs so the browser aligns
        // user content by its own script (Arabic UI + English email → both
        // read correctly without per-field overrides).
        const isTextInput =
          typeof (children as React.ReactElement).type === "string"
            ? (children as React.ReactElement).type === "input" ||
              (children as React.ReactElement).type === "textarea"
            : true; // custom input components (e.g. shadcn Input) forward `dir`.
        const shouldAuto = isTextInput && !childProps.dir && shouldAutoDir(childProps.type);
        return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          id: childProps.id ?? htmlFor,
          "aria-invalid": error ? true : undefined,
          "aria-busy": loading || undefined,
          "aria-disabled": disabled || undefined,
          disabled: disabled ?? childProps.disabled,
          ...(shouldAuto ? { dir: "auto" } : {}),
          "aria-describedby":
            [error ? errorId : null, help ? helpId : null].filter(Boolean).join(" ") || undefined,
        });
      })()
    : children;

  const labelNode = label ? (
    <Label htmlFor={htmlFor} className={cn(inline && "text-sm", disabled && "opacity-60")}>
      {label}
      {required ? <span className="text-destructive ms-1">*</span> : null}
    </Label>
  ) : null;

  const helpNode = help ? (
    <p id={helpId} className={cn("text-xs text-muted-foreground", inline && "mt-1")}>
      {help}
    </p>
  ) : null;

  const errorNode = error ? <InlineError id={errorId}>{error}</InlineError> : null;

  if (inline) {
    return (
      <div
        data-loading={loading || undefined}
        data-disabled={disabled || undefined}
        className={cn("flex items-start justify-between gap-4", className)}
      >
        <div className="min-w-0">
          {labelNode}
          {helpNode}
          {errorNode}
        </div>
        <div className="shrink-0">{control}</div>
      </div>
    );
  }

  return (
    <div
      data-loading={loading || undefined}
      data-disabled={disabled || undefined}
      className={cn("space-y-1.5", className)}
    >
      {labelNode}
      {control}
      {!error ? helpNode : null}
      {errorNode}
    </div>
  );
}

/** Simple grid container for stacking Fields into responsive columns. */
export function FieldGrid({
  columns = 2,
  className,
  children,
}: {
  columns?: 1 | 2 | 3;
  className?: string;
  children: React.ReactNode;
}) {
  const cols =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 md:grid-cols-2";
  return <div className={cn("grid gap-4", cols, className)}>{children}</div>;
}
