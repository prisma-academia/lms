import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { isUnlocked } from "@/lib/courses/gating";
import { requiredDwellSeconds, mediaWatched } from "@/lib/courses/content-gate";
import { recordLessonCompletion, recordLessonOpen } from "@/lib/courses/complete-lesson";

const Body = z.object({
  lessonId: z.string().min(1),
  // Plain enum with a default rather than a discriminated union: the old
  // `{ lessonId }` body keeps working, so client and server ship independently.
  action: z.enum(["open", "complete"]).default("complete"),
});

/** Small grace window so a client countdown that finishes a tick early doesn't 409. */
const DWELL_GRACE_SECONDS = 2;

async function loadCourseForLearner(tenantId: string, slug: string) {
  const course = await prisma.course.findFirst({
    where: { tenantId, slug, status: "PUBLISHED" },
    include: {
      lessons: {
        // sortOrder is not unique (defaults to 0) — the id tiebreak keeps this
        // order identical to lib/courses/gating.ts's orderLessons.
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          libraryItem: {
            select: {
              id: true,
              name: true,
              title: true,
              description: true,
              contentType: true,
              mediaKind: true,
              sizeBytes: true,
              key: true,
              durationSeconds: true,
              width: true,
              height: true,
              posterKey: true,
              peaksJson: true,
            },
          },
        },
      },
    },
  });
  if (!course) throw new DomainError(404, "not_found", "Course not found.");
  return course;
}

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const actor = await requireClientActor();
    const { slug } = await ctx.params;

    const course = await loadCourseForLearner(actor.tenantId, slug);

    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_clientId: { courseId: course.id, clientId: actor.clientId } },
      include: { lessonProgress: { select: { lessonId: true, startedAt: true, completedAt: true } } },
    });
    if (!enrollment) throw new DomainError(403, "not_enrolled", "You are not enrolled in this course.");

    // Completion is `completedAt != null`, NOT row presence — rows now exist for
    // merely-opened lessons too.
    const completed = new Set(
      enrollment.lessonProgress.filter((p) => p.completedAt != null).map((p) => p.lessonId)
    );
    const startedAtByLesson = new Map(
      enrollment.lessonProgress.map((p) => [p.lessonId, p.startedAt] as const)
    );

    // Saved playback positions, so a learner who watched yesterday can resume —
    // and so the client-side media gate credits what they already watched.
    const libraryItemIds = course.lessons
      .map((l) => l.libraryItemId)
      .filter((id): id is string => typeof id === "string");
    const playback = libraryItemIds.length
      ? await prisma.libraryProgress.findMany({
          where: { itemId: { in: libraryItemIds }, clientId: actor.clientId },
          select: { itemId: true, positionSeconds: true, completed: true },
        })
      : [];
    const playbackByItem = new Map(playback.map((p) => [p.itemId, p] as const));

    const lessons = course.lessons.map((l) => {
      // Via isUnlocked, not `index > frontier`: an already-completed lesson stays
      // accessible even when legacy out-of-order progress puts it past the frontier.
      const locked = !isUnlocked(course.lessons, completed, l.id);
      const base = {
        id: l.id,
        title: l.title,
        sortOrder: l.sortOrder,
        contentType: l.contentType,
        durationMin: l.durationMin,
        completed: completed.has(l.id),
        locked,
      };

      // A locked lesson must not ship its content. contentJson carries lesson
      // bodies, HTML and quizIds; assetUrl is a live S3 URL. Hiding these in the
      // UI alone would leave them one devtools tab away.
      if (locked) {
        return {
          ...base,
          contentJson: {},
          assetKey: null,
          libraryItemId: null,
          assetUrl: null,
          libraryItem: null,
          startedAt: null,
          requiredSeconds: 0,
          playbackProgress: null,
        };
      }

      const key = l.libraryItem?.key ?? l.assetKey;
      const assetUrl = key && s3Configured() ? publicUrlForKey(key) : null;
      const posterUrl =
        l.libraryItem?.posterKey && s3Configured() ? publicUrlForKey(l.libraryItem.posterKey) : null;
      const saved = l.libraryItemId ? playbackByItem.get(l.libraryItemId) : undefined;

      return {
        ...base,
        contentJson: l.contentJson,
        assetKey: l.assetKey,
        libraryItemId: l.libraryItemId,
        assetUrl,
        startedAt: startedAtByLesson.get(l.id)?.toISOString() ?? null,
        requiredSeconds: requiredDwellSeconds(l),
        playbackProgress: saved
          ? { positionSeconds: saved.positionSeconds, completed: saved.completed }
          : null,
        libraryItem: l.libraryItem
          ? {
              id: l.libraryItem.id,
              name: l.libraryItem.name,
              title: l.libraryItem.title,
              description: l.libraryItem.description,
              contentType: l.libraryItem.contentType,
              mediaKind: l.libraryItem.mediaKind,
              sizeBytes: Number(l.libraryItem.sizeBytes),
              durationSeconds: l.libraryItem.durationSeconds,
              width: l.libraryItem.width,
              height: l.libraryItem.height,
              peaks: Array.isArray(l.libraryItem.peaksJson)
                ? (l.libraryItem.peaksJson as number[])
                : null,
              posterUrl,
            }
          : null,
      };
    });

    return ok({
      course: { id: course.id, title: course.title, slug: course.slug },
      // Narrowed on purpose: the raw row carries the whole lessonProgress array.
      enrollment: {
        progressPercent: enrollment.progressPercent,
        completedAt: enrollment.completedAt,
      },
      lessons,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { slug } = await ctx.params;
    const { lessonId, action } = Body.parse(await request.json());

    const course = await loadCourseForLearner(actor.tenantId, slug);

    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_clientId: { courseId: course.id, clientId: actor.clientId } },
      include: { lessonProgress: { select: { lessonId: true, startedAt: true, completedAt: true } } },
    });
    if (!enrollment) throw new DomainError(403, "not_enrolled", "You are not enrolled in this course.");

    const lesson = course.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new DomainError(404, "not_found", "Lesson not found.");

    const completed = new Set(
      enrollment.lessonProgress.filter((p) => p.completedAt != null).map((p) => p.lessonId)
    );

    // Gate 1 — order. Applies to opening as well as completing, so a locked
    // lesson can't be "opened" to start its dwell clock early.
    if (!isUnlocked(course.lessons, completed, lessonId)) {
      throw new DomainError(409, "lesson_locked", "Finish the previous lesson first.");
    }

    if (action === "open") {
      const { startedAt } = await recordLessonOpen({
        tenantId: actor.tenantId,
        enrollmentId: enrollment.id,
        lessonId,
      });
      return ok({ startedAt, requiredSeconds: requiredDwellSeconds(lesson) });
    }

    // Already done — idempotent, and re-running the gates would be hostile to
    // anyone who completed this before the rules tightened.
    if (completed.has(lessonId)) {
      return ok({
        enrollment: {
          progressPercent: enrollment.progressPercent,
          completedAt: enrollment.completedAt,
        },
      });
    }

    await assertContentConsumed({
      tenantId: actor.tenantId,
      clientId: actor.clientId,
      enrollmentId: enrollment.id,
      lesson,
      startedAt: enrollment.lessonProgress.find((p) => p.lessonId === lessonId)?.startedAt ?? null,
    });

    const updated = await recordLessonCompletion({
      tenantId: actor.tenantId,
      clientId: actor.clientId,
      courseId: course.id,
      enrollment: { id: enrollment.id, completedAt: enrollment.completedAt },
      lessonId,
      totalLessons: course.lessons.length,
    });

    return ok({ enrollment: updated });
  } catch (e) {
    return handleError(e);
  }
}

type GateLesson = {
  id: string;
  contentType: string;
  contentJson: unknown;
  durationMin: number | null;
  requireDwell: boolean;
  libraryItemId: string | null;
  libraryItem: { durationSeconds: number | null } | null;
};

/**
 * The server half of the content gate.
 *
 * Only checks what it can actually verify: dwell (from `startedAt`, written by a
 * separate request), FILE media progress (from LibraryProgress, written by an
 * independent endpoint) and the quiz 100% rule (from QuizAttempt rows). Scroll
 * depth and raw VIDEO_URL playback are unverifiable server-side and are
 * therefore not checked here at all — see lib/courses/content-gate.ts.
 */
async function assertContentConsumed(params: {
  tenantId: string;
  clientId: string;
  enrollmentId: string;
  lesson: GateLesson;
  startedAt: Date | null;
}): Promise<void> {
  const { clientId, lesson, startedAt } = params;

  if (!startedAt) {
    throw new DomainError(409, "not_started", "Open the lesson before marking it complete.");
  }

  const required = requiredDwellSeconds({
    contentType: lesson.contentType as never,
    contentJson: lesson.contentJson,
    durationMin: lesson.durationMin,
    requireDwell: lesson.requireDwell,
  });
  const elapsed = (Date.now() - startedAt.getTime()) / 1000;
  if (elapsed + DWELL_GRACE_SECONDS < required) {
    throw new DomainError(409, "too_fast", "Spend a little more time with this lesson first.");
  }

  if (lesson.contentType === "QUIZ") {
    await assertQuizPassed(clientId, lesson.contentJson);
    return;
  }

  if (lesson.contentType === "FILE" && lesson.libraryItemId && lesson.libraryItem?.durationSeconds) {
    const saved = await prisma.libraryProgress.findUnique({
      where: { itemId_clientId: { itemId: lesson.libraryItemId, clientId } },
      select: { positionSeconds: true, completed: true },
    });
    const watched = saved
      ? mediaWatched(saved.positionSeconds, lesson.libraryItem.durationSeconds, saved.completed)
      : false;
    if (!watched) {
      throw new DomainError(409, "not_watched", "Watch to the end before marking this complete.");
    }
  }
}

/** A QUIZ lesson completes only once the learner has scored 100%. */
async function assertQuizPassed(clientId: string, contentJson: unknown): Promise<void> {
  const quizId = (contentJson as { quizId?: unknown } | null)?.quizId;
  if (typeof quizId !== "string" || !quizId) {
    throw new DomainError(
      409,
      "quiz_unconfigured",
      "This quiz isn't set up yet — ask your instructor."
    );
  }

  // "Ever scored 100%", not "latest attempt". Completion is monotonic
  // everywhere else in the app; making this gate non-monotonic would re-lock a
  // learner who retakes an already-passed quiz out of curiosity.
  //
  // gradingStatus GRADED is what closes the essay loophole: an attempt whose AI
  // grading failed is PENDING and scoreless, so provoking a grader outage
  // unlocks nothing.
  const perfect = await prisma.quizAttempt.findFirst({
    where: {
      quizId,
      clientId,
      submittedAt: { not: null },
      scorePercent: 100,
      gradingStatus: "GRADED",
    },
    select: { id: true },
  });
  if (!perfect) {
    throw new DomainError(409, "quiz_not_perfect", "Score 100% on this quiz to continue.");
  }
}
