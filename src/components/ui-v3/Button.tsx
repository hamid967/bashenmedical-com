/**
 * ui-v3 Button — thin wrapper over shadcn Button, unified with the
 * ui-v3 loading/disabled contract:
 *  - `loading` shows the shared LoadingSpinner and sets `aria-busy`.
 *  - `disabled` OR `loading` disables the button and sets `aria-disabled`.
 *  - `leftIcon` / `rightIcon` for RTL-aware icon slots.
 *  - `loadingLabel` overrides the spinner's aria-label (defaults V3_LABELS.loading).
 *
 * Keeps the same variants/sizes as `@/components/ui/button`.
 */
import * as React from "react";
import { Button as BaseButton, type ButtonProps as BaseProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoadingSpinner, V3_LABELS } from "./state";

export interface ButtonProps extends BaseProps {
  loading?: boolean;
  loadingLabel?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { loading, loadingLabel, disabled, leftIcon, rightIcon, children, className, ...rest },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    return (
      <BaseButton
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        className={cn(className)}
        {...rest}
      >
        {loading ? (
          <LoadingSpinner label={loadingLabel ?? V3_LABELS.loading} />
        ) : (
          leftIcon
        )}
        {children}
        {!loading ? rightIcon : null}
      </BaseButton>
    );
  },
);
Button.displayName = "ButtonV3";

export { buttonVariants } from "@/components/ui/button";
