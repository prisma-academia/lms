"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client/api";
import { FormField, SelectInput } from "@/components/form-field";
import type { ExamListRow } from "@/lib/exams/admin-dto";
import { EXAM_STATUS_LABEL } from "@/lib/exams/admin-dto";

/**
 * Choose the exam an EXAM lesson opens. Loaded when shown, so the course page
 * does not pay for the exam list on every visit; staff without exam access
 * are told so instead of seeing an empty list.
 */
export function ExamLessonPicker({
  value,
  onChange,
  courseId,
}: {
  value: string;
  onChange: (examId: string) => void;
  courseId: string;
}) {
  const [exams, setExams] = useState<ExamListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void apiGet<ExamListRow[]>("/api/tenant/exams").then((res) => {
      if (!live) return;
      if (res.error) {
        setError(
          res.status === 403
            ? "You do not have access to exams. Ask an administrator to attach the exam."
            : res.error.message
        );
        return;
      }
      setExams((res.data ?? []).filter((e) => e.status !== "ARCHIVED" || e.id === value));
    });
    return () => {
      live = false;
    };
    // Loaded once per open of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = (exams ?? []).map((e) => ({
    value: e.id,
    label: `${e.title}${e.code ? ` (${e.code})` : ""} — ${EXAM_STATUS_LABEL[e.status]}`,
  }));
  const chosen = exams?.find((e) => e.id === value);

  return (
    <FormField
      label="Exam"
      htmlFor="lesson-dialog-exam"
      error={error ?? undefined}
      hint={
        chosen && chosen.status !== "PUBLISHED"
          ? "This exam is not published yet: learners will see it as unavailable until it is."
          : "The lesson opens the exam's own locked window. Its window, pass mark and security come from the exam."
      }
    >
      {exams === null && !error ? (
        <p className="text-xs font-medium text-muted-foreground" role="status">
          Loading exams…
        </p>
      ) : exams && exams.length === 0 ? (
        <p className="text-xs font-medium text-muted-foreground">
          There are no exams yet.{" "}
          <Link href={`/admin/exams/new?courseId=${courseId}`} className="font-bold underline underline-offset-2">
            Create one
          </Link>
          , then come back to attach it.
        </p>
      ) : exams ? (
        <SelectInput
          id="lesson-dialog-exam"
          placeholder="Choose an exam…"
          options={options}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <span />
      )}
    </FormField>
  );
}
