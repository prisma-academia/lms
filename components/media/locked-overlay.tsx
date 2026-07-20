"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import type { MediaPayload } from "./types";

function money(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  return `${currency ?? ""} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`.trim();
}

/**
 * Shown instead of a player when the learner cannot open the item.
 *
 * Two distinct states, because the remedies are different: a paid item they
 * could buy gets a price and a checkout button; one they were simply never
 * assigned gets told to ask, since there is nothing they can do themselves.
 */
export function LockedOverlay({ payload, thumbUrl }: { payload: MediaPayload; thumbUrl?: string | null }) {
  const { item, access } = payload;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = access.state === "locked-paid";

  async function buy() {
    setBusy(true);
    setError(null);
    const res = await apiPost<{ checkoutUrl: string }>(`/api/client/library/${item.id}/checkout`, {});
    if (res.error || !res.data) {
      setBusy(false);
      setError(res.error?.message ?? "Could not start checkout.");
      return;
    }
    window.location.href = res.data.checkoutUrl;
  }

  return (
    <div className="relative overflow-hidden rounded-[14px] border-2 border-border bg-muted">
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl} alt="" className="aspect-video w-full scale-105 object-cover blur-md" />
      ) : (
        <div className="aspect-video w-full" />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 p-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-white/70">
          <Icon name="lock" className="size-6 text-white" />
        </span>

        {paid ? (
          <>
            <p className="font-heading text-lg text-white">
              {money(access.priceCents, access.currency) || "Locked"}
            </p>
            <p className="max-w-sm text-sm text-white/80">
              Buy once to keep access to {item.title || item.name}.
            </p>
            <Button type="button" onClick={buy} disabled={busy}>
              {busy ? "Starting checkout…" : `Unlock for ${money(access.priceCents, access.currency)}`}
            </Button>
            {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}
          </>
        ) : (
          <>
            <p className="font-heading text-lg text-white">Not available to you</p>
            <p className="max-w-sm text-sm text-white/80">
              Ask your instructor to share this with you or your group.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
