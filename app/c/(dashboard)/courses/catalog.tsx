"use client";

import { useState } from "react";
import Link from "next/link";
import { CourseEnrollButton } from "./enroll-button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { courseAccent, courseIcon } from "@/lib/ui/course-color";
import { countOf } from "../_lib/labels";

export type CatalogCourse = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  /** "Free" or "₦5,000" — formatted on the server in the academy's locale. */
  priceLabel: string;
  thumbnailUrl: string | null;
  lessonCount: number;
  enrollment: { progressPercent: number; completedAt: string | null } | null;
};

export function CourseCatalog({ courses }: { courses: CatalogCourse[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const list = courses.filter(
    (c) =>
      !query ||
      c.title.toLowerCase().includes(query) ||
      (c.description ?? "").toLowerCase().includes(query)
  );

  if (courses.length === 0) {
    return (
      <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
        <EmptyState icon="book" title="No courses yet">
          Courses will appear here as soon as your academy publishes them. Check back soon.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <div
        role="search"
        className="mb-2 flex h-11 max-w-sm items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 shadow-sm focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-ring"
      >
        <Icon name="search" aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search courses…"
          aria-label="Search courses"
          autoComplete="off"
          // The ring is drawn on the box around the icon and the field together.
          className="w-full min-w-0 border-0 bg-transparent p-0 text-[16px] font-medium text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {/* Says how many matched, so a filtered list is never mistaken for the whole one. */}
      <p className="mb-4 min-h-5 text-[13px] font-medium text-muted-foreground" aria-live="polite">
        {query ? `${countOf(list.length, "course")} matching “${q.trim()}”` : ""}
      </p>

      {list.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState
            icon="search"
            title="No courses match that search"
            action={
              <button
                type="button"
                onClick={() => setQ("")}
                className="min-h-9 rounded-[8px] px-2 text-[13px] font-bold underline decoration-primary decoration-2 underline-offset-2 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Show all courses
              </button>
            }
          >
            Try a shorter or different word.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((course) => {
            const enrolled = course.enrollment != null;
            const completed = course.enrollment?.completedAt != null;
            const paid = course.priceCents != null && course.priceCents > 0;
            const accent = courseAccent(course.id);
            return (
              <li key={course.id} className="min-w-0">
                <article
                  className="flex h-full flex-col rounded-[14px] border-2 border-border bg-card p-4 transition-transform duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5"
                  style={{ boxShadow: `6px 6px 0 ${accent}` }}
                >
                  {course.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted image of unknown size
                    <img
                      src={course.thumbnailUrl}
                      alt=""
                      width={640}
                      height={360}
                      loading="lazy"
                      decoding="async"
                      className="mb-3 aspect-video h-auto w-full rounded-[10px] border-2 border-border object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="mb-3 flex aspect-video items-center justify-center rounded-[10px] border-2 border-border text-foreground"
                      style={{ background: accent }}
                    >
                      <Icon name={courseIcon(course.id)} className="size-8" />
                    </div>
                  )}
                  <h2 className="font-heading text-[15px] leading-tight">
                    <Link
                      href={`/courses/${course.slug}`}
                      className="break-words rounded-[4px] outline-none hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {course.title}
                    </Link>
                  </h2>
                  {course.description ? (
                    <p className="mt-1 line-clamp-2 text-[13px] font-medium text-muted-foreground">
                      {course.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] font-bold text-muted-foreground">
                    <span>{countOf(course.lessonCount, "lesson")}</span>
                    {enrolled ? (
                      <Badge color={completed ? "var(--success)" : "var(--info)"}>
                        {completed ? "Completed" : "Enrolled"}
                      </Badge>
                    ) : (
                      <Badge color={paid ? "var(--warning)" : "var(--success)"}>{course.priceLabel}</Badge>
                    )}
                  </div>
                  {enrolled ? (
                    <div className="mt-3 flex items-center gap-2">
                      <ProgressBar
                        value={course.enrollment!.progressPercent}
                        color={accent}
                        size="sm"
                        className="flex-1"
                        label={`Progress in ${course.title}`}
                      />
                      <span className="num shrink-0 text-[12px] font-bold text-foreground">
                        {course.enrollment!.progressPercent}%
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-auto pt-4">
                    <div className="border-t-2 border-dashed border-border pt-4">
                      <CourseEnrollButton
                        slug={course.slug}
                        title={course.title}
                        priceCents={course.priceCents}
                        priceLabel={course.priceLabel}
                        enrolled={enrolled}
                      />
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
