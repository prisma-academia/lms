"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Shared body for App Router `error.tsx` boundaries. Renders the neo-brutalist
 * dialog-style ErrorState with Retry (→ reset) and Cancel (→ router.back).
 * Each segment's `error.tsx` is a thin `"use client"` wrapper around this.
 */
export function RouteError({
  error,
  reset,
  title,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <ErrorState
        title={title}
        message={error.message || "An unexpected error occurred."}
        digest={error.digest}
        onRetry={reset}
        onCancel={() => router.back()}
      />
    </div>
  );
}
