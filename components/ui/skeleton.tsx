import { cn } from "@/lib/utils";

/**
 * Placeholders for content that is on its way.
 *
 * A skeleton is honest about two things a spinner is not: roughly what shape is
 * coming, and where — so the page does not jump when the content lands. Keep
 * them close to the real layout; a skeleton that looks nothing like the page is
 * just a slower spinner.
 *
 * The pulse is suppressed for people who ask for reduced motion (the global
 * reduced-motion rule in globals.css covers `animate-pulse`), and the whole
 * placeholder is hidden from assistive technology: a screen reader should hear
 * "Loading…" once, from the route's status region, not a list of grey boxes.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[8px] bg-muted", className)} />;
}

/** A title, a subtitle and an optional action — the shape of `PageHeader`. */
export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3" aria-hidden>
      <div className="min-w-0 flex-1">
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      {action ? <Skeleton className="h-10 w-32" /> : null}
    </div>
  );
}

/** A bordered card with a few lines in it — the shape of `Card`. */
export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-[14px] border-2 border-border bg-card p-5", className)} aria-hidden>
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/** Rows of a list or table. */
export function RowsSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn("overflow-hidden rounded-[14px] border-2 border-border bg-card", className)}
      aria-hidden
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn("flex items-center gap-3 px-4 py-3.5", i > 0 && "border-t-2 border-dashed border-border")}
        >
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
          <Skeleton className="hidden h-8 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

/** A grid of cards — course catalogues, dashboards. */
export function CardGridSkeleton({ cards = 6, className }: { cards?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)} aria-hidden>
      {Array.from({ length: cards }, (_, i) => (
        <CardSkeleton key={i} lines={2} />
      ))}
    </div>
  );
}

/**
 * A whole page while its route loads. `children` is the skeleton body; the
 * status text is what a screen reader announces.
 */
export function PageSkeleton({
  label = "Loading…",
  action,
  children,
}: {
  label?: string;
  action?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <PageHeaderSkeleton action={action} />
      {children ?? <RowsSkeleton />}
    </div>
  );
}
