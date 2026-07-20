"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import {
  CONTENT_TYPE_OPTIONS,
  bodyFieldLabel,
  getLessonBody,
  type CourseInitial,
  type LessonContentType,
  type LessonGroupRow,
  type LessonRow,
} from "./course-types";

export function CourseLessonsEditor({
  initial,
  canWrite,
  quizzes,
  libraryItems,
}: {
  initial: CourseInitial;
  canWrite: boolean;
  quizzes: { id: string; title: string }[];
  libraryItems: { id: string; name: string; key: string }[];
}) {
  const router = useRouter();
  const [lessons, setLessons] = useState(initial.lessons);
  const [groups, setGroups] = useState(initial.lessonGroups);

  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonType, setLessonType] = useState<LessonContentType>("TEXT");
  const [lessonBody, setLessonBody] = useState("");
  const [lessonDuration, setLessonDuration] = useState("");
  const [lessonGroupId, setLessonGroupId] = useState("");
  const [lessonQuizId, setLessonQuizId] = useState("");
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [lessonPending, setLessonPending] = useState(false);

  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [groupPending, setGroupPending] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState<LessonContentType>("TEXT");
  const [editBody, setEditBody] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editQuizId, setEditQuizId] = useState("");

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.title }));
  const quizOptions = quizzes.map((q) => ({ value: q.id, label: q.title }));
  const libraryOptions = libraryItems.map((r) => ({ value: r.key, label: r.name }));

  function groupName(id: string | null): string {
    return id ? groups.find((g) => g.id === id)?.title ?? "—" : "—";
  }

  function buildContentJson(type: LessonContentType, body: string, quizId: string) {
    return type === "TEXT"
      ? { body }
      : type === "HTML"
        ? { html: body }
        : type === "VIDEO_URL"
          ? { url: body }
          : type === "QUIZ"
            ? { quizId }
            : {};
  }

  async function addLesson() {
    if (!lessonTitle.trim()) {
      setLessonError("Lesson title is required.");
      return;
    }
    setLessonError(null);
    setLessonPending(true);

    if (lessonType === "QUIZ" && !lessonQuizId) {
      setLessonError("Select a quiz for this lesson.");
      setLessonPending(false);
      return;
    }

    const res = await apiPost<{ lesson: LessonRow }>(
      `/api/tenant/courses/${initial.id}/lessons`,
      {
        title: lessonTitle.trim(),
        contentType: lessonType,
        contentJson: buildContentJson(lessonType, lessonBody, lessonQuizId),
        assetKey: lessonType === "FILE" ? lessonBody || null : null,
        durationMin: lessonDuration.trim() ? parseInt(lessonDuration, 10) : null,
        groupId: lessonGroupId || null,
      }
    );
    setLessonPending(false);
    if (res.error) {
      setLessonError(res.error.message);
      return;
    }
    if (res.data?.lesson) {
      setLessons((prev) => [...prev, res.data!.lesson]);
      setLessonTitle("");
      setLessonBody("");
      setLessonDuration("");
      setLessonType("TEXT");
      setLessonGroupId("");
      setLessonQuizId("");
    }
    router.refresh();
  }

  async function addGroup() {
    if (!newGroupTitle.trim()) return;
    setGroupPending(true);
    const res = await apiPost<{ group: LessonGroupRow }>(
      `/api/tenant/courses/${initial.id}/lesson-groups`,
      { title: newGroupTitle.trim() }
    );
    setGroupPending(false);
    if (res.error) {
      setLessonError(res.error.message);
      return;
    }
    if (res.data?.group) {
      setGroups((prev) => [...prev, res.data!.group]);
      setNewGroupTitle("");
    }
    router.refresh();
  }

  async function removeGroup(groupId: string) {
    if (!confirm("Delete this group? Lessons in it are kept but ungrouped.")) return;
    const res = await apiDelete(`/api/tenant/courses/${initial.id}/lesson-groups/${groupId}`);
    if (res.error) {
      setLessonError(res.error.message);
      return;
    }
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setLessons((prev) => prev.map((l) => (l.groupId === groupId ? { ...l, groupId: null } : l)));
    router.refresh();
  }

  function startEdit(lesson: LessonRow) {
    setEditingId(lesson.id);
    setEditTitle(lesson.title);
    setEditType(lesson.contentType);
    setEditBody(getLessonBody(lesson));
    setEditDuration(lesson.durationMin != null ? String(lesson.durationMin) : "");
    setEditGroupId(lesson.groupId ?? "");
    setEditQuizId(
      lesson.contentType === "QUIZ" && typeof lesson.contentJson.quizId === "string"
        ? lesson.contentJson.quizId
        : ""
    );
  }

  async function saveLessonEdit() {
    if (!editingId) return;
    setLessonError(null);
    setLessonPending(true);

    if (editType === "QUIZ" && !editQuizId) {
      setLessonError("Select a quiz for this lesson.");
      setLessonPending(false);
      return;
    }

    const res = await apiPatch<{ lesson: LessonRow }>(
      `/api/tenant/courses/${initial.id}/lessons/${editingId}`,
      {
        title: editTitle.trim(),
        contentType: editType,
        contentJson: buildContentJson(editType, editBody, editQuizId),
        assetKey: editType === "FILE" ? editBody || null : null,
        durationMin: editDuration.trim() ? parseInt(editDuration, 10) : null,
        groupId: editGroupId || null,
      }
    );
    setLessonPending(false);
    if (res.error) {
      setLessonError(res.error.message);
      return;
    }
    if (res.data?.lesson) {
      setLessons((prev) =>
        prev.map((l) => (l.id === editingId ? res.data!.lesson : l))
      );
      setEditingId(null);
    }
    router.refresh();
  }

  async function removeLesson(lessonId: string) {
    if (!confirm("Delete this lesson?")) return;
    setLessonError(null);
    const res = await apiDelete(`/api/tenant/courses/${initial.id}/lessons/${lessonId}`);
    if (res.error) {
      setLessonError(res.error.message);
      return;
    }
    setLessons((prev) => prev.filter((l) => l.id !== lessonId));
    if (editingId === lessonId) setEditingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Lesson groups</h2>
        <p className="mt-1 text-xs text-stone-500">
          Organize lessons into groups (e.g. modules). Lessons can be assigned to a group when added
          or edited.
        </p>
        {groups.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No groups yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {groups.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-border bg-background px-3 py-2 text-sm"
              >
                <span className="font-semibold text-foreground">{g.title}</span>
                {canWrite ? (
                  <Button type="button" variant="destructive" size="sm" onClick={() => removeGroup(g.id)}>
                    Delete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <div className="mt-4 flex max-w-md items-end gap-2">
            <div className="flex-1">
              <FormField label="New group title" htmlFor="new-group">
                <TextInput
                  id="new-group"
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                />
              </FormField>
            </div>
            <Button type="button" onClick={addGroup} disabled={groupPending}>
              {groupPending ? "Adding…" : "Add group"}
            </Button>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Lessons</h2>
        {lessons.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No lessons yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {lessons.map((lesson, idx) => (
              <li
                key={lesson.id}
                className="rounded border border-stone-200 bg-stone-50 p-4 text-sm"
              >
                {editingId === lesson.id ? (
                  <div className="flex flex-col gap-3">
                    <FormField label="Title" htmlFor={`edit-title-${lesson.id}`}>
                      <TextInput
                        id={`edit-title-${lesson.id}`}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    </FormField>
                    <FormField label="Content type" htmlFor={`edit-type-${lesson.id}`}>
                      <SelectInput
                        id={`edit-type-${lesson.id}`}
                        allowEmpty={false}
                        options={CONTENT_TYPE_OPTIONS}
                        value={editType}
                        onChange={(e) => setEditType(e.target.value as LessonContentType)}
                      />
                    </FormField>
                    {editType === "QUIZ" ? (
                      <FormField label="Quiz" htmlFor={`edit-quiz-${lesson.id}`}>
                        {quizOptions.length > 0 ? (
                          <SelectInput
                            id={`edit-quiz-${lesson.id}`}
                            placeholder="Select a quiz…"
                            options={quizOptions}
                            value={editQuizId}
                            onChange={(e) => setEditQuizId(e.target.value)}
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">No quizzes yet — create one under Quizzes first.</p>
                        )}
                      </FormField>
                    ) : (
                      <FormField label={bodyFieldLabel(editType)} htmlFor={`edit-body-${lesson.id}`}>
                        {editType === "TEXT" || editType === "HTML" ? (
                          <textarea
                            id={`edit-body-${lesson.id}`}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            rows={4}
                            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-stone-500"
                          />
                        ) : (
                          <TextInput
                            id={`edit-body-${lesson.id}`}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                          />
                        )}
                      </FormField>
                    )}
                    {editType === "FILE" && libraryOptions.length > 0 ? (
                      <FormField label="Pick from library" htmlFor={`edit-library-${lesson.id}`}>
                        <SelectInput
                          id={`edit-library-${lesson.id}`}
                          placeholder="Select a file…"
                          options={libraryOptions}
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                        />
                      </FormField>
                    ) : null}
                    <FormField label="Duration (minutes)" htmlFor={`edit-dur-${lesson.id}`}>
                      <TextInput
                        id={`edit-dur-${lesson.id}`}
                        type="number"
                        min="0"
                        value={editDuration}
                        onChange={(e) => setEditDuration(e.target.value)}
                      />
                    </FormField>
                    <FormField label="Group" htmlFor={`edit-group-${lesson.id}`}>
                      <SelectInput
                        id={`edit-group-${lesson.id}`}
                        placeholder="Ungrouped"
                        options={groupOptions}
                        value={editGroupId}
                        onChange={(e) => setEditGroupId(e.target.value)}
                      />
                    </FormField>
                    <div className="flex gap-2">
                      <Button onClick={saveLessonEdit} disabled={lessonPending}>
                        Save lesson
                      </Button>
                      <Button variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">
                        {idx + 1}. {lesson.title}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        {lesson.contentType}
                        {lesson.durationMin != null ? ` · ${lesson.durationMin} min` : ""}
                        {lesson.groupId ? ` · ${groupName(lesson.groupId)}` : ""}
                      </div>
                    </div>
                    {canWrite ? (
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" onClick={() => startEdit(lesson)}>
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeLesson(lesson.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {canWrite ? (
          <div className="mt-6 max-w-xl border-t border-stone-200 pt-6">
            <h3 className="text-sm font-medium text-stone-700">Add lesson</h3>
            <div className="mt-4 flex flex-col gap-4">
              <FormField label="Title" htmlFor="lesson-title">
                <TextInput
                  id="lesson-title"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                />
              </FormField>
              <FormField label="Content type" htmlFor="lesson-type">
                <SelectInput
                  id="lesson-type"
                  allowEmpty={false}
                  options={CONTENT_TYPE_OPTIONS}
                  value={lessonType}
                  onChange={(e) => setLessonType(e.target.value as LessonContentType)}
                />
              </FormField>
              {lessonType === "QUIZ" ? (
                <FormField label="Quiz" htmlFor="lesson-quiz">
                  {quizOptions.length > 0 ? (
                    <SelectInput
                      id="lesson-quiz"
                      placeholder="Select a quiz…"
                      options={quizOptions}
                      value={lessonQuizId}
                      onChange={(e) => setLessonQuizId(e.target.value)}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">No quizzes yet — create one under Quizzes first.</p>
                  )}
                </FormField>
              ) : (
                <FormField label={bodyFieldLabel(lessonType)} htmlFor="lesson-body">
                  {lessonType === "TEXT" || lessonType === "HTML" ? (
                    <textarea
                      id="lesson-body"
                      value={lessonBody}
                      onChange={(e) => setLessonBody(e.target.value)}
                      rows={4}
                      className="rounded border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-stone-500"
                    />
                  ) : (
                    <TextInput
                      id="lesson-body"
                      value={lessonBody}
                      onChange={(e) => setLessonBody(e.target.value)}
                    />
                  )}
                </FormField>
              )}
              {lessonType === "FILE" && libraryOptions.length > 0 ? (
                <FormField label="Pick from library" htmlFor="lesson-library">
                  <SelectInput
                    id="lesson-library"
                    placeholder="Select a file…"
                    options={libraryOptions}
                    value={lessonBody}
                    onChange={(e) => setLessonBody(e.target.value)}
                  />
                </FormField>
              ) : null}
              <FormField label="Duration (minutes)" htmlFor="lesson-duration">
                <TextInput
                  id="lesson-duration"
                  type="number"
                  min="0"
                  value={lessonDuration}
                  onChange={(e) => setLessonDuration(e.target.value)}
                />
              </FormField>
              <FormField label="Group (optional)" htmlFor="lesson-group">
                <SelectInput
                  id="lesson-group"
                  placeholder="Ungrouped"
                  options={groupOptions}
                  value={lessonGroupId}
                  onChange={(e) => setLessonGroupId(e.target.value)}
                />
              </FormField>
              {lessonError ? <p className="text-sm text-red-600">{lessonError}</p> : null}
              <div>
                <Button onClick={addLesson} disabled={lessonPending}>
                  {lessonPending ? "Adding…" : "Add lesson"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
