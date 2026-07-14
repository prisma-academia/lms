"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

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

const DAY_MS = 86400000;

function dueBadge(dueAt: string | null) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const now = new Date();
  const days = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      DAY_MS
  );
  let text: string;
  let color: string;
  if (days < 0) {
    text = "Past due";
    color = "var(--ink-35)";
  } else if (days === 0) {
    text = "Due today";
    color = "var(--red)";
  } else if (days === 1) {
    text = "Due tomorrow";
    color = "var(--red)";
  } else if (days <= 4) {
    text = `Due in ${days} days`;
    color = "var(--orange)";
  } else {
    text = `Due in ${days} days`;
    color = "var(--ink-60)";
  }
  return (
    <span className="num text-[12px] font-bold" style={{ color }}>
      {text}
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
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isText = assignment.type === "TEXT";
  const isFile = assignment.type === "FILE";
  const placeholder = isText ? "Write your answer…" : "https://link-to-your-work";

  async function submit() {
    setErr(null);
    if (isFile) {
      if (!file) {
        setErr("Choose a file to upload.");
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
      toast(`Submitted: "${assignment.title}"`);
      setOpen(false);
      setFile(null);
      onSubmitted();
      return;
    }

    if (!value.trim()) {
      setErr("Add your work before submitting.");
      return;
    }
    setBusy(true);
    const payload = isText ? { textBody: value } : { linkUrl: value };
    const res = await apiPost(`/api/client/assignments/${assignment.id}/submit`, payload);
    setBusy(false);
    if (!report(res, () => submit())) return;
    celebrate();
    toast(`Submitted: "${assignment.title}"`);
    setOpen(false);
    setValue("");
    onSubmitted();
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Icon name="upload" /> Submit
      </Button>
    );
  }

  return (
    <div className="mt-2 w-full">
      {isFile ? (
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded-[10px] border-2 border-ink bg-card px-3 py-2 text-sm"
        />
      ) : isText ? (
        <TextArea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
        />
      ) : (
        <TextInput
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
        />
      )}
      {err ? <p className="mt-1 text-xs font-bold text-red">{err}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy ? "Submitting…" : "Submit work"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AssignmentsClient() {
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
    setItems(res.data?.assignments ?? []);
  }, [report]);

  useEffect(() => {
    loadRef.current = load;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state only after await, not synchronously
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="rounded-[14px] border-2 border-ink bg-card p-5 shadow-brutal">
        <p className="text-sm font-bold text-red">{error}</p>
      </div>
    );
  }
  if (!items) return <Spinner label="Loading tasks…" />;

  const todo = items.filter((a) => !a.submission);
  const done = items.filter((a) => a.submission);
  const total = items.length;
  const progress = total === 0 ? 0 : (done.length / total) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-[14px] border-2 border-ink bg-card p-4"
        style={{ boxShadow: "5px 5px 0 var(--green)" }}
      >
        <div className="mb-2 flex items-center justify-between text-[13px] font-bold">
          <span className="num">
            {done.length} of {total} submitted
          </span>
          <span className="num text-ink/60">{Math.round(progress)}%</span>
        </div>
        <ProgressBar value={progress} color="var(--green)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal">
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em]">
            To do
          </h3>
          {todo.length === 0 ? (
            <EmptyState icon="check-circle">
              Nothing to submit. Go outside.
            </EmptyState>
          ) : (
            <div className="divide-dash">
              {todo.map((a) => (
                <div key={a.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 size-4 shrink-0 rounded-[6px] border-2 border-ink"
                      style={{ background: courseAccent(a.course.id) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold">{a.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge color={courseAccent(a.course.id)}>
                          {a.course.title}
                        </Badge>
                        {dueBadge(a.dueAt)}
                      </div>
                    </div>
                  </div>
                  {a.description ? (
                    <p className="pl-7 text-[12.5px] font-medium text-ink/60">
                      {a.description}
                    </p>
                  ) : null}
                  <div className="pl-7">
                    <SubmitForm assignment={a} onSubmitted={load} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="rounded-[14px] border-2 border-ink bg-card p-4"
          style={{ boxShadow: "5px 5px 0 var(--green)" }}
        >
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em]">
            Done
          </h3>
          {done.length === 0 ? (
            <EmptyState icon="clipboard">
              Nothing submitted yet — the day is young.
            </EmptyState>
          ) : (
            <div className="divide-dash">
              {done.map((a) => {
                const grade = a.submission?.grade;
                return (
                  <div key={a.id} className="flex items-center gap-3 py-3">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-ink",
                        "bg-green text-ink"
                      )}
                    >
                      <Icon name="check" className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold">
                        {a.title}
                      </div>
                      <div className="truncate text-[12px] font-medium text-ink/60">
                        {a.course.title}
                      </div>
                    </div>
                    {grade ? (
                      <Badge color="var(--yellow)" rotate>
                        {grade.points}/{grade.maxPoints}
                      </Badge>
                    ) : (
                      <Badge color="var(--blue)">Submitted</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
