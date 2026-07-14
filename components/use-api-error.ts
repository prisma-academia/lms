"use client";

import { useCallback } from "react";
import { useErrorDialog } from "@/components/error-dialog";
import type { ApiResponse } from "@/lib/client/api";

/**
 * Routes a failed `lib/client/api` response to the global error dialog.
 *
 * Usage:
 *   const report = useApiError();
 *   const res = await apiPost(...);
 *   if (!report(res, () => submit())) return;   // stop on error
 *   // ...success path
 *
 * Retry rule: network (status 0) and server (5xx) errors get a Retry button
 * (re-runs `retry`); validation/auth errors (4xx) get a single Dismiss.
 */
export function useApiError() {
  const { showError } = useErrorDialog();
  return useCallback(
    (
      result: Pick<ApiResponse<unknown>, "error" | "status">,
      retry?: () => void,
      opts?: { title?: string },
    ): boolean => {
      if (!result.error) return true;
      const s = result.status;
      const retryable = s === 0 || (typeof s === "number" && s >= 500);
      showError({
        title: opts?.title,
        message: result.error.message,
        onRetry: retryable && retry ? retry : undefined,
      });
      return false;
    },
    [showError],
  );
}
