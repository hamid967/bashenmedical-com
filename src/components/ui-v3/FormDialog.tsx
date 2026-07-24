/**
 * ui-v3 FormDialog — a Dialog scaffold for create/edit forms.
 * Consumers render <Field>s as children. Async submit with loading + error surface.
 */
import * as React from "react";
import { toast } from "sonner";
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

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  submitLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  onSubmit: () => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
  /** Disables the submit button (e.g. when form is invalid). */
  submitDisabled?: boolean;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = "حفظ",
  cancelLabel = "إلغاء",
  onSubmit,
  children,
  className,
  submitDisabled,
}: FormDialogProps) {
  const [busy, setBusy] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    try {
      setBusy(true);
      await onSubmit();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!busy ? onOpenChange(v) : null)}>
      <DialogContent className={cn("max-w-lg", className)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-4">{children}</div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" loading={busy} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
