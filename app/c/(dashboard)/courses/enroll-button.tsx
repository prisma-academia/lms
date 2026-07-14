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
}: {
  slug: string;
  priceCents: number | null;
  enrolled: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const report = useApiError();

  if (enrolled) {
    return (
      <Button asChild size="sm">
        <Link href={`/courses/${slug}/learn`}>Continue learning</Link>
      </Button>
    );
  }

  const paid = priceCents != null && priceCents > 0;
  const label = paid ? "Buy" : "Enroll";

  async function handleEnroll() {
    setLoading(true);
    const res = await apiPost<{ checkoutUrl: string | null }>(
      `/api/client/courses/${slug}`,
      {}
    );
    setLoading(false);
    if (!report(res, () => handleEnroll())) return;
    if (res.data?.checkoutUrl) {
      window.location.href = res.data.checkoutUrl;
      return;
    }
    router.push(`/courses/${slug}/learn`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" onClick={handleEnroll} disabled={loading}>
        {loading ? "Please wait…" : label}
      </Button>
    </div>
  );
}
