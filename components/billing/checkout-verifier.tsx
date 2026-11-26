"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { readCheckoutReference } from "@/lib/billing/redirect";

type Status = "verifying" | "success" | "pending" | "error";

/** A slow bank transfer can take a little while to be reported. Ask a few times before giving up. */
const RETRY_DELAYS_MS = [3000, 6000, 12000];

/**
 * Mount on the page a customer lands on after paying.
 *
 * The gateway sends them back with the payment reference in the URL — Monnify
 * as `paymentReference`, and we add our own `reference` to the return address
 * so this never depends on a gateway's choice of name. The reference is posted
 * to `/api/billing/verify`, which confirms the payment with the gateway and
 * unlocks what was bought. That makes the purchase land even when the gateway's
 * own notification is late or lost.
 *
 * On success the page data is refreshed and the query string removed, so
 * reloading the page does not verify again.
 *
 * Reads `window.location` rather than `useSearchParams`, so it needs no
 * Suspense boundary. Renders its own banner, so it works in any shell.
 */
export function CheckoutVerifier({
  successMessage,
  onVerified,
}: {
  successMessage?: string;
  /**
   * Called once the payment is confirmed. For pages whose content is fetched in
   * the browser: `router.refresh()` re-runs server components and cannot reach
   * data a client component loaded for itself.
   */
  onVerified?: () => void;
}) {
  const router = useRouter();
  const ran = useRef(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Held in a ref so a parent passing a fresh callback each render does not
  // restart the effect — the verification must run exactly once per landing.
  const onVerifiedRef = useRef(onVerified);
  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  // Whether the component is still on the page when a reply comes back. A ref
  // fed by its own effect, not a flag in the effect below: in development React
  // mounts, unmounts and remounts once, and a flag cleared by that first
  // unmount would silence the one request that is allowed to run.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (ran.current) return;
    const reference = readCheckoutReference(window.location.search);
    if (!reference) return;
    ran.current = true;

    // Remove the checkout params once there is an answer, so a later reload
    // does not verify again. Not before: reloading while the check is still
    // running should simply run it again — it is idempotent — rather than
    // leave the customer with no check at all.
    const clearParams = () => window.history.replaceState(null, "", window.location.pathname);

    void (async () => {
      setStatus("verifying");

      for (let attempt = 0; ; attempt++) {
        const res = await apiPost<{ status: string }>("/api/billing/verify", { reference });
        if (!mounted.current) return;

        if (res.data?.status === "success") {
          clearParams();
          setStatus("success");
          setMessage(successMessage ?? "Payment confirmed.");
          onVerifiedRef.current?.();
          router.refresh();
          return;
        }
        // Offline, or the server or gateway hiccuped: worth another try. Any
        // other error is an answer ("unknown reference", "amount does not
        // match") and asking again will not change it.
        const transient = res.error != null && (res.status === 0 || (res.status ?? 0) >= 500);
        if (res.error && !transient) {
          clearParams();
          setStatus("error");
          setMessage(res.error.message);
          return;
        }

        const wait = RETRY_DELAYS_MS[attempt];
        if (wait === undefined) {
          if (res.error) {
            // Params are left in place: reloading the page tries again.
            setStatus("error");
            setMessage(`${res.error.message} Reload this page to check your payment again.`);
            return;
          }
          clearParams();
          setStatus("pending");
          setMessage(
            "We have not received confirmation of your payment yet. If you completed it, it will be applied automatically — check back in a few minutes."
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (!mounted.current) return;
      }
    })();
  }, [router, successMessage]);

  if (!status) return null;

  const tone =
    status === "success"
      ? "border-success bg-success/15"
      : status === "error"
        ? "border-destructive bg-destructive/10"
        : "border-border bg-muted";

  return (
    <div
      role={status === "error" ? "alert" : "status"}
      className={`mb-4 rounded-[10px] border-2 px-4 py-2.5 text-sm font-bold text-foreground shadow-sm ${tone}`}
    >
      {status === "verifying" ? "Confirming your payment…" : message}
    </div>
  );
}
