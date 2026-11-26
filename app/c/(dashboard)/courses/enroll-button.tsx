"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { useApiError } from "@/components/use-api-error";

export function CourseEnrollButton({
  slug,
  priceCents,
  enrolled,
  title,
  priceLabel,
}: {
  slug: string;
  priceCents: number | null;
  enrolled: boolean;
  /** The course's name, so the button says which course to a screen reader. */
  title?: string;
  /** "₦5,000" — formatted on the server. Shown on the button for a paid course. */
  priceLabel?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const report = useApiError();

  const which = title ? <span className="sr-only">: {title}</span> : null;

  if (enrolled) {
    return (
      <Button asChild className="min-h-11 w-full sm:min-h-0 sm:w-auto">
        <Link href={`/courses/${slug}/learn`}>
          Continue learning
          {which}
        </Link>
      </Button>
    );
  }

  const paid = priceCents != null && priceCents > 0;
  const label = paid ? (priceLabel ? `Buy · ${priceLabel}` : "Buy this course") : "Enrol for free";

  async function handleEnroll() {
    setLoading(true);
    const res = await apiPost<{ checkoutUrl: string | null }>(
      `/api/client/courses/${slug}`,
      {}
    );
    if (res.data?.checkoutUrl && !res.error) {
      // Stay busy while the browser leaves for the payment page: a button that
      // springs back to "Buy" invites a second press and a second checkout.
      window.location.href = res.data.checkoutUrl;
      return;
    }
    setLoading(false);
    if (!report(res, () => handleEnroll())) return;
    router.push(`/courses/${slug}/learn`);
    router.refresh();
  }

  return (
    <Button
      onClick={handleEnroll}
      disabled={loading}
      className="min-h-11 w-full sm:min-h-0 sm:w-auto"
    >
      {loading ? (paid ? "Opening payment…" : "Enrolling…") : label}
      {which}
    </Button>
  );
}
