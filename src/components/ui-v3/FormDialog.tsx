/**
 * ui-v3 FormDialog — Dialog scaffold for create/edit forms.
 * Consumers render <Field>s as children. Uses the unified `useAsyncAction`
 * hook so busy/error behavior matches ConfirmDialog and Button.
 *
 *   - `errorMode`: 'toast' (default), 'inline' (banner in the form), or 'both'.
 *   - Cannot dismiss while submitting.
 *   - `submitDisabled` for external form-validity gating.
 */
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui-v3/Button";
import { cn } from "@/lib/utils";
import { InlineError, V3_LABELS, useAsyncAction } from "./state";

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  submitLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  busyLabel?: React.ReactNode;
  onSubmit: () => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
  /** Disables the submit button (e.g. when form is invalid). */
  submitDisabled?: boolean;
  errorMode?: "toast" | "inline" | "both";
  errorFallback?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = "حفظ",
  cancelLabel = "إلغاء",
  busyLabel = V3_LABELS.saving,
  onSubmit,
  children,
  className,
  submitDisabled,
  errorMode = "toast",
  errorFallback = V3_LABELS.saveError,
}: FormDialogProps) {
  const { run, busy, error, reset } = useAsyncAction();

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => onSubmit(), {
      mode: errorMode,
      errorFallback,
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!busy ? onOpenChange(v) : null)}>
      <DialogContent className={cn("max-w-lg", className)} aria-busy={busy || undefined}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="sm:text-start">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {error && (errorMode === "inline" || errorMode === "both") ? (
            <InlineError variant="banner">{error}</InlineError>
          ) : null}
          <div className="space-y-4">{children}</div>
          <DialogFooter className="gap-2 sm:space-x-0">

            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              loading={busy}
              loadingLabel={typeof busyLabel === "string" ? busyLabel : V3_LABELS.saving}
              disabled={submitDisabled}
            >
              {busy ? busyLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
