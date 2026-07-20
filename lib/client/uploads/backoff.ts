"use client";

/** Retry policy for part uploads. */

export const MAX_ATTEMPTS = 5;

/**
 * Transient conditions worth retrying: the request never completed (status 0),
 * the server is unwell (5xx), or we are being throttled (429). A 4xx is the
 * client's fault and retrying just burns the budget.
 *
 * 403 is handled separately by the caller — from S3 it means the presigned URL
 * expired, which is recoverable by re-presigning rather than by waiting.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/**
 * Exponential backoff with full jitter. Jitter matters here: without it, a
 * queue of parts that fail together retry in lockstep and hammer the endpoint
 * in synchronised waves.
 */
export function delayFor(attempt: number): number {
  const capped = Math.min(30_000, 500 * 2 ** attempt);
  return Math.round(capped * (0.5 + Math.random() * 0.5));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}
