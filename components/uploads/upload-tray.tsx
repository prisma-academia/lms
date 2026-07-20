"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Icon } from "@/components/icon";
import { formatBytes } from "@/lib/media/format";
import { useUploads } from "@/lib/client/uploads/use-uploads";

/**
 * Collapsed dock shown while uploads run on any page other than the library
 * itself — the queue lives on /admin/library, so duplicating it there would be
 * two progress bars for the same work.
 */
export function UploadTray() {
  const pathname = usePathname();
  const { tasks, totalBytes, sentBytes, activeCount } = useUploads();

  if (pathname?.startsWith("/admin/library")) return null;
  if (activeCount === 0) return null;

  const pct = totalBytes > 0 ? Math.min(100, Math.round((sentBytes / totalBytes) * 100)) : 0;

  return (
    <div className="safe-b fixed bottom-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-[12px] border-2 border-border bg-card p-3 shadow-lg">
      <Link href="/admin/library" className="flex items-center gap-2">
        <Icon name="upload" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          Uploading {activeCount} of {tasks.length}
        </span>
        <Icon name="chevron-right" className="size-4 shrink-0 text-muted-foreground" />
      </Link>
      <div className="mt-2">
        <ProgressBar value={pct} size="sm" color="var(--info)" aria-label="Upload progress" />
      </div>
      <p className="num mt-1 text-xs text-muted-foreground">
        {formatBytes(sentBytes)} of {formatBytes(totalBytes)} · {pct}%
      </p>
    </div>
  );
}
