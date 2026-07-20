"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";

type Status = "verifying" | "success" | "pending" | "error";

/**
 * Mount on a checkout redirect landing page. After a provider redirects back
 * (Paystack appends `reference`/`trxref`; Flutterwave appends `tx_ref`), this
 * posts the reference to `/api/billing/verify` so the purchase fulfills even if
 * the provider webhook is delayed or missed. On success it refreshes the page
 * and strips the query params so a manual refresh doesn't re-verify.
 *
 * Reads the query string from `window.location` (client-only) rather than
 * `useSearchParams`, so it needs no Suspense boundary. Self-contained (renders
 * its own banner) so it works in both the admin and student shells.
 */
export function CheckoutVerifier({ successMessage }: { successMessage?: string }) {
  const router = useRouter();
  const ran = useRef(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "done") return;

    const reference =
      params.get("reference") ?? params.get("trxref") ?? params.get("tx_ref");
    if (!reference) return;

    ran.current = true;

    void (async () => {
      setStatus("verifying");
      const res = await apiPost<{ status: string }>("/api/billing/verify", { reference });
      // Strip the checkout params so a manual refresh doesn't re-verify.
      window.history.replaceState(null, "", window.location.pathname);

      if (res.data?.status === "success") {
        setStatus("success");
        setMessage(successMessage ?? "Payment confirmed.");
        router.refresh();
      } else if (res.error) {
        setStatus("error");
        setMessage(res.error.message);
      } else {
        setStatus("pending");
        setMessage("Payment is still processing — refresh in a moment.");
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
      role="status"
      className={`mb-4 rounded-[10px] border-2 px-4 py-2.5 text-sm font-bold text-foreground shadow-sm ${tone}`}
    >
      {status === "verifying" ? "Confirming your payment…" : message}
    </div>
  );
}
