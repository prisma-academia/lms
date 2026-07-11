export function Spinner({ label }: { label?: string }) {
  return (
    <div
      className="flex flex-1 items-center justify-center p-8"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm font-bold text-ink/60">
        <span className="size-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
        <span>{label ?? "Loading…"}</span>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-[14px] border-2 border-ink bg-card p-3 shadow-brutal">
      <div className="mb-2 h-3 w-32 animate-pulse rounded bg-ink/10" />
      <div className="divide-dash">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="grid gap-2 py-3"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((__, j) => (
              <div key={j} className="h-3 animate-pulse rounded bg-ink/10" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
