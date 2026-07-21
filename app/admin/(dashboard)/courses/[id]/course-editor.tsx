"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { CourseDetailsForm } from "./course-details-form";
import { CourseContentTab } from "./course-content-tab";
import { CourseAnalyticsTab } from "./course-analytics-tab";
import { CourseEnrollmentsTab } from "./course-enrollments-tab";
import type { CourseEditorProps } from "./course-types";

type Tab = "info" | "content" | "analytics" | "enrollments";

export function CourseEditor({
  initial,
  canWrite,
  quizzes,
  libraryItems,
  currencyOptions,
  analytics,
  enrollments,
  clients,
  canManageEnrollments,
}: CourseEditorProps) {
  const [tab, setTab] = useState<Tab>("info");

  const tabs: { value: Tab; label: string }[] = [
    { value: "info", label: "Basic info" },
    { value: "content", label: "Content" },
    { value: "analytics", label: "Analytics" },
    ...(enrollments ? [{ value: "enrollments" as Tab, label: "Enrollments" }] : []),
  ];

  // Key the content tab on the server data so a builder apply (which calls
  // router.refresh()) reseeds its local state with the newly created rows.
  const lessonsKey = `${initial.lessons.length}:${initial.lessonGroups.length}`;

  return (
    <div className="flex flex-col gap-5">
      <Segmented<Tab> ariaLabel="Course sections" options={tabs} value={tab} onChange={setTab} />

      {tab === "info" ? (
        <CourseDetailsForm initial={initial} canWrite={canWrite} currencyOptions={currencyOptions} />
      ) : null}

      {tab === "content" ? (
        <CourseContentTab
          key={lessonsKey}
          initial={initial}
          canWrite={canWrite}
          quizzes={quizzes}
          libraryItems={libraryItems}
        />
      ) : null}

      {tab === "analytics" ? <CourseAnalyticsTab initial={initial} analytics={analytics} /> : null}

      {tab === "enrollments" && enrollments ? (
        <CourseEnrollmentsTab
          key={enrollments.length}
          courseId={initial.id}
          initialEnrollments={enrollments}
          clients={clients}
          canManage={canManageEnrollments}
        />
      ) : null}
    </div>
  );
}
