/**
 * ui-v3 SectionCard — opinionated Card layout used across admin/portal pages.
 * Wraps shadcn Card with title, description, optional actions, and footer.
 */
import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
  /** Removes inner padding from CardContent — useful when embedding a DataTable. */
  flush?: boolean;
}

export function SectionCard({
  title,
  description,
  actions,
  footer,
  className,
  bodyClassName,
  children,
  flush,
}: SectionCardProps) {
  return (
    <Card className={cn(className)}>
      {(title || description || actions) && (
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0 space-y-1">
            {title ? <CardTitle className="text-base font-semibold">{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
        </CardHeader>
      )}
      {children ? (
        <CardContent className={cn(flush && "p-0", bodyClassName)}>{children}</CardContent>
      ) : null}
      {footer ? <CardFooter className="justify-end gap-2">{footer}</CardFooter> : null}
    </Card>
  );
}
