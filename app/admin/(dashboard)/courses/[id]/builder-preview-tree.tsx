"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import { cn } from "@/lib/utils";
import type {
  GeneratedCourse,
  GeneratedGroup,
  GeneratedLesson,
  GeneratedQuestion,
} from "@/lib/schemas/course-builder";

type DragItem = { kind: "group"; gi: number } | { kind: "lesson"; gi: number; li: number };

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function TypeBadge({ type }: { type: GeneratedLesson["contentType"] }) {
  return (
    <span className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-600">
      {type}
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
        <Icon name="chevron-up" />
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label="Move down"
        disabled={!canDown}
        onClick={onDown}
      >
        <Icon name="chevron-down" />
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
    <div className="rounded border border-stone-200 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{question.prompt}</p>
        {onRemove ? (
          <Button variant="outline" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
      {question.type === "SHORT_ANSWER" ? (
        <p className="mt-2 text-xs text-stone-600">
          Accepted answers:{" "}
          <span className="font-semibold text-green-700">{question.acceptedAnswers.join(", ")}</span>
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {question.options.map((opt, i) => (
            <li
              key={i}
              className={cn(
                "rounded px-2 py-1 text-xs",
                correct.has(i) ? "bg-green-50 font-semibold text-green-800" : "text-stone-600"
              )}
            >
              {correct.has(i) ? "✓ " : ""}
              {opt}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-stone-400">
        {question.type} · {question.points} pt{question.points === 1 ? "" : "s"}
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
}: {
  lesson: GeneratedLesson;
  canEdit: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onChange: (lesson: GeneratedLesson) => void;
  onRemove: () => void;
  move: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void } | null;
  dragProps: React.LiHTMLAttributes<HTMLLIElement>;
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
        "rounded border border-stone-200 bg-stone-50 p-3 transition-opacity",
        dragging && "opacity-40",
        dropTarget && "outline outline-2 outline-offset-2 outline-primary"
      )}
      {...dragProps}
    >
      <div className="flex items-center gap-2">
        {canEdit ? (
          <span
            className="cursor-grab text-stone-400 active:cursor-grabbing"
            title="Drag to reorder"
          >
            <Icon name="grip" className="size-4" />
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-bold text-stone-500 [touch-action:manipulation]"
          aria-expanded={open}
        >
          {open ? "▾" : "▸"}
        </button>
        <TypeBadge type={lesson.contentType} />
        {canEdit ? (
          <TextInput
            value={lesson.title}
            onChange={(e) => onChange({ ...lesson, title: e.target.value })}
            className="flex-1"
          />
        ) : (
          <span className="flex-1 text-sm font-medium">{lesson.title}</span>
        )}
        {lesson.durationMin != null ? (
          <span className="shrink-0 text-xs text-stone-500">{lesson.durationMin} min</span>
        ) : null}
        {lesson.contentType === "QUIZ" && lesson.quiz ? (
          <span className="shrink-0 text-xs text-stone-500">{lesson.quiz.questions.length} q</span>
        ) : null}
        {canEdit && move ? <MoveButtons {...move} /> : null}
        {canEdit ? (
          <Button variant="destructive" size="icon-xs" aria-label="Delete lesson" onClick={onRemove}>
            <Icon name="trash" />
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 border-t border-dashed border-stone-300 pt-3">
          {lesson.contentType === "TEXT" && lesson.body ? (
            <div className="whitespace-pre-wrap text-sm text-stone-700">{lesson.body}</div>
          ) : null}
          {lesson.contentType === "HTML" && lesson.html ? (
            <div
              className="text-sm text-stone-700 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mt-2 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.html) }}
            />
          ) : null}
          {lesson.contentType === "QUIZ" && lesson.quiz ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{lesson.quiz.title}</p>
              {lesson.quiz.passingScore != null ? (
                <p className="text-xs text-stone-500">Passing score: {lesson.quiz.passingScore}%</p>
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
            <p className="text-sm italic text-stone-500">
              Placeholder — {lesson.placeholderNote ?? "attach content after applying."}
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
    onChange({ ...course, groups: arrayMove(course.groups, from, to) });
  }

  function moveLesson(gi: number, from: number, to: number) {
    const group = course.groups[gi];
    if (to < 0 || to >= group.lessons.length || from === to) return;
    updateGroup(gi, { lessons: arrayMove(group.lessons, from, to) });
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
    onChange({ ...course, groups });
  }

  function endDrag() {
    setDrag(null);
    setOver(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {course.courseSummary ? (
        <p className="text-sm text-stone-600">{course.courseSummary}</p>
      ) : null}
      {course.groups.map((group, gi) => (
        <div
          key={gi}
          className={cn(
            "rounded-[10px] border-2 border-border bg-background p-3 transition-opacity",
            drag?.kind === "group" && drag.gi === gi && "opacity-40",
            over === `g${gi}` && "outline outline-2 outline-offset-2 outline-primary"
          )}
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
                className="cursor-grab text-stone-400 active:cursor-grabbing"
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
              className="text-xs font-bold text-stone-500 [touch-action:manipulation]"
              aria-expanded={!collapsed.has(gi)}
            >
              {collapsed.has(gi) ? "▸" : "▾"}
            </button>
            <span className="shrink-0 text-xs font-bold uppercase text-stone-400">
              Module {gi + 1}
            </span>
            {canEdit ? (
              <TextInput
                value={group.title}
                onChange={(e) => updateGroup(gi, { title: e.target.value })}
                className="flex-1"
              />
            ) : (
              <span className="flex-1 text-sm font-semibold">{group.title}</span>
            )}
            <span className="shrink-0 text-xs text-stone-500">
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
                  key={li}
                  lesson={lesson}
                  canEdit={canEdit}
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
        <p className="text-xs text-stone-400">
          Drag the <Icon name="grip" className="inline size-3" /> handle (or use the arrows) to
          reorder modules and lessons — lessons can be dragged between modules.
        </p>
      ) : null}
    </div>
  );
}
