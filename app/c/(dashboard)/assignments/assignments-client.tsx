"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/client/api";
import { uploadViaPresign } from "@/lib/client/upload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { TextArea, TextInput } from "@/components/form-field";
import { Spinner } from "@/components/spinner";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";
import { courseAccent } from "@/lib/ui/course-color";
import { formatDate, formatDateTime, type FormatContext } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DUE_TONE_COLOR, daysBetween, dueLabel } from "../_lib/zoned";

type Grade = { points: number; maxPoints: number; feedback: string | null };
type Submission = {
  id: string;
  status: "SUBMITTED" | "GRADED" | "RETURNED";
  textBody: string | null;
  linkUrl: string | null;
  submittedAt: string;
  grade: Grade | null;
};
type ClientAssignment = {
  id: string;
  title: string;
  description: string | null;
  type: "TEXT" | "FILE" | "LINK";
  maxPoints: number;
  dueAt: string | null;
  course: { id: string; title: string; slug: string };
  submission: Submission | null;
};

const SECTION_HEADING = "mb-2 text-[13px] font-bold text-foreground";

/**
 * When it is due, said two ways: how far off ("Due tomorrow") and exactly when,
 * in the academy's own time zone. The colour is a hint; the words carry it.
 */
function DueLine({ dueAt, format }: { dueAt: string | null; format: FormatContext }) {
  if (!dueAt) return null;
  // Only ever rendered after the list has loaded in the browser, so reading the
  // clock here cannot disagree with a server render.
  const info = dueLabel(daysBetween(new Date(), dueAt, format.timeZone ?? "UTC"));
  return (
    <span className="text-[12px] font-bold">
      <span className="num" style={{ color: DUE_TONE_COLOR[info.tone] }}>
        {info.text}
      </span>
      <span className="font-medium text-muted-foreground"> · {formatDateTime(dueAt, format)}</span>
    </span>
  );
}

function SubmitForm({
  assignment,
  onSubmitted,
}: {
  assignment: ClientAssignment;
  onSubmitted: () => void;
}) {
  const { toast, celebrate } = useToast();
  const report = useApiError();
  const uid = useId();
  const fieldId = `${uid}-work`;
  const errorId = `${uid}-error`;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isText = assignment.type === "TEXT";
  const isFile = assignment.type === "FILE";
  const fieldLabel = isFile ? "Your file" : isText ? "Your answer" : "Link to your work";

  /** Show the problem next to the field and put the cursor back in it. */
  function fail(message: string) {
    setErr(message);
    document.getElementById(fieldId)?.focus();
  }

  async function submit() {
    setErr(null);
    if (isFile) {
      if (!file) {
        fail("Choose a file to upload.");
        return;
      }
      setBusy(true);
      const up = await uploadViaPresign("/api/client/uploads/presign", file, {});
      if ("error" in up) {
        setBusy(false);
        // Upload failures are network PUTs (no HTTP status) — treat as retryable.
        report({ error: { code: "upload", message: up.error }, status: 0 }, () => submit());
        return;
      }
      const res = await apiPost(`/api/client/assignments/${assignment.id}/submit`, { fileKey: up.key });
      setBusy(false);
      if (!report(res, () => submit())) return;
      celebrate();
      toast(`Submitted: “${assignment.title}”`);
      setOpen(false);
      setFile(null);
      onSubmitted();
      return;
    }

    if (!value.trim()) {
      fail(isText ? "Write your answer before submitting." : "Paste the link to your work before submitting.");
      return;
    }
    setBusy(true);
    const payload = isText ? { textBody: value } : { linkUrl: value };
    const res = await apiPost(`/api/client/assignments/${assignment.id}/submit`, payload);
    setBusy(false);
    if (!report(res, () => submit())) return;
    celebrate();
    toast(`Submitted: “${assignment.title}”`);
    setOpen(false);
    setValue("");
    onSubmitted();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="min-h-11 sm:min-h-0">
        <Icon name="upload" aria-hidden /> Submit work
        <span className="sr-only"> for {assignment.title}</span>
      </Button>
    );
  }

  const described = err ? errorId : undefined;

  return (
    <form
      className="mt-1 w-full"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void submit();
      }}
    >
      <label htmlFor={fieldId} className="mb-1.5 block text-[13px] font-bold text-foreground">
        {fieldLabel}
      </label>
      {isFile ? (
        <input
          id={fieldId}
          type="file"
          aria-invalid={err ? true : undefined}
          aria-describedby={described}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErr(null);
          }}
          className="w-full rounded-[10px] border-2 border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground outline-none file:mr-3 file:rounded-[8px] file:border-2 file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      ) : isText ? (
        <TextArea
          id={fieldId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Write your answer…"
          aria-invalid={err ? true : undefined}
          aria-describedby={described}
          // Opened by the learner pressing "Submit work": the next thing they
          // do is type here.
          autoFocus
        />
      ) : (
        <TextInput
          id={fieldId}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://example.com/my-work…"
          aria-invalid={err ? true : undefined}
          aria-describedby={described}
          autoFocus
        />
      )}
      {err ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-bold text-destructive">
          {err}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} className="min-h-11 sm:min-h-0">
          {busy ? (isFile ? "Uploading…" : "Submitting…") : "Submit work"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 sm:min-h-0"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AssignmentsClient({ format }: { format: FormatContext }) {
  const [items, setItems] = useState<ClientAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const report = useApiError();
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  const load = useCallback(async () => {
    const res = await apiGet<{ assignments: ClientAssignment[] }>(
      "/api/client/assignments"
    );
    if (res.error) {
      setError(res.error.message);
      report(res, () => void loadRef.current?.());
      return;
    }
    setError(null);
    setItems(res.data?.assignments ?? []);
  }, [report]);

  useEffect(() => {
    loadRef.current = load;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state only after await, not synchronously
    void load();
  }, [load]);

  if (error && !items) {
    return (
      <div role="alert" className="rounded-[14px] border-2 border-border bg-card p-5 shadow-md">
        <p className="text-sm font-bold text-destructive">We couldn&rsquo;t load your assignments.</p>
        <p className="mt-1 text-sm font-medium text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-3" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!items) return <Spinner label="Loading assignments…" />;

  if (items.length === 0) {
    return (
      <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
        <EmptyState
          icon="clipboard"
          title="No assignments yet"
          action={
            <Button asChild size="sm">
              <Link href="/my-courses">Go to my courses</Link>
            </Button>
          }
        >
          When an instructor sets work in one of your courses, it will appear here with its
          deadline.
        </EmptyState>
      </div>
    );
  }

  const todo = items.filter((a) => !a.submission);
  const done = items.filter((a) => a.submission);
  const total = items.length;
  const progress = (done.length / total) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-[14px] border-2 border-border bg-card p-4"
        style={{ boxShadow: "5px 5px 0 var(--success)" }}
      >
        <div className="mb-2 flex items-center justify-between gap-2 text-[13px] font-bold">
          <span className="num">
            {done.length} of {total} submitted
          </span>
          <span className="num text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <ProgressBar value={progress} color="var(--success)" label="Assignments submitted" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="assignments-todo"
          className="min-w-0 rounded-[14px] border-2 border-border bg-card p-4 shadow-md"
        >
          <h2 id="assignments-todo" className={SECTION_HEADING}>
            To do
          </h2>
          {todo.length === 0 ? (
            <EmptyState icon="check-circle" title="All handed in">
              You have submitted everything that has been set. New work will appear here.
            </EmptyState>
          ) : (
            <ul className="divide-dash">
              {todo.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 rounded-[6px] border-2 border-border"
                      style={{ background: courseAccent(a.course.id) }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-[13.5px] font-bold">{a.title}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge color={courseAccent(a.course.id)} className="max-w-full">
                          <span className="min-w-0 truncate">{a.course.title}</span>
                        </Badge>
                        <span className="num text-[12px] font-bold text-muted-foreground">
                          {a.maxPoints} {a.maxPoints === 1 ? "point" : "points"}
                        </span>
                      </div>
                      <div className="mt-1">
                        <DueLine dueAt={a.dueAt} format={format} />
                      </div>
                    </div>
                  </div>
                  {a.description ? (
                    <p className="whitespace-pre-line break-words pl-7 text-[13px] font-medium leading-relaxed text-muted-foreground">
                      {a.description}
                    </p>
                  ) : null}
                  <div className="pl-7">
                    <SubmitForm assignment={a} onSubmitted={load} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="assignments-done"
          className="min-w-0 rounded-[14px] border-2 border-border bg-card p-4"
          style={{ boxShadow: "5px 5px 0 var(--success)" }}
        >
          <h2 id="assignments-done" className={SECTION_HEADING}>
            Submitted
          </h2>
          {done.length === 0 ? (
            <EmptyState icon="clipboard">
              Nothing submitted yet. Work you hand in moves here, with your mark once it is graded.
            </EmptyState>
          ) : (
            <ul className="divide-dash">
              {done.map((a) => {
                const grade = a.submission?.grade;
                return (
                  <li key={a.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-border",
                          "bg-success text-success-foreground"
                        )}
                      >
                        <Icon name="check" className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[13.5px] font-bold">{a.title}</h3>
                        <div className="truncate text-[12px] font-medium text-muted-foreground">
                          {a.course.title}
                          {a.submission ? ` · submitted ${formatDate(a.submission.submittedAt, format)}` : ""}
                        </div>
                      </div>
                      {grade ? (
                        <Badge color="var(--warning)" rotate>
                          <span className="sr-only">Mark: </span>
                          {grade.points}/{grade.maxPoints}
                        </Badge>
                      ) : (
                        <Badge color="var(--info)">Awaiting mark</Badge>
                      )}
                    </div>
                    {grade?.feedback ? (
                      <p className="mt-2 whitespace-pre-line break-words rounded-[10px] border-2 border-dashed border-border bg-background px-3 py-2 text-[13px] font-medium leading-relaxed text-foreground">
                        <span className="font-bold">Feedback: </span>
                        {grade.feedback}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
