"use client";

const CSRF_COOKIE = "mt-csrf";
const CSRF_HEADER = "x-csrf-token";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function ensureCsrf(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  const res = await fetch("/api/auth/csrf", { method: "GET", credentials: "include" });
  const body = (await res.json()) as { data?: { csrfToken: string } };
  return body.data?.csrfToken ?? readCookie(CSRF_COOKIE) ?? "";
}

/**
 * POST JSON and consume an SSE (`text/event-stream`) or NDJSON body.
 * Invokes `onEvent` for each `data:` JSON payload.
 * Returns a network/HTTP error message, or null on a clean stream end.
 */
export async function streamPost<TEvent>(
  url: string,
  body: unknown,
  onEvent: (event: TEvent) => void
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    const token = await ensureCsrf();
    res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        [CSRF_HEADER]: token,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: "Network error. Please check your connection and try again." };
  }

  const contentType = res.headers.get("content-type") ?? "";

  // Auth / validation failures still return JSON via handleError.
  if (!res.ok || contentType.includes("application/json")) {
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      return {
        error: json.error?.message ?? "Something went wrong. Please try again.",
      };
    } catch {
      return { error: "Something went wrong. Please try again." };
    }
  }

  if (!res.body) {
    return { error: "Empty response from server." };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines; also accept NDJSON.
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        const payload = trimmed.startsWith("data:")
          ? trimmed.slice(5).trim()
          : trimmed;
        if (!payload || payload === "[DONE]") continue;
        try {
          onEvent(JSON.parse(payload) as TEvent);
        } catch {
          // Skip malformed chunks rather than aborting the whole run.
        }
      }
    }

    // Flush a trailing line without newline.
    const trailing = buffer.trim();
    if (trailing && !trailing.startsWith(":")) {
      const payload = trailing.startsWith("data:") ? trailing.slice(5).trim() : trailing;
      if (payload && payload !== "[DONE]") {
        try {
          onEvent(JSON.parse(payload) as TEvent);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    return { error: "Connection lost while generating. Please try again." };
  }

  return { error: null };
}
