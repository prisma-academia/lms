"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { renderLessonText } from "@/lib/courses/render-lesson-text";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import { withViewTransition } from "@/lib/client/view-transition";
import { cn } from "@/lib/utils";
import type {
  GeneratedCourse,
  GeneratedGroup,
  GeneratedLesson,
  GeneratedQuestion,
} from "@/lib/schemas/course-builder";

type DragItem = { kind: "group"; gi: number } | { kind: "lesson"; gi: number; li: number };

/**
 * Stable ids for View Transitions and list keys — they survive a reorder
 * because the same module and lesson objects are moved, not recreated.
 *
 * Kept at module level rather than in a ref: it is looked up while rendering,
 * and a ref must not be read then. Keyed by object identity in a WeakMap, so
 * one cache serves every tree and an entry goes when its object does.
 */
const STABLE_KEYS = new WeakMap<object, string>();
function stableKey(obj: object): string {
  let id = STABLE_KEYS.get(obj);
  if (!id) {
    id = crypto.randomUUID();
    STABLE_KEYS.set(obj, id);
  }
  return id;
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** What a lesson is, in the words an author uses — not the storage type. */
const TYPE_LABELS: Record<GeneratedLesson["contentType"], string> = {
  TEXT: "Reading",
  HTML: "Reading",
  VIDEO_URL: "Video",
  FILE: "File",
  QUIZ: "Quiz",
};

function TypeBadge({ type }: { type: GeneratedLesson["contentType"] }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-[6px] border-2 border-border bg-card px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function MoveButtons({
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button variant="outline" size="icon-xs" aria-label="Move up" disabled={!canUp} onClick={onUp}>
        <Icon name="chevron-up" aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label="Move down"
        disabled={!canDown}
        onClick={onDown}
      >
        <Icon name="chevron-down" aria-hidden />
      </Button>
    </div>
  );
}

function QuestionPreview({
  question,
  onRemove,
}: {
  question: GeneratedQuestion;
  onRemove: (() => void) | null;
}) {
  const correct = new Set(question.correctOptionIndexes);
  return (
    <div className="rounded-[10px] border-2 border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{question.prompt}</p>
        {onRemove ? (
          <Button variant="outline" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
      {question.type === "ESSAY" ? (
        // The rubric is shown in full on purpose. A generated essay is marked
        // by AI against these criteria and the result counts towards the
        // quiz's pass mark, so this preview is the only chance a human gets to
        // catch a vague criterion before it costs learners marks. Do not
        // collapse or truncate it.
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            Marked by AI against these criteria. Check each one can be judged fairly.
          </p>
          <ul className="flex flex-col gap-1">
            {(question.rubric?.criteria ?? []).map((c) => (
              <li key={c.id} className="rounded-[6px] bg-muted px-2 py-1 text-xs text-foreground">
                <span className="font-semibold">{c.label}</span>
                <span className="text-muted-foreground"> · weight {c.weight}</span>
                {c.description ? <span className="block text-muted-foreground">{c.description}</span> : null}
              </li>
            ))}
          </ul>
          {question.rubric?.modelAnswer ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Model answer:</span> {question.rubric.modelAnswer}
            </p>
          ) : null}
        </div>
      ) : question.type === "SHORT_ANSWER" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Accepted answers:{" "}
          <span className="font-semibold text-foreground">{question.acceptedAnswers.join(", ")}</span>
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {question.options.map((opt, i) => (
            <li
              key={i}
              className={cn(
                "rounded-[6px] px-2 py-1 text-xs",
                correct.has(i) ? "bg-success/15 font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {correct.has(i) ? (
                <>
                  <span aria-hidden>✓ </span>
                  <span className="sr-only">Correct answer: </span>
                </>
              ) : null}
              {opt}
            </li>
          ))}
        </ul>
      )}
      <p className="num mt-1 text-[11px] font-medium text-muted-foreground">
        {question.type.charAt(0) + question.type.slice(1).toLowerCase().replace(/_/g, " ")} ·{" "}
        {question.points} point{question.points === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function LessonPreview({
  lesson,
  canEdit,
  dragging,
  dropTarget,
  onChange,
  onRemove,
  move,
  dragProps,
  viewTransitionName,
}: {
  lesson: GeneratedLesson;
  canEdit: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onChange: (lesson: GeneratedLesson) => void;
  onRemove: () => void;
  move: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void } | null;
  dragProps: React.LiHTMLAttributes<HTMLLIElement>;
  viewTransitionName?: string;
}) {
  const [open, setOpen] = useState(false);

  function removeQuestion(index: number) {
    if (!lesson.quiz) return;
    const questions = lesson.quiz.questions.filter((_, i) => i !== index);
    onChange({ ...lesson, quiz: { ...lesson.quiz, questions } });
  }

  return (
    <li
      className={cn(
        "rounded-[10px] border-2 border-border bg-muted p-3 transition-opacity",
        dragging && "opacity-40",
        dropTarget && "outline outline-2 outline-offset-2 outline-primary"
      )}
      style={viewTransitionName ? { viewTransitionName } : undefined}
      {...dragProps}
    >
      <div className="flex items-center gap-2">
        {canEdit ? (
          <span
            aria-hidden
            className="cursor-grab text-muted-foreground active:cursor-grabbing"
            title="Drag to reorder"
          >
            <Icon name="grip" className="size-4" />
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex size-7 shrink-0 items-center justify-center rounded-[8px] text-xs font-bold text-muted-foreground outline-none [touch-action:manipulation] hover:bg-muted hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} the content of “${lesson.title}”`}
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
        </button>
        <TypeBadge type={lesson.contentType} />
        {canEdit ? (
          <TextInput
            aria-label="Lesson title"
            autoComplete="off"
            value={lesson.title}
            onChange={(e) => onChange({ ...lesson, title: e.target.value })}
            className="min-w-0 flex-1"
          />
        ) : (
          <span className="min-w-0 flex-1 break-words text-sm font-medium">{lesson.title}</span>
        )}
        {lesson.durationMin != null ? (
          <span className="num hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline">
            {lesson.durationMin} min
          </span>
        ) : null}
        {lesson.contentType === "QUIZ" && lesson.quiz ? (
          <span className="num hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline">
            {lesson.quiz.questions.length} question{lesson.quiz.questions.length === 1 ? "" : "s"}
          </span>
        ) : null}
        {canEdit && move ? <MoveButtons {...move} /> : null}
        {canEdit ? (
          <Button
            variant="destructive"
            size="icon-xs"
            aria-label={`Remove the lesson “${lesson.title}”`}
            onClick={onRemove}
          >
            <Icon name="trash" aria-hidden />
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 border-t border-dashed border-border pt-3">
          {lesson.contentType === "TEXT" && lesson.body ? (
            <div className="lesson-prose text-sm">{renderLessonText(lesson.body)}</div>
          ) : null}
          {lesson.contentType === "HTML" && lesson.html ? (
            <div
              className="lesson-prose text-sm"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.html) }}
            />
          ) : null}
          {lesson.contentType === "QUIZ" && lesson.quiz ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{lesson.quiz.title}</p>
              {lesson.quiz.passingScore != null ? (
                <p className="num text-xs font-medium text-muted-foreground">
                  Pass mark: {lesson.quiz.passingScore}%
                </p>
              ) : null}
              {lesson.quiz.questions.map((q, i) => (
                <QuestionPreview
                  key={i}
                  question={q}
                  onRemove={
                    canEdit && lesson.quiz!.questions.length > 1 ? () => removeQuestion(i) : null
                  }
                />
              ))}
            </div>
          ) : null}
          {lesson.contentType === "VIDEO_URL" || lesson.contentType === "FILE" ? (
            <p className="text-sm font-medium text-muted-foreground">
              Nothing attached yet. {lesson.placeholderNote ?? "Attach the content after adding this to the course."}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function BuilderPreviewTree({
  course,
  canEdit,
  onChange,
}: {
  course: GeneratedCourse;
  canEdit: boolean;
  onChange: (course: GeneratedCourse) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  function commit(next: GeneratedCourse) {
    withViewTransition(() => onChange(next));
  }

  function toggleGroup(index: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function updateGroup(index: number, patch: Partial<GeneratedGroup>) {
    const groups = course.groups.map((g, i) => (i === index ? { ...g, ...patch } : g));
    onChange({ ...course, groups });
  }

  function removeGroup(index: number) {
    onChange({ ...course, groups: course.groups.filter((_, i) => i !== index) });
  }

  function moveGroup(from: number, to: number) {
    if (to < 0 || to >= course.groups.length || from === to) return;
    commit({ ...course, groups: arrayMove(course.groups, from, to) });
  }

  function moveLesson(gi: number, from: number, to: number) {
    const group = course.groups[gi];
    if (to < 0 || to >= group.lessons.length || from === to) return;
    withViewTransition(() =>
      updateGroup(gi, { lessons: arrayMove(group.lessons, from, to) })
    );
  }

  /** Move a lesson to another position, possibly across modules. An emptied
      source module is removed (applied groups must have at least one lesson). */
  function moveLessonAcross(from: { gi: number; li: number }, to: { gi: number; li: number }) {
    if (from.gi === to.gi) {
      moveLesson(from.gi, from.li, to.li);
      return;
    }
    const lesson = course.groups[from.gi].lessons[from.li];
    let groups = course.groups.map((g, i) => {
      if (i === from.gi) return { ...g, lessons: g.lessons.filter((_, li) => li !== from.li) };
      if (i === to.gi) {
        const lessons = [...g.lessons];
        lessons.splice(to.li, 0, lesson);
        return { ...g, lessons };
      }
      return g;
    });
    groups = groups.filter((g) => g.lessons.length > 0);
    commit({ ...course, groups });
  }

  function endDrag() {
    setDrag(null);
    setOver(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {course.courseSummary ? (
        <p className="text-sm text-muted-foreground">{course.courseSummary}</p>
      ) : null}
      {course.groups.map((group, gi) => (
        <div
          key={stableKey(group)}
          className={cn(
            "rounded-[10px] border-2 border-border bg-background p-3 transition-opacity",
            drag?.kind === "group" && drag.gi === gi && "opacity-40",
            over === `g${gi}` && "outline outline-2 outline-offset-2 outline-primary"
          )}
          style={{ viewTransitionName: `builder-module-${stableKey(group)}` }}
          draggable={false}
          onDragOver={(e) => {
            if (drag?.kind === "group") {
              e.preventDefault();
              setOver(`g${gi}`);
            }
          }}
          onDragLeave={() => {
            if (over === `g${gi}`) setOver(null);
          }}
          onDrop={(e) => {
            if (drag?.kind === "group") {
              e.preventDefault();
              moveGroup(drag.gi, gi);
            }
            endDrag();
          }}
        >
          <div className="flex items-center gap-2">
            {canEdit ? (
              <span
                aria-hidden
                className="cursor-grab text-muted-foreground active:cursor-grabbing"
                title="Drag to reorder modules"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDrag({ kind: "group", gi });
                }}
                onDragEnd={endDrag}
              >
                <Icon name="grip" className="size-4" />
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => toggleGroup(gi)}
              className="flex size-7 shrink-0 items-center justify-center rounded-[8px] text-xs font-bold text-muted-foreground outline-none [touch-action:manipulation] hover:bg-muted hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-expanded={!collapsed.has(gi)}
              aria-label={`${collapsed.has(gi) ? "Show" : "Hide"} the lessons in module ${gi + 1}`}
            >
              <span aria-hidden>{collapsed.has(gi) ? "▸" : "▾"}</span>
            </button>
            <span className="num hidden shrink-0 text-xs font-bold text-muted-foreground sm:inline">
              Module {gi + 1}
            </span>
            {canEdit ? (
              <TextInput
                aria-label={`Title of module ${gi + 1}`}
                autoComplete="off"
                value={group.title}
                onChange={(e) => updateGroup(gi, { title: e.target.value })}
                className="min-w-0 flex-1"
              />
            ) : (
              <span className="min-w-0 flex-1 break-words text-sm font-bold">{group.title}</span>
            )}
            <span className="num hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline">
              {group.lessons.length} lesson{group.lessons.length === 1 ? "" : "s"}
            </span>
            {canEdit ? (
              <MoveButtons
                canUp={gi > 0}
                canDown={gi < course.groups.length - 1}
                onUp={() => moveGroup(gi, gi - 1)}
                onDown={() => moveGroup(gi, gi + 1)}
              />
            ) : null}
            {canEdit && course.groups.length > 1 ? (
              <Button
                variant="destructive"
                size="icon-xs"
                aria-label="Delete module"
                onClick={() => removeGroup(gi)}
              >
                <Icon name="trash" />
              </Button>
            ) : null}
          </div>
          {!collapsed.has(gi) ? (
            <ul className="mt-3 flex flex-col gap-2">
              {group.lessons.map((lesson, li) => (
                <LessonPreview
                  key={stableKey(lesson)}
                  lesson={lesson}
                  canEdit={canEdit}
                  viewTransitionName={`builder-lesson-${stableKey(lesson)}`}
                  dragging={drag?.kind === "lesson" && drag.gi === gi && drag.li === li}
                  dropTarget={over === `l${gi}:${li}`}
                  onChange={(next) =>
                    updateGroup(gi, {
                      lessons: group.lessons.map((l, i) => (i === li ? next : l)),
                    })
                  }
                  onRemove={() =>
                    group.lessons.length > 1
                      ? updateGroup(gi, { lessons: group.lessons.filter((_, i) => i !== li) })
                      : removeGroup(gi)
                  }
                  move={{
                    canUp: li > 0,
                    canDown: li < group.lessons.length - 1,
                    onUp: () => moveLesson(gi, li, li - 1),
                    onDown: () => moveLesson(gi, li, li + 1),
                  }}
                  dragProps={
                    canEdit
                      ? {
                          draggable: true,
                          onDragStart: (e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = "move";
                            setDrag({ kind: "lesson", gi, li });
                          },
                          onDragEnd: endDrag,
                          onDragOver: (e) => {
                            if (drag?.kind === "lesson") {
                              e.preventDefault();
                              e.stopPropagation();
                              setOver(`l${gi}:${li}`);
                            }
                          },
                          onDrop: (e) => {
                            if (drag?.kind === "lesson") {
                              e.preventDefault();
                              e.stopPropagation();
                              moveLessonAcross({ gi: drag.gi, li: drag.li }, { gi, li });
                            }
                            endDrag();
                          },
                        }
                      : {}
                  }
                />
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {canEdit ? (
        <p className="text-xs font-medium text-muted-foreground">
          Reorder modules and lessons with the arrows, or drag the{" "}
          <Icon name="grip" className="inline size-3" aria-hidden /> handle. Lessons can be dragged
          from one module to another.
        </p>
      ) : null}
    </div>
  );
}
