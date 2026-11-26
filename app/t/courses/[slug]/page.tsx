import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { renderDesignedPage } from "@/lib/site/render-page";
import { loadTenantBranding, requestOrigin } from "@/lib/site/metadata";
import { publicPageMetadata, UNLISTED_METADATA } from "@/lib/site/public-metadata";
import { getPublicCourse } from "@/lib/site/public-catalog";
import { formatDuration, formatPrice, isPaid, plural } from "@/lib/site/public-format";
import { PublicFrame } from "@/components/public/public-frame";
import { JoinPanel } from "@/components/public/join-panel";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import { courseAccent, courseIcon } from "@/lib/ui/course-color";

/**
 * One course, for anyone with the link.
 *
 * This is what a shared course link opens for someone without an account: what
 * the course is, what it covers lesson by lesson, what it costs, and how to get
 * in. It shows titles, never lesson content.
 *
 * The proxy has normally already answered "is there a public course here?"
 * before this renders, and sent a real 404 if not. The same rule is applied
 * again below — `getPublicCourse` returns null for a missing, draft or private
 * course alike — so this page is safe on its own if the proxy's check could not
 * run.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await requireExistingTenant();
  const course = await getPublicCourse(page.tenant!.id, slug);
  if (!course) return UNLISTED_METADATA;
  return publicPageMetadata({
    path: `/courses/${course.slug}`,
    title: course.title,
    description: course.description,
    imageUrl: course.thumbnailUrl,
  });
}

export default async function PublicCoursePage({ params }: Props) {
  const { slug } = await params;
  const page = await requireExistingTenant();
  const tenantId = page.tenant!.id;

  const course = await getPublicCourse(tenantId, slug);
  if (!course) notFound();

  // The academy's own course-page design, if it has published one. The rule
  // for WHICH courses are public is unchanged: it was applied just above.
  const designed = await renderDesignedPage({
    tenantId,
    kind: "COURSE_DETAIL",
    next: `/courses/${course.slug}`,
    course,
  });
  if (designed) return designed.element;

  const [branding, origin] = await Promise.all([loadTenantBranding(), requestOrigin()]);
  const path = `/courses/${course.slug}`;
  const accent = courseAccent(course.id);
  const paid = isPaid(course.priceCents);
  const priceLabel = formatPrice(course.priceCents, course.currency, branding?.settings.locale);
  const duration = formatDuration(course.totalDurationMin);
  const quizCount = course.modules
    .flatMap((m) => m.lessons)
    .filter((l) => l.kind === "Quiz").length;

  const facts = [
    plural(course.lessonCount, "lesson"),
    duration ? `About ${duration}` : null,
    quizCount > 0 ? plural(quizCount, "quiz", "quizzes") : null,
    "Learn at your own pace",
  ].filter((fact): fact is string => Boolean(fact));

  // Lessons are numbered through the whole course, not per module, so "lesson 7"
  // means the same thing here as it does in the player. `firstNumber[i]` is the
  // number of module i's first lesson.
  const firstNumber = course.modules.map((_, index) =>
    course.modules.slice(0, index).reduce((sum, m) => sum + m.lessons.length, 1)
  );

  return (
    <PublicFrame tenantId={tenantId} next={path}>
      <Link
        href="/courses"
        className="mb-5 inline-flex min-h-9 items-center gap-1.5 rounded-[8px] text-[13px] font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Icon name="arrow-left" className="size-4" aria-hidden /> All courses
      </Link>

      {/* On a phone the join panel sits straight after the title rather than
          under the whole outline: `contents` lets the header, the panel and the
          sections share one column there and be put in that order. From lg up
          the wrapper is an ordinary block again and the panel is the second
          column. The markup order is unchanged. */}
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
        <div className="contents lg:block lg:min-w-0">
          <header className="order-1 min-w-0">
            {course.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted image of unknown size
              <img
                src={course.thumbnailUrl}
                alt=""
                className="mb-5 aspect-video w-full rounded-[14px] border-2 border-border object-cover"
                style={{ boxShadow: `6px 6px 0 ${accent}` }}
              />
            ) : (
              <div
                aria-hidden
                className="mb-5 flex h-28 items-center justify-center rounded-[14px] border-2 border-border text-foreground sm:h-36"
                style={{ background: accent }}
              >
                <Icon name={courseIcon(course.id)} className="size-10" />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Badge color={paid ? "var(--warning)" : "var(--success)"}>{priceLabel}</Badge>
              <span className="text-[12px] font-bold text-muted-foreground">
                {plural(course.lessonCount, "lesson")}
                {duration ? ` · about ${duration}` : ""}
              </span>
            </div>
            <h1 className="mt-3 text-balance break-words font-heading text-3xl leading-tight sm:text-4xl">
              {course.title}
            </h1>
            {course.instructorName ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Icon name="user" className="size-4" aria-hidden />
                Taught by <span className="font-bold text-foreground">{course.instructorName}</span>
              </p>
            ) : null}
          </header>

          {course.description ? (
            <section aria-labelledby="about-heading" className="order-3 min-w-0 lg:mt-7">
              <h2 id="about-heading" className="font-heading text-xl leading-tight">
                About this course
              </h2>
              {/* Plain text from the course settings: keep the author's line
                  breaks, render nothing as markup. */}
              <p className="mt-2 max-w-[68ch] whitespace-pre-line text-base font-medium leading-relaxed text-foreground">
                {course.description}
              </p>
            </section>
          ) : null}

          <section aria-labelledby="outline-heading" className="order-3 min-w-0 lg:mt-8">
            <h2 id="outline-heading" className="font-heading text-xl leading-tight">
              What you&rsquo;ll cover
            </h2>

            {course.lessonCount === 0 ? (
              <p className="mt-3 rounded-[14px] border-2 border-dashed border-border bg-card p-4 text-sm font-medium text-muted-foreground">
                The lessons for this course are still being prepared.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-4">
                {course.modules.map((module, moduleIndex) => (
                  <div
                    key={`${moduleIndex}-${module.title ?? "lessons"}`}
                    className="rounded-[14px] border-2 border-border bg-card shadow-md"
                  >
                    {module.title ? (
                      <h3 className="flex items-baseline justify-between gap-3 border-b-2 border-border px-4 py-3 font-heading text-base leading-tight">
                        <span className="min-w-0">{module.title}</span>
                        <span className="num shrink-0 text-[12px] font-bold text-muted-foreground">
                          {plural(module.lessons.length, "lesson")}
                        </span>
                      </h3>
                    ) : null}
                    <ol className="divide-y-2 divide-dashed divide-border px-4">
                      {module.lessons.map((lesson, lessonIndex) => (
                        <li key={lesson.id} className="flex items-center gap-3 py-3 text-sm">
                          <span
                            aria-hidden
                            className="num flex size-7 shrink-0 items-center justify-center rounded-[8px] border-2 border-border bg-background text-[12px] font-bold text-muted-foreground"
                          >
                            {firstNumber[moduleIndex] + lessonIndex}
                          </span>
                          <span className="min-w-0 flex-1 font-medium text-foreground">
                            {lesson.title}
                          </span>
                          <span className="shrink-0 text-[12px] font-bold text-muted-foreground">
                            {lesson.kind}
                            {lesson.durationMin != null ? ` · ${lesson.durationMin} min` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <JoinPanel
          className="order-2 lg:order-none"
          path={path}
          kind="course"
          title={course.title}
          priceLabel={priceLabel}
          paid={paid}
          shareUrl={new URL(path, origin).toString()}
          facts={facts}
        />
      </div>
    </PublicFrame>
  );
}
