"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";

/**
 * Enrol in (or buy) a programme from its own page. The same request the
 * catalogue card makes: a free programme enrols at once, a paid one hands over
 * to the payment page.
 */
export function EnrollProgrammeButton({
  slug,
  label,
}: {
  slug: string;
  /** "Enrol" or "Buy · ₦5,000" — decided on the server, where the price is formatted. */
  label: string;
}) {
  const router = useRouter();
  const { toast, celebrate } = useToast();
  const report = useApiError();
  const [working, setWorking] = useState(false);

  async function enroll() {
    setWorking(true);
    const res = await apiPost<{ enrolledCourses?: number; checkoutUrl?: string | null }>(
      `/api/client/programmes/${slug}/enroll`,
      {}
    );
    if (res.error) {
      setWorking(false);
      report(res, () => enroll());
      return;
    }
    // Paid: leave the button busy while the browser goes to the payment page.
    if (res.data?.checkoutUrl) {
      window.location.assign(res.data.checkoutUrl);
      return;
    }
    setWorking(false);
    celebrate();
    const count = res.data?.enrolledCourses ?? 0;
    toast(`You're enrolled in ${count} ${count === 1 ? "course" : "courses"}.`);
    router.refresh();
  }

  return (
    <Button type="button" size="lg" onClick={enroll} disabled={working}>
      {working ? "Please wait…" : label}
    </Button>
  );
}
