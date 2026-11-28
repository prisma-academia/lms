import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { sanitizeHtmlWithStyles } from "@/lib/content/sanitize-html";
import { VideoLessonPlayer } from "@/components/lesson/video-lesson-player";
import { renderLessonText } from "@/lib/courses/render-lesson-text";
import type { GateContentType } from "@/lib/courses/content-gate";

/**
 * Read-only render of a course's lessons in the learner's layout.
 *
 * Server-rendered and navigated by links rather than client state: a preview has
 * no progress to keep, no gate to satisfy and nothing to submit, so the whole
 * interactive player would be weight without purpose. What it must get right is
 * the CONTENT — the same sanitizer, the same HTML/CSS handling, the same media
 * elements — because that is the thing the admin came to check.
 */

export type PreviewLesson = {
  id: string;
  title: string;
  contentType: GateContentType;
  contentJson: Record<string, unknown>;
  durationMin: number | null;
  groupTitle: string | null;
  requiredSeconds: number;
  requireDwell: boolean;
  assetUrl: string | null;
  mediaKind: string | null;
  fileName: string | null;
};

const TYPE_META: Record<GateContentType, { icon: IconName; label: string }> = {
  TEXT: { icon: "book", label: "Reading" },
  HTML: { icon: "book", label: "Reading" },
  VIDEO_URL: { icon: "video", label: "Video" },
  FILE: { icon: "file", label: "File" },
  QUIZ: { icon: "clipboard", label: "Quiz" },
  EXAM: { icon: "monitor", label: "Exam" },
};

function lessonText(lesson: PreviewLesson): string | null {
  for (const key of ["body", "text", "content"] as const) {
    const v = lesson.contentJson[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/** How the completion gate will read to a learner on this lesson. */
function gateSummary(lesson: PreviewLesson): string {
  if (lesson.contentType === "QUIZ") return "Unlocks on passing the quiz";
  if (!lesson.requireDwell || lesson.requiredSeconds === 0) {
    return "No timer — completes as soon as the content is consumed";
  }
  const seconds = lesson.requiredSeconds;
  const label = seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds}s`;
  return `Minimum ${label} on the page`;
}

function LessonBody({ lesson }: { lesson: PreviewLesson }) {
  if (lesson.contentType === "HTML") {
    const html = lesson.contentJson.html;
    if (typeof html === "string" && html.trim()) {
      const scoped = sanitizeHtmlWithStyles(html, lesson.id);
      return (
        <>
          {scoped.css ? <style dangerouslySetInnerHTML={{ __html: scoped.css }} /> : null}
          <div
            data-css-scope={scoped.scope}
            className="lesson-prose"
            dangerouslySetInnerHTML={{ __html: scoped.html }}
          />
        </>
      );
    }
  }

  if (lesson.contentType === "VIDEO_URL") {
    const url = lesson.contentJson.url;
    if (typeof url === "string" && url.trim()) {
      // Same player the learner gets, so an admin checking a YouTube lesson
      // sees the real embed rather than the black box a raw <video> gave them.
      return <VideoLessonPlayer url={url} title={lesson.title} />;
    }
  }

  if (lesson.contentType === "FILE") {
    if (!lesson.assetUrl) {
      return (
        <EmptyBody note="No file is attached to this lesson yet — learners would see nothing here." />
      );
    }
    if (lesson.mediaKind === "VIDEO" || lesson.mediaKind === "AUDIO") {
      const Tag = lesson.mediaKind === "VIDEO" ? "video" : "audio";
      return (
        // `bg-black` is a literal on purpose: it is the letterbox behind a
        // video, which is black in every theme. A token would turn it pale in
        // a light theme.
        <Tag
          src={lesson.assetUrl}
          controls
          preload="metadata"
          className="w-full rounded-[10px] border-2 border-border bg-black"
        />
      );
    }
    if (lesson.mediaKind === "IMAGE") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lesson.assetUrl}
          alt={lesson.fileName ?? lesson.title}
          className="max-w-full rounded-[10px] border-2 border-border"
        />
      );
    }
    return (
      <a
        href={lesson.assetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border-2 border-border bg-card px-4 py-3 text-sm font-bold outline-none hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Icon name="download" aria-hidden />
        <span className="min-w-0 break-words">{lesson.fileName ?? "Download file"}</span>
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }

  if (lesson.contentType === "QUIZ") {
    const quizId = lesson.contentJson.quizId;
    return typeof quizId === "string" && quizId ? (
      <div className="rounded-[10px] border-2 border-dashed border-border p-6 text-sm font-medium text-muted-foreground">
        A quiz runs here. Quizzes are interactive and score against real attempts,
        so they are not played in preview —{" "}
        <Link
          href={`/admin/quizzes/${quizId}`}
          className="rounded-[4px] font-bold underline outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          open the quiz
        </Link>{" "}
        to review its questions.
      </div>
    ) : (
      <EmptyBody note="No quiz is selected for this lesson yet." />
    );
  }

  const text = lessonText(lesson);
  if (text) {
    return (
      <div className="lesson-prose">{renderLessonText(text)}</div>
    );
  }

  return <EmptyBody note="This lesson has no content yet." />;
}

function EmptyBody({ note }: { note: string }) {
  return (
    <div className="rounded-[10px] border-2 border-dashed border-border p-6 text-sm font-medium text-muted-foreground">
      {note}
    </div>
  );
}

export function CoursePreview({
  courseId,
  courseTitle,
  courseDescription,
  lessons,
  selectedId,
}: {
  courseId: string;
  courseTitle: string;
  courseDescription: string | null;
  lessons: PreviewLesson[];
  selectedId: string | null;
}) {
  const selected = lessons.find((l) => l.id === selectedId) ?? null;

  if (lessons.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-heading text-2xl">{courseTitle}</h1>
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          This course has no lessons yet, so there is nothing for a learner to open.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row">
      <aside className="lg:w-80 lg:shrink-0">
        <h1 className="font-heading text-xl">{courseTitle}</h1>
        {courseDescription ? (
          <p className="mt-2 text-sm font-medium text-muted-foreground">{courseDescription}</p>
        ) : null}

        <ol className="mt-5 flex flex-col gap-1">
          {lessons.map((lesson, index) => {
            const meta = TYPE_META[lesson.contentType];
            const active = lesson.id === selected?.id;
            const showGroup =
              lesson.groupTitle && lesson.groupTitle !== lessons[index - 1]?.groupTitle;

            return (
              <li key={lesson.id}>
                {showGroup ? (
                  <p className="mt-3 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {lesson.groupTitle}
                  </p>
                ) : null}
                <Link
                  href={`/admin/preview/course/${courseId}?lesson=${lesson.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-start gap-2 rounded-[10px] border-2 px-3 py-2 text-sm font-medium outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    active
                      ? "border-border bg-card shadow-sm"
                      : "border-transparent hover:border-border"
                  }`}
                >
                  <Icon name={meta.icon} className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span className="break-words font-bold">{lesson.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {[meta.label, lesson.durationMin != null ? `${lesson.durationMin} min` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className="min-w-0 flex-1">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border pb-4">
              <h2 className="min-w-0 break-words font-heading text-2xl">{selected.title}</h2>
              <span className="rounded-[8px] border-2 border-border bg-card px-2 py-1 text-xs font-bold text-muted-foreground">
                {gateSummary(selected)}
              </span>
            </div>
            <div className="mt-6">
              <LessonBody lesson={selected} />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
