import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared error panel used by every route `error.tsx` boundary (and reusable
 * anywhere an inline error needs to be shown). Styled as a neo-brutalist
 * dialog-style card with a Retry + Cancel pair, mirroring `EmptyState`.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  digest,
  onRetry,
  onCancel,
  retryLabel = "Retry",
  cancelLabel = "Cancel",
  children,
  className,
}: {
  title?: string;
  message?: string;
  digest?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  retryLabel?: string;
  cancelLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-[14px] border-2 border-border bg-card p-6 text-center shadow-lg",
        className
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full border-2 border-border bg-destructive text-destructive-foreground shadow-sm">
        <Icon name="alert-triangle" className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-heading text-lg leading-tight text-card-foreground">
          {title}
        </p>
        {message ? (
          <p className="text-sm font-medium text-muted-foreground">{message}</p>
        ) : null}
        {digest ? (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            ref {digest}
          </p>
        ) : null}
      </div>
      {children}
      {onRetry || onCancel ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onCancel ? (
            <Button variant="outline" onClick={onCancel}>
              {cancelLabel}
            </Button>
          ) : null}
          {onRetry ? (
            <Button variant="default" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
