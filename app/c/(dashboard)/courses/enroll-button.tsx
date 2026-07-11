"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    const res = await apiPost<{ checkoutUrl: string | null }>(
      `/api/client/courses/${slug}`,
      {}
    );
    setLoading(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
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
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
