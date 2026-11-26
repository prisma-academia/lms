import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { renderDesignedPage } from "@/lib/site/render-page";
import { loadTenantBranding, requestOrigin } from "@/lib/site/metadata";
import { publicPageMetadata, UNLISTED_METADATA } from "@/lib/site/public-metadata";
import { getPublicProgramme } from "@/lib/site/public-catalog";
import { formatPrice, isPaid, plural } from "@/lib/site/public-format";
import { PublicFrame } from "@/components/public/public-frame";
import { JoinPanel } from "@/components/public/join-panel";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";

/**
 * One programme, for anyone with the link: what it is, which courses it bundles,
 * what it costs, and how to get in. See the course page for how missing, draft
 * and private items are kept indistinguishable.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await requireExistingTenant();
  const programme = await getPublicProgramme(page.tenant!.id, slug);
  if (!programme) return UNLISTED_METADATA;
  return publicPageMetadata({
    path: `/programmes/${programme.slug}`,
    title: programme.title,
    description: programme.description,
    imageUrl: programme.thumbnailUrl,
  });
}

export default async function PublicProgrammePage({ params }: Props) {
  const { slug } = await params;
  const page = await requireExistingTenant();
  const tenantId = page.tenant!.id;

  const programme = await getPublicProgramme(tenantId, slug);
  if (!programme) notFound();

  // The academy's own programme-page design, if it has published one.
  const designed = await renderDesignedPage({
    tenantId,
    kind: "PROGRAMME_DETAIL",
    next: `/programmes/${programme.slug}`,
    programme,
  });
  if (designed) return designed.element;

  const [branding, origin] = await Promise.all([loadTenantBranding(), requestOrigin()]);
  const path = `/programmes/${programme.slug}`;
  const paid = isPaid(programme.priceCents);
  const priceLabel = formatPrice(programme.priceCents, programme.currency, branding?.settings.locale);
  const lessonTotal = programme.courses.reduce((sum, c) => sum + c.lessonCount, 0);
  const optional = programme.courses.filter((c) => !c.required).length;

  const facts = [
    plural(programme.courseCount, "course"),
    lessonTotal > 0 ? plural(lessonTotal, "lesson") : null,
    "One enrolment covers every course",
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <PublicFrame tenantId={tenantId} next={path}>
      <Link
        href="/programmes"
        className="mb-5 inline-flex min-h-9 items-center gap-1.5 rounded-[8px] text-[13px] font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Icon name="arrow-left" className="size-4" aria-hidden /> All programmes
      </Link>

      {/* On a phone the join panel sits straight after the title rather than
          under the whole outline: `contents` lets the header, the panel and the
          sections share one column there and be put in that order. From lg up
          the wrapper is an ordinary block again and the panel is the second
          column. The markup order is unchanged. */}
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
        <div className="contents lg:block lg:min-w-0">
          <header className="order-1 min-w-0">
            {programme.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted image of unknown size
              <img
                src={programme.thumbnailUrl}
                alt=""
                className="mb-5 aspect-video w-full rounded-[14px] border-2 border-border object-cover shadow-md"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="var(--info)">Programme</Badge>
              <Badge color={paid ? "var(--warning)" : "var(--success)"}>{priceLabel}</Badge>
              <span className="text-[12px] font-bold text-muted-foreground">
                {plural(programme.courseCount, "course")}
              </span>
            </div>
            <h1 className="mt-3 text-balance break-words font-heading text-3xl leading-tight sm:text-4xl">
              {programme.title}
            </h1>
          </header>

          {programme.description ? (
            <section aria-labelledby="about-heading" className="order-3 min-w-0 lg:mt-7">
              <h2 id="about-heading" className="font-heading text-xl leading-tight">
                About this programme
              </h2>
              <p className="mt-2 max-w-[68ch] whitespace-pre-line text-base font-medium leading-relaxed text-foreground">
                {programme.description}
              </p>
            </section>
          ) : null}

          <section aria-labelledby="courses-heading" className="order-3 min-w-0 lg:mt-8">
            <h2 id="courses-heading" className="font-heading text-xl leading-tight">
              Courses in this programme
            </h2>
            {optional > 0 ? (
              <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                {plural(programme.courseCount - optional, "course")} required,{" "}
                {plural(optional, "optional course")}.
              </p>
            ) : null}

            {programme.courses.length === 0 ? (
              <p className="mt-3 rounded-[14px] border-2 border-dashed border-border bg-card p-4 text-sm font-medium text-muted-foreground">
                The courses for this programme are still being prepared.
              </p>
            ) : (
              <ol className="mt-3 flex flex-col gap-3">
                {programme.courses.map((course, index) => (
                  <li
                    key={course.id}
                    className="flex items-start gap-3 rounded-[14px] border-2 border-border bg-card p-4 shadow-md"
                  >
                    <span
                      aria-hidden
                      className="num flex size-8 shrink-0 items-center justify-center rounded-[8px] border-2 border-border bg-background text-[13px] font-bold text-muted-foreground"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="font-heading text-base leading-tight">
                          {course.publicSlug ? (
                            <Link
                              href={`/courses/${course.publicSlug}`}
                              className="rounded-[4px] underline decoration-primary decoration-2 underline-offset-4 outline-none hover:decoration-wavy focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {course.title}
                            </Link>
                          ) : (
                            course.title
                          )}
                        </h3>
                        {course.groupLabel ? <Badge>{course.groupLabel}</Badge> : null}
                        {!course.required ? <Badge color="var(--muted)">Optional</Badge> : null}
                      </div>
                      {course.description ? (
                        <p className="mt-1 line-clamp-2 text-sm font-medium text-muted-foreground">
                          {course.description}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-[12px] font-bold text-muted-foreground">
                        {plural(course.lessonCount, "lesson")}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <JoinPanel
          className="order-2 lg:order-none"
          path={path}
          kind="programme"
          title={programme.title}
          priceLabel={priceLabel}
          paid={paid}
          shareUrl={new URL(path, origin).toString()}
          facts={facts}
        />
      </div>
    </PublicFrame>
  );
}
