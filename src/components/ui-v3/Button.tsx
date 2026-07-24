/**
 * ui-v3 Button — thin wrapper over shadcn Button.
 * Adds:
 *  - `loading` prop: shows a spinner and disables the button.
 *  - `leftIcon` / `rightIcon`: RTL-aware icon slots.
 *
 * Keeps the same variants/sizes as `@/components/ui/button` to avoid duplication.
 */
import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button as BaseButton, type ButtonProps as BaseProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ButtonProps extends BaseProps {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ loading, disabled, leftIcon, rightIcon, children, className, ...rest }, ref) => (
    <BaseButton
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(className)}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading ? rightIcon : null}
    </BaseButton>
  ),
);
Button.displayName = "ButtonV3";

export { buttonVariants } from "@/components/ui/button";
