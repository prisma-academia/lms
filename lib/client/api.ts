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

async function parse<T>(res: Response): Promise<ApiResponse<T>> {
  try {
    const body = (await res.json()) as ApiResponse<T>;
    return { ...body, status: res.status };
  } catch {
    // Non-JSON / empty body (e.g. a 500 HTML error page).
    return {
      data: null,
      error: { code: "unexpected", message: "Something went wrong. Please try again." },
      status: res.status,
    };
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
