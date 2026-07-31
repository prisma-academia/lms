"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconName } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { QuizPlayer } from "./quiz-player";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import { MediaViewer, mediaRendersInline } from "@/components/media/media-viewer";
import type { MediaPayload } from "@/components/media/types";
import { resolveMediaKind } from "@/lib/media/kind";
import type { MediaKind } from "@/lib/generated/prisma/enums";
import { useContentGate, type ContentGate } from "@/components/lesson/use-content-gate";
import type { GateContentType } from "@/lib/courses/content-gate";

type LearnLesson = {
  id: string;
  title: string;
  sortOrder: number;
  contentType: GateContentType;
  contentJson: Record<string, unknown>;
  assetUrl: string | null;
  durationMin: number | null;
  completed: boolean;
  /** Server-decided: earlier lessons aren't finished yet. Content is redacted. */
  locked: boolean;
  startedAt: string | null;
  requiredSeconds: number;
  playbackProgress: { positionSeconds: number; completed: boolean } | null;
  libraryItem: {
    id: string;
    name: string;
    title: string | null;
    description: string | null;
    contentType: string;
    mediaKind: string;
    sizeBytes: number;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    peaks: number[] | null;
    posterUrl: string | null;
  } | null;
};

type LearnPayload = {
  course: { id: string; title: string; slug: string };
  enrollment: { progressPercent: number; completedAt: string | null };
  lessons: LearnLesson[];
};

/** Icon + human label per content type, so a lesson's shape is legible before opening it. */
const TYPE_META: Record<GateContentType, { icon: IconName; label: string }> = {
  TEXT: { icon: "book", label: "Reading" },
  HTML: { icon: "book", label: "Reading" },
  VIDEO_URL: { icon: "video", label: "Video" },
  FILE: { icon: "file", label: "File" },
  QUIZ: { icon: "clipboard", label: "Quiz" },
};

function lessonBody(lesson: LearnLesson): string | null {
  const json = lesson.contentJson;
  for (const key of ["body", "html", "text", "content"] as const) {
    const v = json[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function renderLessonBody(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.875em] text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * The kind this lesson's asset will actually render as, repairing items whose
 * stored mediaKind is OTHER because the upload had a generic Content-Type.
 */
function resolvedKind(lesson: LearnLesson): MediaKind | null {
  const item = lesson.libraryItem;
  if (!item) return null;
  return resolveMediaKind(item);
}

/**
 * True when a FILE lesson renders through a real viewer.
 *
 * Deliberately not "has a libraryItem": an item that falls through to the
 * download card has nothing to play, page or scroll, so treating it as a
 * viewer would disable the scroll gate and leave the lesson with no way at all
 * to satisfy `consumed` — a permanently un-completable lesson.
 */
function hasInlineViewer(lesson: LearnLesson): boolean {
  if (lesson.contentType !== "FILE" || !lesson.libraryItem || !lesson.assetUrl) return false;
  return mediaRendersInline(lesson.libraryItem);
}

function isTimedMedia(lesson: LearnLesson): boolean {
  if (lesson.contentType === "VIDEO_URL") return true;
  const kind = resolvedKind(lesson);
  return hasInlineViewer(lesson) && (kind === "VIDEO" || kind === "AUDIO");
}

function isPagedMedia(lesson: LearnLesson): boolean {
  return hasInlineViewer(lesson) && resolvedKind(lesson) === "PDF";
}

/**
 * One-line status used in the lesson list. Visible text rather than a bare
 * colour/icon, so completion and locking survive greyscale, low vision and
 * screen readers without a parallel sr-only string to keep in sync.
 */
function statusLabel(lesson: LearnLesson): string | null {
  if (lesson.completed) return "Completed";
  if (lesson.locked) return "Locked";
  if (lesson.startedAt) return "In progress";
  return null;
}

function metaLine(lesson: LearnLesson): string {
  return [statusLabel(lesson), TYPE_META[lesson.contentType].label, lesson.durationMin != null ? `${lesson.durationMin} min` : null]
    .filter(Boolean)
    .join(" · ");
}

function LessonContent({
  lesson,
  gate,
  onViewerUnavailable,
}: {
  lesson: LearnLesson;
  gate: ContentGate;
  onViewerUnavailable: () => void;
}) {
  if (lesson.contentType === "QUIZ") {
    const quizId = typeof lesson.contentJson.quizId === "string" ? lesson.contentJson.quizId : null;
    if (quizId) return <QuizPlayer quizId={quizId} onPerfect={gate.reportQuizPerfect} />;
    return <p className="text-sm font-medium text-muted-foreground">This quiz is not configured yet.</p>;
  }

  if (lesson.contentType === "HTML") {
    const html =
      typeof lesson.contentJson.html === "string" && lesson.contentJson.html.trim()
        ? lesson.contentJson.html
        : null;
    if (html) {
      return (
        <div
          className="lesson-html max-w-[68ch] text-base font-medium leading-relaxed text-foreground [&_a]:font-bold [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_h2]:mt-5 [&_h2]:font-heading [&_h2]:text-lg [&_h3]:mt-4 [&_h3]:font-heading [&_h3]:text-base [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mt-3 [&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-[10px] [&_pre]:border-2 [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3 [&_table]:mt-3 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
      );
    }
  }

  if (lesson.contentType === "VIDEO_URL") {
    const url = typeof lesson.contentJson.url === "string" ? lesson.contentJson.url : null;
    if (url) {
      return (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="w-full rounded-[10px] border-2 border-border bg-black"
          onTimeUpdate={(e) => {
            const total = e.currentTarget.duration || 0;
            if (total > 0) gate.reportMedia(e.currentTarget.currentTime / total);
          }}
          onEnded={() => gate.reportMedia(1)}
        />
      );
    }
  }

  if (lesson.contentType === "FILE" && lesson.assetUrl) {
    if (lesson.libraryItem) {
      const payload: MediaPayload = {
        item: {
          id: lesson.libraryItem.id,
          name: lesson.libraryItem.name,
          title: lesson.libraryItem.title,
          description: lesson.libraryItem.description,
          contentType: lesson.libraryItem.contentType,
          // Resolved so a generically-typed upload still opens in a real viewer.
          mediaKind: resolveMediaKind(lesson.libraryItem) as MediaKind,
          sizeBytes: lesson.libraryItem.sizeBytes,
          durationSeconds: lesson.libraryItem.durationSeconds,
          width: lesson.libraryItem.width,
          height: lesson.libraryItem.height,
          peaks: lesson.libraryItem.peaks,
          tags: [],
          folder: null,
          isFree: true,
          priceCents: null,
          currency: null,
          createdAt: new Date().toISOString(),
        },
        access: { state: "open", canDownload: true },
        playbackUrl: lesson.assetUrl,
        posterUrl: lesson.libraryItem.posterUrl,
        // Saved position, so the player can offer a resume instead of restarting.
        progress: lesson.playbackProgress,
      };
      return (
        <MediaViewer
          payload={payload}
          thumbUrl={lesson.libraryItem.posterUrl}
          onWatchedFraction={gate.reportMedia}
          onPageChange={gate.reportPage}
          // Text files have no playhead and no pages; reaching the last line is
          // the equivalent signal.
          onReachedEnd={() => gate.reportMedia(1)}
          onUnavailable={onViewerUnavailable}
        />
      );
    }
    return (
      <a
        href={lesson.assetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border-2 border-border bg-card px-4 py-2.5 text-sm font-bold shadow-sm outline-none [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-x-px active:translate-y-px active:shadow-none"
      >
        <Icon name="file" className="size-4" /> Open lesson file
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }

  const body = lessonBody(lesson);
  if (body) {
    return (
      <div className="max-w-[68ch] whitespace-pre-wrap text-base font-medium leading-relaxed text-foreground">
        {renderLessonBody(body)}
      </div>
    );
  }

  return <p className="text-sm font-medium text-muted-foreground">No content for this lesson.</p>;
}

function LessonList({
  lessons,
  selectedId,
  onPick,
  idPrefix,
}: {
  lessons: LearnLesson[];
  selectedId: string | null;
  onPick: (lesson: LearnLesson) => void;
  idPrefix: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  // Up/Down walks the list without 8 tab stops to get to lesson 8. Home/End
  // jump to the ends. Every row stays tabbable, so this only adds a shortcut —
  // it never takes the standard Tab path away.
  function onKeyDown(e: React.KeyboardEvent<HTMLOListElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-lesson-row]") ?? []
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    e.preventDefault();
    const nextIndex =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : e.key === "ArrowDown"
            ? Math.min(items.length - 1, current + 1)
            : Math.max(0, current - 1);
    items[nextIndex]?.focus();
  }

  return (
    <ol ref={listRef} onKeyDown={onKeyDown} className="flex flex-col">
      {lessons.map((lesson, i) => {
        const active = selectedId === lesson.id;
        const meta = metaLine(lesson);
        return (
          <li key={lesson.id}>
            <button
              type="button"
              data-lesson-row
              onClick={() => onPick(lesson)}
              // aria-disabled, not disabled: a locked lesson stays focusable so a
              // keyboard or screen-reader user can reach it and hear *why* it is
              // locked. `disabled` would hide that reason entirely.
              aria-disabled={lesson.locked || undefined}
              aria-current={active ? "step" : undefined}
              id={`${idPrefix}-${lesson.id}`}
              className={cn(
                "group/row flex w-full min-h-[56px] items-center gap-3 px-3 py-3 text-left outline-none [touch-action:manipulation] transition-colors",
                "focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring",
                i > 0 && "border-t-2 border-dashed border-border",
                lesson.locked
                  ? "cursor-not-allowed text-muted-foreground"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "num flex size-7 shrink-0 items-center justify-center rounded-[8px] border-2 border-border text-[11px] font-bold",
                  lesson.completed
                    ? "bg-success text-success-foreground"
                    : active
                      ? "bg-card text-card-foreground"
                      : "bg-card text-muted-foreground"
                )}
              >
                {lesson.completed ? (
                  <Icon name="check" className="size-3.5" />
                ) : lesson.locked ? (
                  <Icon name="lock" className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    active || lesson.completed ? "font-bold" : "font-medium"
                  )}
                >
                  {lesson.title}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-[11px] font-bold uppercase tracking-wide",
                    // On hover the row paints with --accent; muted-foreground on
                    // that background drops below 4.5:1, so follow the row.
                    active
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground group-hover/row:text-accent-foreground"
                  )}
                >
                  {meta}
                </span>
              </span>
              {active ? (
                <Icon name="chevron-right" aria-hidden className="size-4 shrink-0" />
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function LearnPlayer({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast, celebrate } = useToast();
  const report = useApiError();
  const [data, setData] = useState<LearnPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  /**
   * Lessons whose viewer reported it cannot render the asset. A "read to the
   * last page" gate is unsatisfiable when the reader never starts, so those
   * lessons fall back to the dwell gate rather than becoming un-completable.
   */
  const [unreadableLessons, setUnreadableLessons] = useState<Set<string>>(new Set());

  const uid = useId();
  const hintId = `${uid}-gate-hint`;
  const positionId = `${uid}-position`;
  const lockedNextId = `${uid}-locked-next`;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);

  // Deep link (?lesson=) is honoured once, on first load. After that the URL
  // follows the selection rather than driving it.
  const initialLessonId = useRef(searchParams.get("lesson"));

  /**
   * Speak a one-off message. Written straight to the DOM rather than held in
   * state: the dwell hint re-renders every second, and a live region driven by
   * render would re-announce on every tick.
   */
  const announce = useCallback((message: string) => {
    const el = liveRef.current;
    if (!el) return;
    el.textContent = "";
    window.setTimeout(() => {
      if (liveRef.current) liveRef.current.textContent = message;
    }, 60);
  }, []);

  const load = useCallback(async () => {
    const res = await apiGet<LearnPayload>(`/api/client/courses/${slug}/learn`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (!res.data) {
      setError("Could not load course.");
      return;
    }
    const payload = res.data;
    setError(null);
    setData(payload);
    setSelectedId((prev) => {
      const wanted = prev ?? initialLessonId.current;
      const target = wanted ? payload.lessons.find((l) => l.id === wanted) : undefined;
      // Fall back to the frontier when the requested lesson is locked or gone —
      // a stale bookmark shouldn't strand the learner on an empty screen.
      if (target && !target.locked) return target.id;
      const firstIncomplete = payload.lessons.find((l) => !l.completed && !l.locked);
      return firstIncomplete?.id ?? payload.lessons.find((l) => !l.locked)?.id ?? null;
    });
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state only after await, not synchronously
    void load();
  }, [load]);

  const lessons = data?.lessons ?? [];
  const selected = lessons.find((l) => l.id === selectedId) ?? lessons[0];
  const selectedIndex = lessons.findIndex((l) => l.id === selected?.id);

  // Keep the URL in step so refresh, back/forward and shared links all land on
  // the same lesson. replaceState rather than router.replace: this is pure
  // client state and doesn't warrant a server round-trip.
  useEffect(() => {
    if (!selected) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("lesson") === selected.id) return;
    url.searchParams.set("lesson", selected.id);
    window.history.replaceState(null, "", url);
  }, [selected]);

  // Start the dwell clock. Fire-and-forget: a failed open just leaves the button
  // gated, which is the safe outcome.
  const openedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selected || selected.locked || selected.startedAt) return;
    if (openedRef.current.has(selected.id)) return;
    openedRef.current.add(selected.id);

    const lessonId = selected.id;
    void apiPost<{ startedAt: string | null; requiredSeconds: number }>(
      `/api/client/courses/${slug}/learn`,
      { lessonId, action: "open" }
    ).then((res) => {
      if (!res.data) return;
      const startedAt = res.data.startedAt;
      setData((prev) =>
        prev
          ? {
              ...prev,
              lessons: prev.lessons.map((l) => (l.id === lessonId ? { ...l, startedAt } : l)),
            }
          : prev
      );
    });
  }, [selected, slug]);

  const gate = useContentGate({
    lessonId: selected?.id ?? "",
    contentType: selected?.contentType ?? "TEXT",
    requiredSeconds: selected?.requiredSeconds ?? 0,
    startedAt: selected?.startedAt ?? null,
    hasViewer: selected ? hasInlineViewer(selected) && !unreadableLessons.has(selected.id) : false,
    isTimedMedia: selected ? isTimedMedia(selected) && !unreadableLessons.has(selected.id) : false,
    isPaged: selected ? isPagedMedia(selected) && !unreadableLessons.has(selected.id) : false,
    initialMediaFraction:
      selected?.playbackProgress && selected.libraryItem?.durationSeconds
        ? selected.playbackProgress.completed
          ? 1
          : selected.playbackProgress.positionSeconds / selected.libraryItem.durationSeconds
        : 0,
    alreadyComplete: selected?.completed ?? false,
  });

  // Moving between lessons swaps the whole main pane. Without a focus move a
  // screen-reader user is left at the bottom of the *previous* lesson with no
  // signal anything changed; sighted keyboard users lose their place too.
  const currentLessonId = selected?.id ?? null;
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!currentLessonId) return;
    headingRef.current?.focus();
  }, [currentLessonId]);

  // Announce only the *transition* to unlocked, never the per-second countdown.
  const wasSatisfied = useRef(true);
  useEffect(() => {
    if (!currentLessonId) return;
    if (gate.satisfied && !wasSatisfied.current) {
      announce("You can now mark this lesson complete.");
    }
    wasSatisfied.current = gate.satisfied;
  }, [gate.satisfied, currentLessonId, announce]);

  const completedCount = lessons.filter((l) => l.completed).length;

  const pick = useCallback(
    (lesson: LearnLesson) => {
      if (lesson.locked) {
        // A locked row is reachable on purpose; explain rather than swallow the press.
        const message = "That lesson is locked. Finish the lessons before it to open it.";
        announce(message);
        toast(message);
        return;
      }
      setSelectedId(lesson.id);
      setListOpen(false);
    },
    [announce, toast]
  );

  /**
   * Complete the lesson and, when there is somewhere to go, move on in the same
   * press. One button carries both because they were never really two decisions
   * — "I'm done here" and "take me onward" are the same intent.
   */
  async function completeAndAdvance(lessonId: string, advanceToId: string | null) {
    setCompleting(true);
    const res = await apiPost<{
      enrollment: { progressPercent: number; completedAt: string | null };
    }>(`/api/client/courses/${slug}/learn`, { lessonId, action: "complete" });
    setCompleting(false);
    if (!report(res, () => completeAndAdvance(lessonId, advanceToId))) return;
    if (res.data?.enrollment.progressPercent === 100) {
      celebrate();
      toast("Course complete. Victory lap! 🎓");
      announce("Course complete. Every lesson is finished.");
    } else {
      toast("Lesson done ✓");
      announce("Lesson complete.");
    }
    await load();
    // The server unlocks the follower as part of completing this one, so the id
    // captured before the request is safe to select now.
    if (advanceToId) setSelectedId(advanceToId);
    router.refresh();
  }

  if (error && !data) {
    return (
      <div className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
        <p className="text-sm font-bold text-destructive">{error}</p>
        <Link href={`/courses/${slug}`} className="mt-3 inline-block text-sm font-bold underline">
          Back to course
        </Link>
      </div>
    );
  }

  if (!data) return <Spinner label="Loading course…" />;

  const prev = selectedIndex > 0 ? lessons[selectedIndex - 1] : null;
  const nextLesson =
    selectedIndex >= 0 && selectedIndex < lessons.length - 1 ? lessons[selectedIndex + 1] : null;
  // Next only moves forward through unlocked ground.
  const next = nextLesson && !nextLesson.locked ? nextLesson : null;
  const nextBlocked = nextLesson != null && next == null;

  const typeMeta = selected ? TYPE_META[selected.contentType] : null;
  const isLast = selectedIndex === lessons.length - 1;

  /**
   * The one primary action, resolved from lesson state. Collapsing this into a
   * single descriptor keeps label, enablement and the blocking reason from
   * drifting apart — they are three views of the same decision.
   */
  const primary: {
    label: string;
    action: "complete" | "next" | "none";
    blocked: boolean;
    reason: string | null;
    reasonId: string | undefined;
  } = (() => {
    if (!selected) {
      return { label: "Next", action: "none", blocked: true, reason: null, reasonId: undefined };
    }
    if (!selected.completed) {
      const blocked = !gate.satisfied || completing;
      return {
        // nextLesson, not `next`: the follower is locked *because* this lesson
        // is unfinished, and completing it is exactly what unlocks it.
        label: completing
          ? "Saving…"
          : nextLesson
            ? "Complete & next"
            : isLast
              ? "Complete course"
              : "Mark complete",
        action: "complete",
        blocked,
        reason: gate.satisfied ? null : gate.hint,
        reasonId: gate.satisfied || !gate.hint ? undefined : hintId,
      };
    }
    if (next) {
      return { label: "Next lesson", action: "next", blocked: false, reason: null, reasonId: undefined };
    }
    return {
      label: isLast ? "Course finished" : "Next lesson",
      action: "none",
      blocked: true,
      reason: nextBlocked ? `Finish this lesson to unlock “${nextLesson.title}”.` : null,
      reasonId: nextBlocked ? lockedNextId : undefined,
    };
  })();

  const lessonList = (
    <LessonList
      lessons={lessons}
      selectedId={selected?.id ?? null}
      onPick={pick}
      idPrefix={uid}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Polite live region: transitions only, never the ticking countdown. */}
      <p ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* --- Course header ------------------------------------------------ */}
      <div>
        <Link
          href={`/courses/${slug}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] text-[13px] font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Icon name="arrow-left" className="size-4" aria-hidden /> Course overview
        </Link>

        <h1 className="mt-1.5 font-heading text-xl leading-tight sm:text-2xl">
          {data.course.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <ProgressBar
            value={data.enrollment.progressPercent}
            color="var(--success)"
            className="w-full max-w-xs sm:w-56"
            label="Course progress"
          />
          <p className="num text-sm font-bold">
            {data.enrollment.progressPercent}%
            <span className="font-medium text-muted-foreground">
              {" "}
              · {completedCount} of {lessons.length} lessons done
            </span>
          </p>
        </div>
      </div>

      {/* --- Mobile: open the lesson list in a focus-trapped drawer -------- */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="flex w-full min-h-12 items-center gap-2.5 rounded-[12px] border-2 border-border bg-card px-4 py-3 text-left text-sm font-bold shadow-sm outline-none [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-x-px active:translate-y-px active:shadow-none"
        >
          <Icon name="list" className="size-[18px] shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="num block">
              Lesson {selectedIndex + 1} of {lessons.length}
            </span>
            <span className="block truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {selected ? selected.title : "Browse lessons"}
            </span>
          </span>
          <span className="shrink-0 text-[12px] font-bold text-muted-foreground">Browse</span>
        </button>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="left" className="lg:hidden">
          <SheetHeader>
            <SheetTitle>Course lessons</SheetTitle>
            <SheetDescription className="num">
              {completedCount} of {lessons.length} complete
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="px-0 py-0">{lessonList}</SheetBody>
        </SheetContent>
      </Sheet>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        {/* --- Desktop lesson rail --------------------------------------- */}
        <nav
          aria-label="Course lessons"
          className="hidden self-start overflow-hidden rounded-[12px] border-2 border-border bg-card shadow-md lg:block lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
        >
          <h2 className="num border-b-2 border-border px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Lessons · {completedCount}/{lessons.length}
          </h2>
          {lessonList}
        </nav>

        {/* --- Lesson pane ------------------------------------------------ */}
        <article className="min-w-0 rounded-[14px] border-2 border-border bg-card p-4 shadow-md sm:p-5">
          {selected ? (
            <div className="flex flex-col gap-4">
              <header>
                <p
                  id={positionId}
                  className="num flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                >
                  <span>
                    Lesson {selectedIndex + 1} of {lessons.length}
                  </span>
                  {typeMeta ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Icon name={typeMeta.icon} className="size-3.5" aria-hidden />
                        {typeMeta.label}
                      </span>
                    </>
                  ) : null}
                  {selected.durationMin != null ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{selected.durationMin} min</span>
                    </>
                  ) : null}
                </p>

                {/* tabIndex -1: focus target when the lesson changes. */}
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  aria-describedby={positionId}
                  className="mt-1 font-heading text-lg leading-tight outline-none focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-ring sm:text-xl"
                >
                  {selected.title}
                </h2>

                {selected.completed ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] border-2 border-border bg-success px-2.5 py-1 text-[12px] font-bold text-success-foreground">
                    <Icon name="check-circle" className="size-3.5" aria-hidden /> Completed
                  </p>
                ) : null}
              </header>

              <div className="min-w-0">
                <LessonContent
                  lesson={selected}
                  gate={gate}
                  onViewerUnavailable={() =>
                    setUnreadableLessons((prev) =>
                      prev.has(selected.id) ? prev : new Set(prev).add(selected.id)
                    )
                  }
                />
              </div>

              {/* Zero-height scroll sentinel: reaching it means the learner got
                  to the end of the content above. */}
              <div ref={gate.sentinelRef} aria-hidden className="h-px w-full" />

              {/* --- Actions ------------------------------------------------
                  One primary button. Completing a lesson and moving to the next
                  one were always a single intent, and splitting them left the
                  learner to notice that "Mark complete" had quietly unlocked a
                  separate arrow somewhere else on the row. */}
              <footer className="flex flex-col gap-3 border-t-2 border-dashed border-border pt-4">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="outline"
                    size="lg"
                    className="min-w-0 sm:w-auto"
                    disabled={!prev}
                    onClick={() => prev && pick(prev)}
                  >
                    <Icon name="arrow-left" aria-hidden />
                    <span className="truncate">Previous</span>
                  </Button>

                  <Button
                    size="lg"
                    // aria-disabled rather than disabled: the button keeps focus
                    // so a screen-reader user can reach it and hear the reason.
                    aria-disabled={primary.blocked || undefined}
                    aria-describedby={primary.reasonId}
                    className="min-w-0 sm:w-auto aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:translate-x-0 aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-sm aria-disabled:active:translate-x-0 aria-disabled:active:translate-y-0"
                    onClick={() => {
                      if (completing) return;
                      if (primary.blocked) {
                        if (primary.reason) announce(primary.reason);
                        return;
                      }
                      if (primary.action === "complete") {
                        void completeAndAdvance(selected.id, nextLesson ? nextLesson.id : null);
                      } else if (primary.action === "next" && next) {
                        pick(next);
                      }
                    }}
                  >
                    <span className="truncate">{primary.label}</span>
                    {primary.action === "complete" && !next ? (
                      <Icon name="check" aria-hidden />
                    ) : (
                      <Icon name="arrow-right" aria-hidden />
                    )}
                  </Button>
                </div>

                {/* The single reason line for whatever is blocking the primary. */}
                {primary.reason ? (
                  <p
                    id={primary.reasonId}
                    className="flex items-start gap-1.5 text-[13px] font-bold text-muted-foreground"
                  >
                    <Icon name="lock" className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="num">{primary.reason}</span>
                  </p>
                ) : null}

                {nextLesson && !primary.blocked ? (
                  <p className="text-[13px] font-bold text-muted-foreground">
                    Up next: <span className="text-foreground">{nextLesson.title}</span>
                  </p>
                ) : null}
              </footer>
            </div>
          ) : (
            <EmptyState icon="book" title="No lessons yet">
              This course has no lessons published.
            </EmptyState>
          )}
        </article>
      </div>
    </div>
  );
}
