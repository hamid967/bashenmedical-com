/**
 * ui-v3 Button — thin wrapper over shadcn Button, unified with the
 * ui-v3 loading/disabled contract:
 *  - `loading` shows the shared LoadingSpinner and sets `aria-busy`.
 *  - `disabled` OR `loading` disables the button and sets `aria-disabled`.
 *  - `startIcon` / `endIcon` for direction-aware icon slots (RTL flips them
 *    automatically via flexbox — no per-page config).
 *  - `leftIcon` / `rightIcon` are kept as aliases for `startIcon`/`endIcon`
 *    so existing call sites continue to work; in RTL both render on the
 *    logically correct side.
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
  /** Icon at the logical start of the button (right in RTL, left in LTR). */
  startIcon?: React.ReactNode;
  /** Icon at the logical end of the button (left in RTL, right in LTR). */
  endIcon?: React.ReactNode;
  /** @deprecated Alias of `startIcon`. Kept for legacy imports. */
  leftIcon?: React.ReactNode;
  /** @deprecated Alias of `endIcon`. Kept for legacy imports. */
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      loading,
      loadingLabel,
      disabled,
      startIcon,
      endIcon,
      leftIcon,
      rightIcon,
      children,
      className,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    const start = startIcon ?? leftIcon;
    const end = endIcon ?? rightIcon;
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
          start
        )}
        {children}
        {!loading ? end : null}
      </BaseButton>
    );
  },
);
Button.displayName = "ButtonV3";

export { buttonVariants } from "@/components/ui/button";
