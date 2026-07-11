import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
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

  return <LearnPlayer slug={slug} />;
}
