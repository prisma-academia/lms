"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export type CatalogProgramme = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  totalCourses: number;
  enrolledCourses: number;
};

function formatPrice(cents: number | null, currency: string): string {
  if (cents == null || cents === 0) return "Free";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

export function ProgrammesCatalog({ programmes }: { programmes: CatalogProgramme[] }) {
  const { toast, celebrate } = useToast();
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [state, setState] = useState(programmes);

  async function enroll(p: CatalogProgramme) {
    setPendingSlug(p.slug);
    const res = await apiPost<{ enrolledCourses: number }>(
      `/api/client/programmes/${p.slug}/enroll`,
      {}
    );
    setPendingSlug(null);
    if (res.error) {
      toast(res.error.message);
      return;
    }
    celebrate();
    toast(`Enrolled in ${res.data!.enrolledCourses} course(s).`);
    setState((prev) =>
      prev.map((x) => (x.slug === p.slug ? { ...x, enrolledCourses: x.totalCourses } : x))
    );
  }

  if (state.length === 0) {
    return (
      <div className="rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal">
        <EmptyState icon="book" title="No programmes yet">
          No programmes are available yet. Check back soon.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {state.map((p) => {
        const fullyEnrolled = p.totalCourses > 0 && p.enrolledCourses >= p.totalCourses;
        return (
          <div key={p.id} className="flex flex-col rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-heading text-lg leading-tight">{p.title}</h3>
              <Badge>{formatPrice(p.priceCents, p.currency)}</Badge>
            </div>
            {p.description ? (
              <p className="mt-2 line-clamp-3 text-sm text-ink/70">{p.description}</p>
            ) : null}
            <p className="mt-2 text-xs font-bold text-ink/60">
              {p.totalCourses} course{p.totalCourses === 1 ? "" : "s"}
              {p.enrolledCourses > 0 ? ` · enrolled in ${p.enrolledCourses}` : ""}
            </p>
            <div className="mt-auto pt-3">
              {fullyEnrolled ? (
                <Badge>Enrolled</Badge>
              ) : (
                <Button
                  type="button"
                  onClick={() => enroll(p)}
                  disabled={pendingSlug === p.slug}
                >
                  {pendingSlug === p.slug ? "Enrolling…" : "Enroll"}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
