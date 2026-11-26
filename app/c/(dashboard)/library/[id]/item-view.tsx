"use client";

import { useState } from "react";
import { CheckoutVerifier } from "@/components/billing/checkout-verifier";
import { MediaDetail } from "./media-detail";

/**
 * The item, plus the confirmation of a purchase the learner has just returned
 * from.
 *
 * A paid item sends the learner to the payment page and back here. Until now
 * nothing on this page confirmed that payment, so the item stayed locked until
 * the gateway's own notification happened to arrive — and showed no sign of
 * whether it ever would.
 *
 * `MediaDetail` loads the item itself, in the browser, so refreshing server
 * components does not reach it. Changing its key once the payment is confirmed
 * makes it load again, this time unlocked.
 */
export function LibraryItemView({ id }: { id: string }) {
  const [unlockedAt, setUnlockedAt] = useState(0);

  return (
    <>
      <CheckoutVerifier
        successMessage="Payment confirmed — this item is yours."
        onVerified={() => setUnlockedAt((n) => n + 1)}
      />
      <MediaDetail key={unlockedAt} id={id} />
    </>
  );
}
