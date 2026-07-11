"use client";

import { useState } from "react";
import Link from "next/link";
import { CourseEnrollButton } from "./enroll-button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { courseAccent, courseIcon } from "@/lib/ui/course-color";

export type CatalogCourse = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  thumbnailUrl: string | null;
  lessonCount: number;
  enrollment: { progressPercent: number; completedAt: string | null } | null;
};

function formatPrice(cents: number | null, currency: string): string {
  if (cents == null || cents === 0) return "Free";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function CourseCatalog({ courses }: { courses: CatalogCourse[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const list = courses.filter(
    (c) =>
      !query ||
      c.title.toLowerCase().includes(query) ||
      (c.description ?? "").toLowerCase().includes(query)
  );

  return (
    <div>
      <div className="mb-5 flex h-11 max-w-sm items-center gap-2 rounded-[10px] border-2 border-ink bg-card px-3 shadow-brutal-sm focus-within:-translate-x-px focus-within:-translate-y-px focus-within:shadow-brutal">
        <Icon name="search" className="size-4 text-ink/50" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search courses"
          aria-label="Search courses"
          className="w-full border-0 bg-transparent p-0 text-[16px] font-medium text-ink outline-none placeholder:text-ink/35"
        />
      </div>

      {list.length === 0 ? (
        <div className="rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal">
          <EmptyState icon="search" title="No matches">
            {courses.length === 0
              ? "No courses are available yet. Check back soon."
              : "Try a different search term."}
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((course) => {
            const enrolled = course.enrollment != null;
            const accent = courseAccent(course.id);
            return (
              <div
                key={course.id}
                className="flex h-full flex-col rounded-[14px] border-2 border-ink bg-card p-4 transition-transform duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5"
                style={{ boxShadow: `6px 6px 0 ${accent}` }}
              >
                {course.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={course.thumbnailUrl}
                    alt=""
                    className="mb-3 aspect-video w-full rounded-[10px] border-2 border-ink object-cover"
                  />
                ) : (
                  <div
                    className="mb-3 flex aspect-video items-center justify-center rounded-[10px] border-2 border-ink text-ink"
                    style={{ background: accent }}
                  >
                    <Icon name={courseIcon(course.id)} className="size-8" />
                  </div>
                )}
                <Link
                  href={`/courses/${course.slug}`}
                  className="font-heading text-[15px] leading-tight hover:underline"
                >
                  {course.title}
                </Link>
                {course.description ? (
                  <p className="mt-1 line-clamp-2 text-[13px] font-medium text-ink/60">
                    {course.description}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-2 text-[12px] font-bold text-ink/60">
                  <span>{course.lessonCount} lessons</span>
                  <Badge color={course.priceCents ? "var(--yellow)" : "var(--green)"}>
                    {formatPrice(course.priceCents, course.currency)}
                  </Badge>
                </div>
                {enrolled ? (
                  <div className="mt-3">
                    <ProgressBar
                      value={course.enrollment!.progressPercent}
                      color={accent}
                      size="sm"
                    />
                  </div>
                ) : null}
                <div className="mt-auto border-t-2 border-dashed border-ink/15 pt-4">
                  <CourseEnrollButton
                    slug={course.slug}
                    priceCents={course.priceCents}
                    enrolled={enrolled}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
