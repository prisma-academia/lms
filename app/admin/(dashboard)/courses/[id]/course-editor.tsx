"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { PreviewFrame } from "@/components/preview-frame";
import { CourseDetailsForm } from "./course-details-form";
import { CourseContentTab } from "./course-content-tab";
import { CourseAnalyticsTab } from "./course-analytics-tab";
import { CourseEnrollmentsTab } from "./course-enrollments-tab";
import type { CourseEditorProps } from "./course-types";

type Tab = "info" | "content" | "preview" | "analytics" | "enrollments";

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
    { value: "preview", label: "Preview" },
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

      {tab === "preview" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            The course as a learner meets it. Lessons are shown unlocked so you can
            open any of them — a learner still has to finish the one before.
            {/* Mounted only while the tab is open: the frame loads a full page,
                and paying for that behind three other tabs is waste. */}
          </p>
          <PreviewFrame
            src={`/admin/preview/course/${initial.id}`}
            title={`Learner preview of ${initial.title}`}
            refreshToken={lessonsKey}
            height={700}
            openLabel="Open preview"
          />
        </div>
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
