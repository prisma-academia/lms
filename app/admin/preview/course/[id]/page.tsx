import { notFound } from "next/navigation";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { orderLessons } from "@/lib/courses/gating";
import { requiredDwellSeconds } from "@/lib/courses/content-gate";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { PreviewBanner } from "@/components/preview-banner";
import { CoursePreview, type PreviewLesson } from "@/components/course/course-preview";

/**
 * A course as a learner meets it, viewable by an admin who is not enrolled.
 *
 * Why not just look at `/courses/<slug>/learn`? That route needs a CLIENT
 * session and an Enrollment row, so an admin cannot open it at all — checking a
 * course today means creating a throwaway learner and enrolling them. This
 * renders the same lesson bodies through the same content components, with the
 * gating state shown rather than enforced: the point is to inspect what has been
 * built, not to simulate progressing through it.
 */
export const dynamic = "force-dynamic";

export default async function CoursePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_COURSES_READ.key);
  const { id } = await params;
  const { lesson: lessonParam } = await searchParams;

  const course = await prisma.course.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: {
      lessons: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          libraryItem: {
            select: {
              id: true,
              name: true,
              contentType: true,
              mediaKind: true,
              key: true,
              durationSeconds: true,
              posterKey: true,
            },
          },
        },
      },
      lessonGroups: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true } },
    },
  });
  if (!course) notFound();

  const groupTitles = new Map(course.lessonGroups.map((g) => [g.id, g.title]));

  const lessons: PreviewLesson[] = orderLessons(course.lessons).map((l) => ({
    id: l.id,
    title: l.title,
    contentType: l.contentType,
    contentJson: (l.contentJson ?? {}) as Record<string, unknown>,
    durationMin: l.durationMin,
    groupTitle: l.groupId ? groupTitles.get(l.groupId) ?? null : null,
    // Shown as information, not enforced — an admin previewing a course should
    // be able to open lesson 9 without completing the eight before it.
    requiredSeconds: requiredDwellSeconds(l),
    requireDwell: l.requireDwell,
    assetUrl:
      l.libraryItem?.key && s3Configured() ? publicUrlForKey(l.libraryItem.key) : null,
    mediaKind: l.libraryItem?.mediaKind ?? null,
    fileName: l.libraryItem?.name ?? null,
  }));

  const selected =
    lessons.find((l) => l.id === lessonParam)?.id ?? lessons[0]?.id ?? null;

  return (
    <>
      <PreviewBanner
        label={
          course.status === "PUBLISHED"
            ? "Learner preview — this course is published"
            : `Learner preview — this course is ${course.status.toLowerCase()} and learners cannot see it yet`
        }
        tone={course.status === "PUBLISHED" ? "info" : "warning"}
      />
      <CoursePreview
        courseId={course.id}
        courseTitle={course.title}
        courseDescription={course.description}
        lessons={lessons}
        selectedId={selected}
      />
    </>
  );
}
