"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { zonedInputToIso } from "@/lib/time/zoned-input";

type Option = { value: string; label: string };

const TYPE_OPTIONS = [
  { value: "LIVE_SESSION", label: "Live session" },
  { value: "DEADLINE", label: "Deadline" },
  { value: "REMINDER", label: "Reminder" },
  { value: "ANNOUNCEMENT", label: "Announcement" },
];
const RECUR_OPTIONS = [
  { value: "NONE", label: "Does not repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

export type EventInitial = {
  title: string;
  description: string;
  type: string;
  startAt: string; // local datetime input value
  endAt: string;
  location: string;
  url: string;
  audience: "ALL" | "CLIENT" | "GROUP";
  clientId: string;
  clientGroupId: string;
  recurrence: string;
  recurrenceUntil: string;
};


export function EventForm({
  mode,
  id,
  initial,
  clients,
  groups,
  audienceLabel,
  canWrite,
  timeZone,
}: {
  mode: "create" | "edit";
  id?: string;
  initial: EventInitial;
  clients: Option[];
  groups: Option[];
  audienceLabel?: string;
  canWrite: boolean;
  /** The academy's time zone: the clock every time in this form is on. */
  timeZone: string;
}) {
  // Read on the academy's clock, exactly as the page filled the fields — not
  // on this browser's, which may be in another zone.
  const toIso = (local: string) => zonedInputToIso(local, timeZone);
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function set<K extends keyof EventInitial>(k: K, value: EventInitial[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  async function submit() {
    setError(null);
    if (!v.title.trim()) return setError("Give the event a title.");
    const startIso = toIso(v.startAt);
    if (!startIso) return setError("Choose when the event starts.");
    const endIso = toIso(v.endAt);
    if (endIso && endIso < startIso) return setError("The event cannot end before it starts.");
    if (mode === "create" && v.audience === "CLIENT" && !v.clientId) {
      return setError("Choose the learner this event is for.");
    }
    if (mode === "create" && v.audience === "GROUP" && !v.clientGroupId) {
      return setError("Choose the learner group this event is for.");
    }

    setPending(true);
    const common = {
      title: v.title.trim(),
      description: v.description.trim() || null,
      type: v.type,
      startAt: startIso,
      endAt: toIso(v.endAt),
      location: v.location.trim() || null,
      url: v.url.trim() || null,
      recurrence: v.recurrence,
      recurrenceUntil: toIso(v.recurrenceUntil),
    };

    let res;
    if (mode === "create") {
      res = await apiPost<{ event: { id: string } }>("/api/tenant/events", {
        ...common,
        audience: v.audience,
        clientId: v.audience === "CLIENT" ? v.clientId : null,
        clientGroupId: v.audience === "GROUP" ? v.clientGroupId : null,
      });
    } else {
      res = await apiPatch(`/api/tenant/events/${id}`, common);
    }
    setPending(false);
    if (res.error) return setError(res.error.message);
    if (mode === "create") {
      toast("Event added to the calendar.");
      router.push("/admin/events");
    } else {
      toast("Event saved.");
      router.refresh();
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Delete “${initial.title}”?`,
      description:
        initial.recurrence !== "NONE"
          ? "This removes the event and every repeat of it from everyone's calendar. This cannot be undone."
          : "This removes the event from everyone's calendar. This cannot be undone.",
      confirmLabel: "Delete event",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setDeleting(true);
    const res = await apiDelete(`/api/tenant/events/${id}`);
    if (res.error) {
      setDeleting(false);
      return setError(res.error.message);
    }
    toast("Event deleted.");
    router.push("/admin/events");
  }

  return (
    <div className="grid max-w-xl gap-4">
      <FormField label="Title" htmlFor="e-title">
        <TextInput id="e-title" autoComplete="off" value={v.title} onChange={(e) => set("title", e.target.value)} disabled={!canWrite} />
      </FormField>
      <FormField label="Description (optional)" htmlFor="e-desc">
        <TextArea id="e-desc" value={v.description} onChange={(e) => set("description", e.target.value)} disabled={!canWrite} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Type" htmlFor="e-type">
          <SelectInput id="e-type" allowEmpty={false} options={TYPE_OPTIONS} value={v.type} onChange={(e) => set("type", e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField label="Repeats" htmlFor="e-recur">
          <SelectInput id="e-recur" allowEmpty={false} options={RECUR_OPTIONS} value={v.recurrence} onChange={(e) => set("recurrence", e.target.value)} disabled={!canWrite} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Starts" htmlFor="e-start" hint={`Times are in the academy's time zone (${timeZone.replace(/_/g, " ")}).`}>
          <TextInput id="e-start" type="datetime-local" value={v.startAt} onChange={(e) => set("startAt", e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField label="Ends (optional)" htmlFor="e-end">
          <TextInput id="e-end" type="datetime-local" value={v.endAt} onChange={(e) => set("endAt", e.target.value)} disabled={!canWrite} />
        </FormField>
      </div>
      {v.recurrence !== "NONE" ? (
        <FormField label="Repeat until (optional)" htmlFor="e-until">
          <TextInput id="e-until" type="datetime-local" value={v.recurrenceUntil} onChange={(e) => set("recurrenceUntil", e.target.value)} disabled={!canWrite} />
        </FormField>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Location (optional)" htmlFor="e-loc">
          <TextInput id="e-loc" autoComplete="off" value={v.location} onChange={(e) => set("location", e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField label="Link (optional)" htmlFor="e-url" hint="For example, the meeting link for a live session.">
          <TextInput id="e-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://…" value={v.url} onChange={(e) => set("url", e.target.value)} disabled={!canWrite} />
        </FormField>
      </div>

      {mode === "create" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Who is it for" htmlFor="e-aud">
            <SelectInput
              id="e-aud"
              allowEmpty={false}
              options={[
                { value: "ALL", label: "All learners" },
                { value: "CLIENT", label: "One learner" },
                { value: "GROUP", label: "A learner group" },
              ]}
              value={v.audience}
              onChange={(e) => set("audience", e.target.value as EventInitial["audience"])}
            />
          </FormField>
          {v.audience === "CLIENT" ? (
            <FormField label="Learner" htmlFor="e-client">
              <SelectInput id="e-client" placeholder="Choose a learner…" options={clients} value={v.clientId} onChange={(e) => set("clientId", e.target.value)} />
            </FormField>
          ) : v.audience === "GROUP" ? (
            <FormField
              label="Learner group"
              htmlFor="e-group"
              hint={groups.length === 0 ? "There are no learner groups yet." : undefined}
            >
              <SelectInput id="e-group" placeholder="Choose a group…" options={groups} value={v.clientGroupId} onChange={(e) => set("clientGroupId", e.target.value)} />
            </FormField>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-medium">
          <span className="text-muted-foreground">Who it is for: </span>
          <span className="font-bold text-foreground">{audienceLabel}</span>
          <span className="block text-xs text-muted-foreground">
            This cannot be changed once the event exists. To send it to someone else, create a new
            event.
          </span>
        </p>
      )}

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {canWrite ? (
        // The destructive action sits apart from Save, at the far end.
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" onClick={submit} disabled={pending || deleting}>
            {pending ? "Saving…" : mode === "create" ? "Add to calendar" : "Save changes"}
          </Button>
          {mode === "edit" ? (
            <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting || pending}>
              {deleting ? "Deleting…" : "Delete event"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
