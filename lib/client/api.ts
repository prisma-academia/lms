"use client";

const CSRF_COOKIE = "mt-csrf";
const CSRF_HEADER = "x-csrf-token";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function ensureCsrf(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  const res = await fetch("/api/auth/csrf", { method: "GET", credentials: "include" });
  const body = (await res.json()) as { data?: { csrfToken: string } };
  return body.data?.csrfToken ?? readCookie(CSRF_COOKIE) ?? "";
}

export type ApiResponse<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
  /**
   * HTTP status of the response, or 0 when the request never completed
   * (network/offline). Lets callers decide whether an error is retryable
   * (0 / 5xx) vs. a validation/auth error (4xx).
   */
  status?: number;
};

const NETWORK_ERROR: ApiResponse<never> = {
  data: null,
  error: { code: "network", message: "Network error. Please check your connection and try again." },
  status: 0,
};

/**
 * What to tell the user when the response wasn't JSON at all.
 *
 * Every API route in this app answers with `{data, error}` — so a body we
 * cannot parse did not come from a route handler. It came from the hosting
 * platform, and the status code is the only evidence of why. Collapsing all of
 * them into one "Something went wrong" is what turns a function timeout on a
 * slow upload into an unreportable mystery.
 */
function explainNonJson(status: number): { code: string; message: string } {
  if (status === 504 || status === 408) {
    return {
      code: "timeout",
      message:
        "The server took too long and the request was cut off. If this was a file upload, try a smaller image; otherwise wait a moment and try again.",
    };
  }
  if (status === 413) {
    return { code: "too_large", message: "The request was rejected as too large." };
  }
  if (status === 502 || status === 503) {
    return {
      code: "unavailable",
      message: "The server is temporarily unavailable. Try again in a moment.",
    };
  }
  if (status >= 500) {
    return {
      code: "server_error",
      message: `The server failed with an unexpected error (${status}). Try again; if it keeps happening this needs to be reported.`,
    };
  }
  return {
    code: "unexpected",
    message: `The server returned an unreadable response (${status}). Please try again.`,
  };
}

async function parse<T>(res: Response): Promise<ApiResponse<T>> {
  try {
    const body = (await res.json()) as ApiResponse<T>;
    return { ...body, status: res.status };
  } catch {
    // Non-JSON / empty body — a platform error page rather than a route reply.
    return { data: null, error: explainNonJson(res.status), status: res.status };
  }
}

export async function apiPost<T>(
  url: string,
  body: unknown,
  init?: { headers?: Record<string, string> }
): Promise<ApiResponse<T>> {
  try {
    const token = await ensureCsrf();
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER]: token,
        ...init?.headers,
      },
      body: JSON.stringify(body),
    });
    return parse<T>(res);
  } catch {
    return NETWORK_ERROR;
  }
}

export async function apiPatch<T>(
  url: string,
  body: unknown,
  init?: { headers?: Record<string, string> }
): Promise<ApiResponse<T>> {
  try {
    const token = await ensureCsrf();
    const res = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER]: token,
        ...init?.headers,
      },
      body: JSON.stringify(body),
    });
    return parse<T>(res);
  } catch {
    return NETWORK_ERROR;
  }
}

export async function apiPut<T>(
  url: string,
  body: unknown,
  init?: { headers?: Record<string, string> }
): Promise<ApiResponse<T>> {
  try {
    const token = await ensureCsrf();
    const res = await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        [CSRF_HEADER]: token,
        ...init?.headers,
      },
      body: JSON.stringify(body),
    });
    return parse<T>(res);
  } catch {
    return NETWORK_ERROR;
  }
}

export async function apiDelete<T>(url: string): Promise<ApiResponse<T>> {
  try {
    const token = await ensureCsrf();
    const res = await fetch(url, {
      method: "DELETE",
      credentials: "include",
      headers: { [CSRF_HEADER]: token },
    });
    return parse<T>(res);
  } catch {
    return NETWORK_ERROR;
  }
}

export async function apiGet<T>(url: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, { credentials: "include" });
    return parse<T>(res);
  } catch {
    return NETWORK_ERROR;
  }
}
