"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";
import { QuizPlayer } from "./quiz-player";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/content/sanitize-html";

type LearnLesson = {
  id: string;
  title: string;
  sortOrder: number;
  contentType: "TEXT" | "HTML" | "VIDEO_URL" | "FILE" | "QUIZ";
  contentJson: Record<string, unknown>;
  assetUrl: string | null;
  durationMin: number | null;
  completed: boolean;
};

type LearnPayload = {
  course: { id: string; title: string; slug: string };
  enrollment: { progressPercent: number; completedAt: string | null };
  lessons: LearnLesson[];
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
          className="rounded bg-muted px-1 py-0.5 font-mono text-[13px] text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function LessonContent({ lesson }: { lesson: LearnLesson }) {
  if (lesson.contentType === "QUIZ") {
    const quizId = typeof lesson.contentJson.quizId === "string" ? lesson.contentJson.quizId : null;
    if (quizId) return <QuizPlayer quizId={quizId} />;
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
          className="lesson-html text-[15px] font-medium leading-relaxed text-foreground [&_a]:font-bold [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_h2]:mt-4 [&_h2]:font-heading [&_h2]:text-lg [&_h3]:mt-3 [&_h3]:font-heading [&_h3]:text-base [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mt-2 [&_pre]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded-[10px] [&_pre]:border-2 [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3 [&_table]:mt-2 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
      );
    }
  }

  if (lesson.contentType === "VIDEO_URL") {
    const url =
      typeof lesson.contentJson.url === "string" ? lesson.contentJson.url : null;
    if (url) {
      return (
        <video
          src={url}
          controls
          className="w-full rounded-[10px] border-2 border-border bg-black"
        >
          <track kind="captions" />
        </video>
      );
    }
  }

  if (lesson.contentType === "FILE" && lesson.assetUrl) {
    return (
      <a
        href={lesson.assetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-[10px] border-2 border-border bg-card px-4 py-2.5 text-sm font-bold shadow-sm [touch-action:manipulation] active:translate-x-px active:translate-y-px active:shadow-none"
      >
        <Icon name="file" className="size-4" /> Open lesson file
      </a>
    );
  }

  const body = lessonBody(lesson);
  if (body) {
    return (
      <div className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground">
        {renderLessonBody(body)}
      </div>
    );
  }

  return (
    <p className="text-sm font-medium text-muted-foreground">No content for this lesson.</p>
  );
}

function LessonList({
  lessons,
  selectedId,
  onPick,
}: {
  lessons: LearnLesson[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col">
      {lessons.map((lesson, i) => {
        const active = selectedId === lesson.id;
        return (
          <li key={lesson.id}>
            <button
              type="button"
              onClick={() => onPick(lesson.id)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium [touch-action:manipulation] transition-colors",
                i > 0 && "border-t-2 border-dashed border-border",
                active ? "bg-primary text-primary-foreground font-bold" : "hover:bg-accent"
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-border text-[11px] font-bold",
                  lesson.completed ? "bg-success text-success-foreground" : "bg-card text-muted-foreground"
                )}
              >
                {lesson.completed ? <Icon name="check" className="size-3" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function LearnPlayer({ slug }: { slug: string }) {
  const router = useRouter();
  const { toast, celebrate } = useToast();
  const report = useApiError();
  const [data, setData] = useState<LearnPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [listOpen, setListOpen] = useState(false);

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
    setError(null);
    setData(res.data);
    setSelectedId((prev) => {
      if (prev && res.data!.lessons.some((l) => l.id === prev)) return prev;
      const firstIncomplete = res.data!.lessons.find((l) => !l.completed);
      return firstIncomplete?.id ?? res.data!.lessons[0]?.id ?? null;
    });
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state only after await, not synchronously
    void load();
  }, [load]);

  async function markComplete(lessonId: string) {
    setCompleting(true);
    const res = await apiPost<{
      enrollment: { progressPercent: number; completedAt: string | null };
    }>(`/api/client/courses/${slug}/learn`, { lessonId });
    setCompleting(false);
    if (!report(res, () => markComplete(lessonId))) return;
    if (res.data?.enrollment.progressPercent === 100) {
      celebrate();
      toast("Course complete. Victory lap! 🎓");
    } else {
      toast("Lesson done ✓");
    }
    await load();
    router.refresh();
  }

  if (error && !data) {
    return (
      <div className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
        <p className="text-sm font-bold text-destructive">{error}</p>
        <Link
          href={`/courses/${slug}`}
          className="mt-3 inline-block text-sm font-bold underline"
        >
          Back to course
        </Link>
      </div>
    );
  }

  if (!data) return <Spinner label="Loading course…" />;

  const lessons = data.lessons;
  const selected = lessons.find((l) => l.id === selectedId) ?? lessons[0];
  const selectedIndex = lessons.findIndex((l) => l.id === selected?.id);
  const prev = selectedIndex > 0 ? lessons[selectedIndex - 1] : null;
  const next =
    selectedIndex >= 0 && selectedIndex < lessons.length - 1
      ? lessons[selectedIndex + 1]
      : null;

  function pick(id: string) {
    setSelectedId(id);
    setListOpen(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  return (
    <div>
      <Link
        href={`/courses/${slug}`}
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground hover:text-foreground"
      >
        <Icon name="arrow-left" className="size-4" /> Course overview
      </Link>

      <h1 className="font-heading text-xl leading-tight sm:text-2xl">
        {data.course.title}
      </h1>

      <div className="mt-3 flex items-center gap-3">
        <ProgressBar
          value={data.enrollment.progressPercent}
          color="var(--success)"
          className="max-w-xs flex-1"
        />
        <span className="num text-sm font-bold">
          {data.enrollment.progressPercent}%
        </span>
      </div>

      {/* Mobile lesson-list toggle */}
      <div className="mt-4 lg:hidden">
        <button
          type="button"
          onClick={() => setListOpen((o) => !o)}
          aria-expanded={listOpen}
          className="flex w-full items-center gap-2 rounded-[10px] border-2 border-border bg-card px-4 py-3 text-sm font-bold shadow-sm [touch-action:manipulation]"
        >
          <Icon name="layers" className="size-4" />
          Lesson {selectedIndex + 1} of {lessons.length}
          <Icon
            name="chevron-down"
            className={cn(
              "ml-auto size-4 transition-transform",
              listOpen && "rotate-180"
            )}
          />
        </button>
        {listOpen ? (
          <div className="mt-2 overflow-hidden rounded-[12px] border-2 border-border bg-card shadow-md">
            <LessonList lessons={lessons} selectedId={selected?.id ?? null} onPick={pick} />
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* Desktop sidebar list */}
        <div className="hidden self-start overflow-hidden rounded-[12px] border-2 border-border bg-card shadow-md lg:block">
          <LessonList lessons={lessons} selectedId={selected?.id ?? null} onPick={pick} />
        </div>

        <div className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
          {selected ? (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-heading text-lg leading-tight">
                  {selected.title}
                </h2>
                {selected.durationMin != null ? (
                  <p className="num mt-1 text-xs font-bold text-muted-foreground">
                    {selected.durationMin} min
                  </p>
                ) : null}
              </div>

              <LessonContent lesson={selected} />

              <div className="flex flex-wrap items-center gap-3 border-t-2 border-dashed border-border pt-4">
                {!selected.completed ? (
                  <Button
                    onClick={() => markComplete(selected.id)}
                    disabled={completing}
                  >
                    {completing ? "Saving…" : "Mark complete"}
                    <Icon name="check" />
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-success">
                    <Icon name="check-circle" className="size-4" /> Completed
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!prev}
                    onClick={() => prev && pick(prev.id)}
                    aria-label="Previous lesson"
                  >
                    <Icon name="arrow-left" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!next}
                    onClick={() => next && pick(next.id)}
                    aria-label="Next lesson"
                  >
                    <Icon name="arrow-right" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon="book" title="No lessons yet">
              This course has no lessons published.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
