import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { DomainError } from "@/lib/api/errors";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/courses/{id} — the course with its lesson outline (no lesson content). */
export const GET = apiRoute<{ id: string }>({ scope: "courses:read" }, async (ctx) => {
  const course = await prisma.course.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId } });
  if (!course) throw new DomainError(404, "not_found", "Course not found.");
  const [sections, lessons] = await Promise.all([
    prisma.lessonGroup.findMany({
      where: { tenantId: ctx.tenantId, courseId: course.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, parentId: true, sortOrder: true },
    }),
    prisma.lesson.findMany({
      where: { tenantId: ctx.tenantId, courseId: course.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, sortOrder: true, contentType: true, durationMin: true, groupId: true },
    }),
  ]);
  return {
    data: {
      ...out.course(course),
      outline: {
        sections,
        lessons: lessons.map((l) => ({ id: l.id, title: l.title, sortOrder: l.sortOrder, contentType: l.contentType, durationMin: l.durationMin, sectionId: l.groupId })),
      },
    },
  };
});
