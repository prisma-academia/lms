import { prisma } from "@/lib/db/client";
import { runWithContext } from "@/lib/db/tenant-context";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";

/**
 * What a signed-out visitor may see of an academy's courses and programmes.
 *
 * One rule decides visibility everywhere in this file: PUBLISHED and PUBLIC.
 * A draft, an archived item, a private one and one that does not exist are all
 * the same thing to a visitor — nothing — and no function here distinguishes
 * them, so no caller can leak the difference by accident.
 *
 * Every query names the academy twice: an explicit `tenantId` in the filter,
 * inside an explicit tenant context. The database guard would otherwise fall
 * back to whatever session cookie the visitor carries, and a platform
 * administrator's cookie is valid on every academy's host and means "all
 * academies". A public page must never depend on who happens to be looking.
 *
 * Nothing here returns a lesson's content. An outline is titles, kinds and
 * durations — enough to decide whether to enrol, nothing that the course sells.
 */

const VISIBLE = { status: "PUBLISHED", visibility: "PUBLIC" } as const;

/** Longest slug worth sending to the database. Real ones are far shorter. */
const MAX_SLUG = 200;

function inPublicContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(runWithContext({ mode: "tenant-client", tenantId }, fn));
}

function thumbnailUrl(key: string | null): string | null {
  return key && s3Configured() ? publicUrlForKey(key) : null;
}

function usableSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG;
}

export type PublicCourseCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  thumbnailUrl: string | null;
  lessonCount: number;
};

export type PublicProgrammeCard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  thumbnailUrl: string | null;
  courseCount: number;
};

export async function listPublicCourses(
  tenantId: string,
  search?: string | null
): Promise<PublicCourseCard[]> {
  const q = (search ?? "").trim().slice(0, 100);
  return inPublicContext(tenantId, async () => {
    const rows = await prisma.course.findMany({
      where: {
        tenantId,
        ...VISIBLE,
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { description: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 120,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        thumbnailKey: true,
        _count: { select: { lessons: true } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      priceCents: c.priceCents,
      currency: c.currency,
      thumbnailUrl: thumbnailUrl(c.thumbnailKey),
      lessonCount: c._count.lessons,
    }));
  });
}

export async function listPublicProgrammes(tenantId: string): Promise<PublicProgrammeCard[]> {
  return inPublicContext(tenantId, async () => {
    const rows = await prisma.programme.findMany({
      where: { tenantId, ...VISIBLE },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 60,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        thumbnailKey: true,
        // Only courses a learner would actually be enrolled into count.
        courses: { where: { course: { status: "PUBLISHED" } }, select: { id: true } },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      priceCents: p.priceCents,
      currency: p.currency,
      thumbnailUrl: thumbnailUrl(p.thumbnailKey),
      courseCount: p.courses.length,
    }));
  });
}

/** What kind of thing a lesson is, in the words a visitor would use. */
const LESSON_KIND: Record<string, string> = {
  TEXT: "Reading",
  HTML: "Reading",
  VIDEO_URL: "Video",
  FILE: "File",
  QUIZ: "Quiz",
};

export type PublicOutlineLesson = {
  id: string;
  title: string;
  kind: string;
  durationMin: number | null;
};

export type PublicOutlineModule = {
  /** Null for lessons that sit outside any module. */
  title: string | null;
  lessons: PublicOutlineLesson[];
};

export type PublicCourse = PublicCourseCard & {
  instructorName: string | null;
  totalDurationMin: number;
  modules: PublicOutlineModule[];
};

export async function getPublicCourse(tenantId: string, slug: string): Promise<PublicCourse | null> {
  if (!usableSlug(slug)) return null;
  return inPublicContext(tenantId, async () => {
    const course = await prisma.course.findFirst({
      where: { tenantId, slug, ...VISIBLE },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        thumbnailKey: true,
        instructorId: true,
        lessonGroups: { select: { id: true, title: true, parentId: true } },
        // The same order the learner's player uses, so the outline a visitor
        // reads is the course they will actually take.
        lessons: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true, title: true, contentType: true, durationMin: true, groupId: true },
        },
      },
    });
    if (!course) return null;

    const instructor = course.instructorId
      ? await prisma.tenantUser.findFirst({
          where: { tenantId, id: course.instructorId, status: "ACTIVE" },
          select: { firstName: true, lastName: true },
        })
      : null;
    // A name only. A staff email on a public page is an invitation to spam.
    const instructorName = instructor
      ? [instructor.firstName, instructor.lastName].filter(Boolean).join(" ").trim() || null
      : null;

    const groups = new Map(course.lessonGroups.map((g) => [g.id, g] as const));
    const groupTitle = (id: string | null): string | null => {
      if (!id) return null;
      const group = groups.get(id);
      if (!group) return null;
      const parent = group.parentId ? groups.get(group.parentId) : null;
      return parent ? `${parent.title} — ${group.title}` : group.title;
    };

    // Lessons are already in course order; start a new module whenever the
    // lesson's group changes. Grouping by id instead would pull lessons out of
    // the order they are taken in.
    const modules: PublicOutlineModule[] = [];
    let currentGroup: string | null | undefined;
    for (const lesson of course.lessons) {
      if (modules.length === 0 || lesson.groupId !== currentGroup) {
        currentGroup = lesson.groupId;
        modules.push({ title: groupTitle(lesson.groupId), lessons: [] });
      }
      modules[modules.length - 1].lessons.push({
        id: lesson.id,
        title: lesson.title,
        kind: LESSON_KIND[lesson.contentType] ?? "Lesson",
        durationMin: lesson.durationMin,
      });
    }

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      priceCents: course.priceCents,
      currency: course.currency,
      thumbnailUrl: thumbnailUrl(course.thumbnailKey),
      lessonCount: course.lessons.length,
      instructorName,
      totalDurationMin: course.lessons.reduce((sum, l) => sum + (l.durationMin ?? 0), 0),
      modules,
    };
  });
}

export type PublicProgrammeCourse = {
  id: string;
  title: string;
  description: string | null;
  lessonCount: number;
  required: boolean;
  groupLabel: string | null;
  /** Set only when the course has a public page of its own to link to. */
  publicSlug: string | null;
};

export type PublicProgramme = PublicProgrammeCard & {
  courses: PublicProgrammeCourse[];
};

export async function getPublicProgramme(
  tenantId: string,
  slug: string
): Promise<PublicProgramme | null> {
  if (!usableSlug(slug)) return null;
  return inPublicContext(tenantId, async () => {
    const programme = await prisma.programme.findFirst({
      where: { tenantId, slug, ...VISIBLE },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        thumbnailKey: true,
        courses: {
          where: { course: { status: "PUBLISHED" } },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            required: true,
            groupLabel: true,
            course: {
              select: {
                id: true,
                slug: true,
                title: true,
                description: true,
                visibility: true,
                _count: { select: { lessons: true } },
              },
            },
          },
        },
      },
    });
    if (!programme) return null;

    return {
      id: programme.id,
      slug: programme.slug,
      title: programme.title,
      description: programme.description,
      priceCents: programme.priceCents,
      currency: programme.currency,
      thumbnailUrl: thumbnailUrl(programme.thumbnailKey),
      courseCount: programme.courses.length,
      courses: programme.courses.map((pc) => ({
        id: pc.course.id,
        title: pc.course.title,
        description: pc.course.description,
        lessonCount: pc.course._count.lessons,
        required: pc.required,
        groupLabel: pc.groupLabel,
        // A private course inside a public programme is named (it is part of
        // what is being offered) but has no page of its own to send people to.
        publicSlug: pc.course.visibility === "PUBLIC" ? pc.course.slug : null,
      })),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* The proxy's question: is there anything public at this address?             */
/* -------------------------------------------------------------------------- */

type TenantHit = { id: string; active: boolean };

/** Host → academy barely changes; remembering it briefly saves a query per visit. */
const TENANT_TTL_MS = 30_000;
const tenantCache = new Map<string, { hit: TenantHit | null; at: number }>();

async function tenantBySlug(tenantSlug: string): Promise<TenantHit | null> {
  const cached = tenantCache.get(tenantSlug);
  if (cached && Date.now() - cached.at < TENANT_TTL_MS) return cached.hit;

  const row = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, status: true },
  });
  const hit = row ? { id: row.id, active: row.status === "ACTIVE" } : null;
  tenantCache.delete(tenantSlug); // re-insert so the newest entry is last
  tenantCache.set(tenantSlug, { hit, at: Date.now() });
  // A host name is visitor input; do not let made-up ones grow this forever.
  if (tenantCache.size > 500) {
    const oldest = tenantCache.keys().next().value;
    if (oldest !== undefined) tenantCache.delete(oldest);
  }
  return hit;
}

const EXISTS_TIMEOUT_MS = 2500;

/**
 * Whether a public course or programme exists at this slug — asked by the proxy
 * before any page renders, because that is the only point at which the response
 * can still be given a real 404 status.
 *
 * Three answers. `true` and `false` are verdicts. `null` means "could not tell"
 * (the academy is unknown or suspended, the database was slow or down): the
 * proxy then lets the page through and the page decides, so a database hiccup
 * degrades to the old behaviour instead of turning every course into a 404.
 */
export async function publicItemExists(
  tenantSlug: string,
  kind: "course" | "programme",
  slug: string
): Promise<boolean | null> {
  if (!usableSlug(slug)) return false;

  const lookup = async (): Promise<boolean | null> => {
    const tenant = await tenantBySlug(tenantSlug);
    if (!tenant || !tenant.active) return null;
    const tenantId = tenant.id;
    return inPublicContext(tenantId, async () => {
      const where = { tenantId, slug, ...VISIBLE };
      const row =
        kind === "course"
          ? await prisma.course.findFirst({ where, select: { id: true } })
          : await prisma.programme.findFirst({ where, select: { id: true } });
      return row != null;
    });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), EXISTS_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
