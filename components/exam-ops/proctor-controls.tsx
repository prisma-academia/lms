"use client";

import { useCallback, useState, type ReactNode } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { FormField, TextArea, TextInput } from "@/components/form-field";

/**
 * Invigilator actions, shared by the live room and the attempt review: one
 * attempt or many, with the questions each action needs asked first (how many
 * minutes, why end it) and a confirmation before anything that cannot be
 * undone.
 */

export type ProctorActionName = "extend" | "pause" | "resume" | "unlock" | "reset_device" | "submit" | "terminate";

export type ProctorTarget = { attemptId: string; name: string };

export const ACTION_LABEL: Record<ProctorActionName, string> = {
  extend: "Extra time",
  pause: "Pause",
  resume: "Resume",
  unlock: "Unlock",
  reset_device: "Move to another device",
  submit: "Force submit",
  terminate: "Terminate",
};

const DONE: Record<ProctorActionName, string> = {
  extend: "Extra time given",
  pause: "Paused",
  resume: "Resumed",
  unlock: "Unlocked",
  reset_device: "They can now open the exam on another device",
  submit: "Submitted",
  terminate: "Attempt ended",
};

type Pending = { action: "extend" | "terminate"; targets: ProctorTarget[] };

function who(targets: ProctorTarget[]) {
  return targets.length === 1 ? targets[0].name : `${targets.length} candidates`;
}

export function useProctorControls(examId: string, onChanged: () => void) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [minutes, setMinutes] = useState("10");
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const send = useCallback(
    async (action: ProctorActionName, targets: ProctorTarget[], extra: { minutes?: number; note?: string } = {}) => {
      setBusy(true);
      const res =
        targets.length === 1
          ? await apiPost<{ action: string }>(`/api/tenant/exams/${examId}/attempts/${targets[0].attemptId}/actions`, { action, ...extra })
          : await apiPost<{ applied: number; failed: { attemptId: string; message: string }[] }>(`/api/tenant/exams/${examId}/live/bulk`, {
              attemptIds: targets.map((t) => t.attemptId),
              action,
              ...extra,
            });
      setBusy(false);
      if (res.error) {
        toast(res.error.message);
        return false;
      }
      const data = res.data as { applied?: number; failed?: unknown[] } | null;
      if (data && typeof data.applied === "number") {
        const failed = data.failed?.length ?? 0;
        toast(`${DONE[action]}: ${data.applied} of ${targets.length}${failed ? ` (${failed} could not be changed)` : ""}.`);
      } else {
        toast(`${DONE[action]} — ${who(targets)}.`);
      }
      onChanged();
      return true;
    },
    [examId, onChanged, toast]
  );

  const run = useCallback(
    async (action: ProctorActionName, targets: ProctorTarget[]) => {
      if (!targets.length || busy) return;
      if (action === "extend" || action === "terminate") {
        setMinutes("10");
        setNote("");
        setFieldError(null);
        setPending({ action, targets });
        return;
      }
      if (action === "submit") {
        const yes = await confirm({
          title: `Submit the exam for ${who(targets)}?`,
          description: "Their saved answers are submitted now and marked. They cannot continue. This cannot be undone.",
          confirmLabel: "Force submit",
          destructive: true,
        });
        if (!yes) return;
      }
      if (action === "reset_device") {
        const yes = await confirm({
          title: `Let ${who(targets)} continue on another device?`,
          description: "The attempt is released from the computer it started on. The next device to open it with the candidate's sign-in takes it over.",
          confirmLabel: "Allow new device",
        });
        if (!yes) return;
      }
      await send(action, targets);
    },
    [busy, confirm, send]
  );

  async function submitDialog() {
    if (!pending) return;
    if (pending.action === "extend") {
      const m = Number(minutes);
      if (!Number.isInteger(m) || m < 1 || m > 120) return setFieldError("Enter a whole number of minutes from 1 to 120.");
      if (await send("extend", pending.targets, { minutes: m })) setPending(null);
      return;
    }
    const reason = note.trim();
    if (reason.length < 3) return setFieldError("Say why the attempt is being ended. It is kept in the integrity log.");
    if (await send("terminate", pending.targets, { note: reason })) setPending(null);
  }

  const dialogs: ReactNode = (
    <Dialog open={pending !== null} onOpenChange={(o) => (o ? undefined : setPending(null))}>
      {pending ? (
        <DialogContent className="max-w-md">
          <DialogTitle>{pending.action === "extend" ? `Extra time for ${who(pending.targets)}` : `End the attempt for ${who(pending.targets)}?`}</DialogTitle>
          <DialogDescription>
            {pending.action === "extend"
              ? "The minutes are added to their deadline straight away. Their exam window shows the new time within a few seconds."
              : "The attempt is ended and submitted as it stands, marked as terminated by an invigilator. This cannot be undone."}
          </DialogDescription>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitDialog();
            }}
          >
            {pending.action === "extend" ? (
              <FormField label="Minutes to add" htmlFor="proctor-minutes" error={fieldError ?? undefined} hint="1 to 120 minutes." required>
                <TextInput
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  step={1}
                  value={minutes}
                  autoFocus
                  onChange={(e) => {
                    setMinutes(e.target.value);
                    setFieldError(null);
                  }}
                />
              </FormField>
            ) : (
              <FormField label="Reason" htmlFor="proctor-note" error={fieldError ?? undefined} hint="Recorded in the integrity log and the activity log." required>
                <TextArea
                  value={note}
                  autoFocus
                  maxLength={500}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setFieldError(null);
                  }}
                />
              </FormField>
            )}
            {pending.action === "extend" ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quick choices">
                {[5, 10, 15, 30].map((m) => (
                  <Button key={m} type="button" size="xs" variant="outline" onClick={() => setMinutes(String(m))}>
                    +{m} min
                  </Button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button type="submit" variant={pending.action === "terminate" ? "destructive" : "default"} disabled={busy}>
                {pending.action === "extend" ? "Add time" : "Terminate attempt"}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );

  return { run, busy, dialogs };
}

/** Which actions make sense for an attempt in this state. */
export function actionsFor(status: string, paused: boolean): ProctorActionName[] {
  const open = status === "IN_PROGRESS" || status === "PAUSED" || status === "LOCKED";
  if (!open) return [];
  const list: ProctorActionName[] = ["extend"];
  if (status === "PAUSED") list.push("resume");
  else if (!paused) list.push("pause");
  if (status === "LOCKED") list.push("unlock");
  list.push("reset_device", "submit", "terminate");
  return list;
}
