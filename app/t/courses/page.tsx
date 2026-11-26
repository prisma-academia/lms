import type { Metadata } from "next";
import Link from "next/link";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { renderDesignedPage } from "@/lib/site/render-page";
import { loadTenantBranding } from "@/lib/site/metadata";
import { publicPageMetadata } from "@/lib/site/public-metadata";
import { listPublicCourses, listPublicProgrammes } from "@/lib/site/public-catalog";
import { plural } from "@/lib/site/public-format";
import { PublicFrame } from "@/components/public/public-frame";
import { PublicCourseCardView, PublicProgrammeCardView } from "@/components/public/catalogue-cards";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

/**
 * The academy's course catalogue, for anyone.
 *
 * Reached at `/courses` by a visitor who is not signed in (the proxy sends
 * signed-in learners to their own catalogue, which also shows their progress).
 * Server-rendered and usable without JavaScript: the search box is a plain GET
 * form.
 */
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = await loadTenantBranding();
  return publicPageMetadata({
    path: "/courses",
    title: "Courses",
    description: branding ? `Browse the courses and programmes at ${branding.name}.` : null,
  });
}

export default async function PublicCataloguePage({ searchParams }: Props) {
  const page = await requireExistingTenant();
  const tenantId = page.tenant!.id;
  const query = first((await searchParams).q).slice(0, 100);

  // The academy's own catalogue design, if it has published one.
  const designed = await renderDesignedPage({ tenantId, kind: "COURSES", next: "/courses", query });
  if (designed) return designed.element;

  const [branding, courses, programmes] = await Promise.all([
    loadTenantBranding(),
    listPublicCourses(tenantId, query),
    // Programmes are not searched; they are shown only on the unfiltered page.
    query ? Promise.resolve([]) : listPublicProgrammes(tenantId),
  ]);
  const locale = branding?.settings.locale;

  return (
    <PublicFrame tenantId={tenantId} next="/courses">
      <header className="mb-6">
        <h1 className="text-balance font-heading text-3xl leading-tight sm:text-4xl">Courses</h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {query
            ? `${plural(courses.length, "course")} matching “${query}”`
            : `${plural(courses.length, "course")} you can start today`}
        </p>
      </header>

      <form
        method="get"
        action="/courses"
        role="search"
        className="mb-6 flex max-w-xl flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="course-search" className="sr-only">
          Search courses
        </label>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 shadow-sm focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-ring">
          <Icon name="search" className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            id="course-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search courses…"
            autoComplete="off"
            className="w-full min-w-0 border-0 bg-transparent p-0 text-[16px] font-medium text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button type="submit" className="h-11 shrink-0">
          Search
        </Button>
        {query ? (
          <Button asChild variant="outline" className="h-11 shrink-0">
            <Link href="/courses">Clear</Link>
          </Button>
        ) : null}
      </form>

      {courses.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState
            icon={query ? "search" : "book"}
            title={query ? "No courses match that search" : "No courses yet"}
            action={
              query ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/courses">See all courses</Link>
                </Button>
              ) : undefined
            }
          >
            {query
              ? "Try a shorter or different word."
              : "Courses will appear here as soon as they are published. Check back soon."}
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <li key={course.id}>
              <PublicCourseCardView course={course} locale={locale} />
            </li>
          ))}
        </ul>
      )}

      {programmes.length > 0 ? (
        <section aria-labelledby="programmes-heading" className="mt-12">
          <h2 id="programmes-heading" className="font-heading text-2xl leading-tight">
            Programmes
          </h2>
          <p className="mt-1.5 text-sm font-medium text-muted-foreground">
            Several courses taken together, with one enrolment.
          </p>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {programmes.map((programme) => (
              <li key={programme.id}>
                <PublicProgrammeCardView programme={programme} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PublicFrame>
  );
}
