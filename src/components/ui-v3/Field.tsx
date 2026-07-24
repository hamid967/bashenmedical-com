/**
 * ui-v3 Field — one primitive to render a labelled form control with help + error.
 * Wraps any input (Input / Textarea / Select / Switch / Checkbox / custom).
 *
 * Usage:
 *   <Field label="الاسم" required error={errors.name} help="كما في الهوية">
 *     <Input value={...} onChange={...} />
 *   </Field>
 */
import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  help?: React.ReactNode;
  error?: React.ReactNode;
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
  className,
  children,
  inline,
}: FieldProps) {
  const helpId = htmlFor ? `${htmlFor}-help` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  const control = React.isValidElement(children) && htmlFor
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? htmlFor,
        "aria-invalid": error ? true : undefined,
        "aria-describedby":
          [error ? errorId : null, help ? helpId : null].filter(Boolean).join(" ") || undefined,
      })
    : children;

  if (inline) {
    return (
      <div className={cn("flex items-start justify-between gap-4", className)}>
        <div className="min-w-0">
          {label ? (
            <Label htmlFor={htmlFor} className="text-sm">
              {label}
              {required ? <span className="text-destructive"> *</span> : null}
            </Label>
          ) : null}
          {help ? (
            <p id={helpId} className="text-xs text-muted-foreground mt-1">
              {help}
            </p>
          ) : null}
          {error ? (
            <p id={errorId} className="text-xs text-destructive mt-1" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="shrink-0">{control}</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
      ) : null}
      {control}
      {help && !error ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
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
