/**
 * Getting the customer back from the gateway, and knowing which payment they
 * came back from.
 *
 * Dependency-free on purpose: the server builds the return URL with this, the
 * browser reads it with this, and a script checks that the two agree.
 */

/** The shape of every reference this app issues: `course_` + 24 hex characters. */
const REFERENCE = /^[a-z]+_[0-9a-f]{24}$/;

export function isBillingReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE.test(value);
}

/**
 * The origin the customer is actually using — scheme, host and port.
 *
 * Return URLs used to be built as `http://` + the Host header. In production
 * that sends a customer who has just paid to an insecure address, where the
 * browser either warns them or silently drops the session cookie — and the
 * purchase looks like it failed.
 */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const candidate = forwardedHost || request.headers.get("host") || url.host;
  // A host is letters, digits, dots, hyphens and an optional port. Anything
  // else in the header is not going into a URL we hand to a payment gateway.
  const host = /^[a-z0-9.-]+(:\d{1,5})?$/i.test(candidate) ? candidate : url.host;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const protocol =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : // Behind a TLS-terminating proxy that sets no header, the request we
        // see is plain http even though the customer is on https.
        process.env.NODE_ENV === "production"
        ? "https"
        : url.protocol.replace(":", "");

  return `${protocol}://${host}`;
}

/**
 * Where the gateway should send the customer afterwards.
 *
 * Carries our own reference, so confirming the payment does not depend on which
 * query parameter a particular gateway chooses to add. `reference` goes LAST:
 * some gateways append their own `?paymentReference=…` without checking for an
 * existing query string, and whatever is last in the URL is what gets mangled.
 * `readCheckoutReference` undoes exactly that.
 */
export function checkoutReturnUrl(request: Request, path: string, reference: string): string {
  const url = new URL(path, requestOrigin(request));
  url.searchParams.set("checkout", "done");
  url.searchParams.set("reference", reference);
  return url.toString();
}

/**
 * The payment reference on a return URL, or null if this is not one.
 *
 * Understands Monnify (`paymentReference`), our own `reference`, and the older
 * gateways (`trxref`, `tx_ref`). Only a value of the exact shape we issue is
 * returned, so a hand-edited URL cannot make the page post arbitrary text.
 */
export function readCheckoutReference(search: string): string | null {
  const params = new URLSearchParams(search);
  // "done?paymentReference=…" is what a naive append makes of "done".
  if (!params.get("checkout")?.startsWith("done")) return null;

  for (const key of ["paymentReference", "reference", "trxref", "tx_ref"]) {
    for (const value of params.getAll(key)) {
      // Likewise "course_ab…?paymentReference=course_ab…".
      const candidate = value.split("?")[0].trim();
      if (isBillingReference(candidate)) return candidate;
    }
  }

  // The reference may only survive inside another parameter's mangled value.
  for (const value of params.values()) {
    const tail = /[?&](?:paymentReference|reference)=([^?&]+)/.exec(value)?.[1];
    if (tail && isBillingReference(tail)) return tail;
  }
  return null;
}
