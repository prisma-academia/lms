import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { requestOrigin } from "@/lib/site/metadata";
import { formatPrice, isPaid, plural } from "@/lib/site/public-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Icon } from "@/components/icon";
import { ShareDialog } from "@/components/share/share-dialog";
import { EnrollProgrammeButton } from "./enroll-programme-button";

/**
 * A programme, for a signed-in learner: what it bundles, where they stand in
 * each course, and the button to join.
 *
 * This is where a shared programme link lands once the visitor has signed in —
 * before this page existed there was a catalogue card and nothing behind it.
 */
export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const actor = await requireClientPage();
  const { slug } = await params;

  const programme = await prisma.programme.findFirst({
    where: { tenantId: actor.tenantId, slug, status: "PUBLISHED" },
    include: {
      courses: {
        where: { course: { status: "PUBLISHED" } },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          course: {
            select: {
              id: true,
              slug: true,
              title: true,
              description: true,
              _count: { select: { lessons: true } },
            },
          },
        },
      },
    },
  });
  if (!programme) notFound();

  const [membership, enrollments, tenant] = await Promise.all([
    prisma.programmeEnrollment.findUnique({
      where: { programmeId_clientId: { programmeId: programme.id, clientId: actor.clientId } },
      select: { id: true },
    }),
    prisma.enrollment.findMany({
      where: { clientId: actor.clientId, courseId: { in: programme.courses.map((pc) => pc.courseId) } },
      select: { courseId: true, progressPercent: true, completedAt: true },
    }),
    prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { settingsJson: true } }),
  ]);

  // A private programme is only for learners who are already in it. To anyone
  // else it does not exist — the same answer as a slug that was never used.
  if (programme.visibility !== "PUBLIC" && !membership) notFound();

  const locale = parseTenantSettings(tenant?.settingsJson).locale;
  const progress = new Map(enrollments.map((e) => [e.courseId, e] as const));
  const enrolledIn = programme.courses.filter((pc) => progress.has(pc.courseId)).length;
  const fullyEnrolled = programme.courses.length > 0 && enrolledIn >= programme.courses.length;
  const paid = isPaid(programme.priceCents);
  const priceLabel = formatPrice(programme.priceCents, programme.currency, locale);
  const canJoin = programme.visibility === "PUBLIC" && programme.courses.length > 0 && !fullyEnrolled;
  const shareUrl =
    programme.visibility === "PUBLIC"
      ? new URL(`/programmes/${programme.slug}`, await requestOrigin()).toString()
      : null;

  return (
    <div className="max-w-3xl">
      <Link
        href="/programmes"
        className="mb-4 inline-flex min-h-9 items-center gap-1.5 rounded-[8px] text-[13px] font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Icon name="arrow-left" className="size-4" aria-hidden /> Programmes
      </Link>

      <div className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold text-muted-foreground">
          <Badge color={paid ? "var(--warning)" : "var(--success)"}>{priceLabel}</Badge>
          <span>{plural(programme.courses.length, "course")}</span>
          {enrolledIn > 0 ? (
            <span>
              · enrolled in {enrolledIn} of {programme.courses.length}
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 font-heading text-2xl leading-tight">{programme.title}</h1>
        {programme.description ? (
          <p className="mt-3 whitespace-pre-line text-sm font-medium leading-relaxed text-foreground">
            {programme.description}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-border pt-5">
          {fullyEnrolled ? (
            <Badge color="var(--success)">You&rsquo;re enrolled in every course</Badge>
          ) : canJoin ? (
            <EnrollProgrammeButton
              slug={programme.slug}
              label={
                paid
                  ? `Buy · ${priceLabel}`
                  : enrolledIn > 0
                    ? "Enrol in the remaining courses"
                    : "Enrol in this programme"
              }
            />
          ) : (
            <p className="text-sm font-medium text-muted-foreground">
              {programme.courses.length === 0
                ? "The courses for this programme are still being prepared."
                : "Enrolment in this programme is arranged by your academy."}
            </p>
          )}
          {shareUrl ? <ShareDialog url={shareUrl} title={programme.title} kind="programme" /> : null}
        </div>
      </div>

      <h2 className="mb-3 mt-6 font-heading text-lg leading-tight">
        Courses in this programme
      </h2>
      {programme.courses.length === 0 ? (
        <p className="rounded-[14px] border-2 border-dashed border-border bg-card p-4 text-sm font-medium text-muted-foreground">
          No courses have been published in this programme yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {programme.courses.map((pc, index) => {
            const mine = progress.get(pc.courseId);
            return (
              <li
                key={pc.id}
                className="flex items-start gap-3 rounded-[14px] border-2 border-border bg-card p-4 shadow-md"
              >
                <span
                  aria-hidden
                  className={`num flex size-8 shrink-0 items-center justify-center rounded-[8px] border-2 border-border text-[13px] font-bold ${
                    mine?.completedAt
                      ? "bg-success text-success-foreground"
                      : "bg-background text-muted-foreground"
                  }`}
                >
                  {mine?.completedAt ? <Icon name="check" className="size-4" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="font-heading text-base leading-tight">{pc.course.title}</h3>
                    {pc.groupLabel ? <Badge>{pc.groupLabel}</Badge> : null}
                    {!pc.required ? <Badge color="var(--muted)">Optional</Badge> : null}
                  </div>
                  {pc.course.description ? (
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-muted-foreground">
                      {pc.course.description}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-[12px] font-bold text-muted-foreground">
                    {plural(pc.course._count.lessons, "lesson")}
                    {mine ? ` · ${mine.completedAt ? "completed" : `${mine.progressPercent}% done`}` : ""}
                  </p>
                  {mine && !mine.completedAt ? (
                    <ProgressBar
                      value={mine.progressPercent}
                      size="sm"
                      className="mt-2 max-w-xs"
                      label={`Progress in ${pc.course.title}`}
                    />
                  ) : null}
                </div>
                {mine ? (
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link href={`/courses/${pc.course.slug}/learn`}>
                      {mine.completedAt ? "Review" : "Continue"}
                      <span className="sr-only"> {pc.course.title}</span>
                    </Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
