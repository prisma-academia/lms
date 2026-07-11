import { DAY, type SeedContext } from "../index";
import { NG_LOCALE } from "../components/locale/ng";
import {
  COURSE_CATALOG,
  flatLessons,
  type CourseSeed,
  type LessonGroupSeed,
} from "../components/catalogs/courses";
import type { LessonSeed } from "../components/factories/lesson";

async function createLessons(
  ctx: SeedContext,
  courseId: string,
  lessons: LessonSeed[],
  startOrder: number,
  groupId?: string
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i];
    const contentType = l.contentType ?? "TEXT";
    const contentJson =
      contentType === "QUIZ" && l.quizId
        ? ({ quizId: l.quizId } as object)
        : ({ body: l.body } as object);

    const lesson = await ctx.prisma.lesson.create({
      data: {
        tenantId: ctx.tenantId,
        courseId,
        groupId: groupId ?? null,
        title: l.title,
        sortOrder: startOrder + i,
        contentType,
        contentJson,
        durationMin: l.durationMin,
      },
    });
    ids.push(lesson.id);
  }
  return ids;
}

async function seedCourseGroups(
  ctx: SeedContext,
  courseId: string,
  groups: LessonGroupSeed[]
): Promise<string[]> {
  const allIds: string[] = [];
  let sortOrder = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const group = await ctx.prisma.lessonGroup.create({
      data: {
        tenantId: ctx.tenantId,
        courseId,
        title: g.title,
        sortOrder: gi,
      },
    });
    const ids = await createLessons(ctx, courseId, g.lessons, sortOrder, group.id);
    allIds.push(...ids);
    sortOrder += g.lessons.length;
  }
  return allIds;
}

async function seedOneCourse(ctx: SeedContext, c: CourseSeed): Promise<void> {
  const course = await ctx.prisma.course.create({
    data: {
      tenantId: ctx.tenantId,
      title: c.title,
      slug: c.slug,
      description: c.description,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      priceCents: 0,
      currency: NG_LOCALE.currency,
      instructorId: ctx.ids.instructorId,
      publishedAt: new Date(ctx.now - 30 * DAY),
    },
  });

  let lessonIds: string[];
  if (c.groups) {
    lessonIds = await seedCourseGroups(ctx, course.id, c.groups);
  } else if (c.lessons) {
    lessonIds = await createLessons(ctx, course.id, c.lessons, 0);
  } else {
    lessonIds = [];
  }

  ctx.ids.courseBySlug[c.slug] = { courseId: course.id, lessonIds };
}

export async function seedCourses(ctx: SeedContext): Promise<void> {
  for (const c of COURSE_CATALOG) {
    await seedOneCourse(ctx, c);
  }
}

export function getCourseSeed(slug: string): CourseSeed | undefined {
  return COURSE_CATALOG.find((c) => c.slug === slug);
}

export { flatLessons };
