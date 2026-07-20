"use client";

import { ProgressBar } from "@/components/ui/progress-bar";
import { formatBytes } from "@/lib/media/format";

/**
 * Storage usage against the tenant quota.
 *
 * Colour walks success -> warning -> destructive rather than staying one hue:
 * "82% full" only reads as urgent if it looks urgent.
 */
export function StorageMeter({
  usedBytes,
  reservedBytes,
  quotaBytes,
}: {
  usedBytes: number;
  reservedBytes: number;
  quotaBytes: number;
}) {
  const committed = usedBytes + reservedBytes;
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((committed / quotaBytes) * 100)) : 100;
  const color = pct >= 90 ? "var(--destructive)" : pct >= 75 ? "var(--warning)" : "var(--success)";

  return (
    <div className="rounded-[12px] border-2 border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">Storage</span>
        <span className="num text-xs text-muted-foreground">{pct}%</span>
      </div>
      <div className="mt-2">
        <ProgressBar value={pct} size="sm" color={color} aria-label="Storage used" />
      </div>
      <p className="num mt-1.5 text-xs text-muted-foreground">
        {formatBytes(committed)} of {formatBytes(quotaBytes)}
        {reservedBytes > 0 ? ` · ${formatBytes(reservedBytes)} uploading` : ""}
      </p>
      {pct >= 90 ? (
        <p className="mt-1 text-xs font-bold text-destructive">
          Almost full — upgrade your plan or remove files to keep uploading.
        </p>
      ) : null}
    </div>
  );
}
