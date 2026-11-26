"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPost } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { countOf } from "../_lib/labels";

export type CatalogProgramme = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  /** "Free" or "₦5,000" — formatted on the server in the academy's locale. */
  priceLabel: string;
  totalCourses: number;
  enrolledCourses: number;
};

export function ProgrammesCatalog({ programmes }: { programmes: CatalogProgramme[] }) {
  const { toast, celebrate } = useToast();
  const report = useApiError();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [state, setState] = useState(programmes);

  async function enroll(p: CatalogProgramme) {
    setPendingSlug(p.slug);
    const res = await apiPost<{ enrolledCourses?: number; checkoutUrl?: string | null }>(
      `/api/client/programmes/${p.slug}/enroll`,
      {}
    );
    if (res.error) {
      setPendingSlug(null);
      report(res, () => enroll(p));
      return;
    }
    // Paid programme — redirect to the provider checkout.
    if (res.data?.checkoutUrl) {
      window.location.assign(res.data.checkoutUrl);
      return;
    }
    setPendingSlug(null);
    celebrate();
    const count = res.data?.enrolledCourses ?? 0;
    toast(`You're enrolled in ${countOf(count, "course")}.`);
    setState((prev) =>
      prev.map((x) => (x.slug === p.slug ? { ...x, enrolledCourses: x.totalCourses } : x))
    );
  }

  if (state.length === 0) {
    return (
      <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
        <EmptyState
          icon="book"
          title="No programmes yet"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/courses">Browse courses</Link>
            </Button>
          }
        >
          A programme is several courses taken together. Yours will appear here when the academy
          publishes one.
        </EmptyState>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {state.map((p) => {
        const fullyEnrolled = p.totalCourses > 0 && p.enrolledCourses >= p.totalCourses;
        const paid = p.priceCents != null && p.priceCents > 0;
        const pending = pendingSlug === p.slug;
        return (
          <li key={p.id} className="min-w-0">
            <article className="flex h-full flex-col rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 font-heading text-lg leading-tight">
                  <Link
                    href={`/programmes/${p.slug}`}
                    className="break-words rounded-[4px] outline-none hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {p.title}
                  </Link>
                </h2>
                <Badge color={paid ? "var(--warning)" : "var(--success)"}>{p.priceLabel}</Badge>
              </div>
              {p.description ? (
                <p className="mt-2 line-clamp-3 text-sm font-medium text-muted-foreground">{p.description}</p>
              ) : null}
              <p className="mt-2 text-xs font-bold text-muted-foreground">
                {countOf(p.totalCourses, "course")}
                {p.enrolledCourses > 0 && !fullyEnrolled ? ` · you're in ${p.enrolledCourses} of them` : ""}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                {fullyEnrolled ? (
                  <>
                    <Badge color="var(--success)">Enrolled</Badge>
                    <Button asChild variant="outline" className="min-h-11 sm:min-h-0">
                      <Link href={`/programmes/${p.slug}`}>
                        View courses<span className="sr-only"> in {p.title}</span>
                      </Link>
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    onClick={() => enroll(p)}
                    disabled={pending}
                    className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                  >
                    {pending
                      ? paid
                        ? "Opening payment…"
                        : "Enrolling…"
                      : paid
                        ? `Buy · ${p.priceLabel}`
                        : "Enrol for free"}
                    <span className="sr-only">: {p.title}</span>
                  </Button>
                )}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
