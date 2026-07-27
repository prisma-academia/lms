import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { Spinner } from "@/components/spinner";
import { LearnPlayer } from "./learn-player";

export default async function CourseLearnPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const actor = await requireClientPage();
  const { slug } = await params;

  const course = await prisma.course.findFirst({
    where: { tenantId: actor.tenantId, slug, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!course) redirect("/courses");

  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_clientId: { courseId: course.id, clientId: actor.clientId } },
  });
  if (!enrollment) redirect(`/courses/${slug}`);

  // Suspense boundary: LearnPlayer reads ?lesson= via useSearchParams.
  return (
    <Suspense fallback={<Spinner label="Loading course…" />}>
      <LearnPlayer slug={slug} />
    </Suspense>
  );
}
