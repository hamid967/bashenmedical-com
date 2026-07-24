/**
 * ui-v3 ConfirmDialog — controlled confirmation on top of shadcn AlertDialog.
 * Uses the unified `useAsyncAction` hook so the busy/error contract matches
 * FormDialog and Button.
 *
 *   - `errorMode`: 'toast' (default), 'inline' (banner inside dialog), or 'both'.
 *   - Body cannot be dismissed while busy.
 *   - Confirm button gets `aria-busy`, spinner, and `busyLabel`.
 */
import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  InlineError,
  LoadingSpinner,
  V3_LABELS,
  useAsyncAction,
} from "./state";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  busyLabel?: React.ReactNode;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  errorMode?: "toast" | "inline" | "both";
  errorFallback?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  busyLabel = V3_LABELS.processing,
  destructive,
  onConfirm,
  errorMode = "toast",
  errorFallback = V3_LABELS.actionError,
}: ConfirmDialogProps) {
  const { run, busy, error, reset } = useAsyncAction();

  // Clear inline error when the dialog is reopened.
  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    await run(async () => onConfirm(), {
      mode: errorMode,
      errorFallback,
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => (!busy ? onOpenChange(v) : null)}>
      <AlertDialogContent aria-busy={busy || undefined}>
        <AlertDialogHeader className="sm:text-start">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {error && (errorMode === "inline" || errorMode === "both") ? (
          <InlineError variant="banner">{error}</InlineError>
        ) : null}
        <AlertDialogFooter className="gap-2 sm:space-x-0">

          <AlertDialogCancel disabled={busy} aria-disabled={busy || undefined}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={busy}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            data-loading={busy || undefined}
            className={cn(
              destructive &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {busy ? <LoadingSpinner label={V3_LABELS.processing} /> : null}
            {busy ? busyLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
