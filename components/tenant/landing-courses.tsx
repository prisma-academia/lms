import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import { excerpt, formatCoursePrice } from "@/lib/tenant/landing";
import { courseAccent, courseIcon } from "@/lib/ui/course-color";
import { SectionLabel } from "./section-label";

export type LandingCourse = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  thumbnailUrl: string | null;
  lessonCount: number;
};

export function LandingCourses({ courses }: { courses: LandingCourse[] }) {
  if (courses.length === 0) return null;

  return (
    <section id="courses" className="scroll-mt-24 border-t-2 border-ink bg-card">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="text-center">
          <SectionLabel>Our courses</SectionLabel>
          <h2 className="mt-4 font-heading text-3xl">Start learning today</h2>
          <p className="mx-auto mt-2 max-w-2xl font-medium text-ink/70">
            Explore our published courses. Create a free account to enroll and
            begin your journey.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            const accent = courseAccent(course.id);
            const desc = excerpt(course.description);
            return (
              <div
                key={course.id}
                className="flex h-full flex-col rounded-[14px] border-2 border-ink bg-paper p-4 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
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
                <h3 className="font-heading text-[15px] leading-tight">
                  {course.title}
                </h3>
                {desc ? (
                  <p className="mt-1 line-clamp-2 text-[13px] font-medium text-ink/60">
                    {desc}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-2 text-[12px] font-bold text-ink/60">
                  <span>
                    {course.lessonCount} lesson
                    {course.lessonCount === 1 ? "" : "s"}
                  </span>
                  <Badge
                    color={course.priceCents ? "var(--yellow)" : "var(--green)"}
                  >
                    {formatCoursePrice(course.priceCents, course.currency)}
                  </Badge>
                </div>
                <div className="mt-auto border-t-2 border-dashed border-ink/15 pt-4">
                  <Button className="w-full" asChild>
                    <Link href="/auth/register">Enroll now</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Button variant="outline" asChild>
            <Link href="/auth/register">
              Create account to enroll <Icon name="arrow-right" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
