"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { CourseDetailsForm } from "./course-details-form";
import { CourseLessonsEditor } from "./course-lessons-editor";
import { CourseBuilderTab } from "./course-builder-tab";
import type { CourseEditorProps } from "./course-types";

type Tab = "info" | "lessons" | "builder";

export function CourseEditor({
  initial,
  canWrite,
  quizzes,
  libraryItems,
  currencyOptions,
}: CourseEditorProps) {
  const [tab, setTab] = useState<Tab>("info");

  const tabs: { value: Tab; label: string }[] = [
    { value: "info", label: "Basic info" },
    { value: "lessons", label: "Lessons" },
    ...(canWrite ? [{ value: "builder" as Tab, label: "Course Builder" }] : []),
  ];

  // Key the lessons editor on the server data so a builder apply (which calls
  // router.refresh()) reseeds its local state with the newly created rows.
  const lessonsKey = `${initial.lessons.length}:${initial.lessonGroups.length}`;

  return (
    <div className="flex flex-col gap-5">
      <Segmented<Tab> ariaLabel="Course sections" options={tabs} value={tab} onChange={setTab} />

      {tab === "info" ? (
        <CourseDetailsForm initial={initial} canWrite={canWrite} currencyOptions={currencyOptions} />
      ) : null}

      {tab === "lessons" ? (
        <CourseLessonsEditor
          key={lessonsKey}
          initial={initial}
          canWrite={canWrite}
          quizzes={quizzes}
          libraryItems={libraryItems}
        />
      ) : null}

      {tab === "builder" && canWrite ? (
        <CourseBuilderTab courseId={initial.id} onApplied={() => setTab("lessons")} />
      ) : null}
    </div>
  );
}
