"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";

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

function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function EventForm({
  mode,
  id,
  initial,
  clients,
  groups,
  audienceLabel,
  canWrite,
}: {
  mode: "create" | "edit";
  id?: string;
  initial: EventInitial;
  clients: Option[];
  groups: Option[];
  audienceLabel?: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof EventInitial>(k: K, value: EventInitial[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  async function submit() {
    setError(null);
    setInfo(null);
    if (!v.title.trim()) return setError("Title is required.");
    const startIso = toIso(v.startAt);
    if (!startIso) return setError("A valid start date/time is required.");

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
      router.push("/admin/events");
    } else {
      setInfo("Saved.");
      router.refresh();
    }
  }

  async function onDelete() {
    if (!confirm("Delete this event?")) return;
    const res = await apiDelete(`/api/tenant/events/${id}`);
    if (res.error) return setError(res.error.message);
    router.push("/admin/events");
  }

  return (
    <div className="grid max-w-xl gap-4">
      <FormField label="Title" htmlFor="e-title">
        <TextInput id="e-title" value={v.title} onChange={(e) => set("title", e.target.value)} disabled={!canWrite} />
      </FormField>
      <FormField label="Description" htmlFor="e-desc">
        <TextArea id="e-desc" value={v.description} onChange={(e) => set("description", e.target.value)} disabled={!canWrite} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Type" htmlFor="e-type">
          <SelectInput id="e-type" allowEmpty={false} options={TYPE_OPTIONS} value={v.type} onChange={(e) => set("type", e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField label="Repeats" htmlFor="e-recur">
          <SelectInput id="e-recur" allowEmpty={false} options={RECUR_OPTIONS} value={v.recurrence} onChange={(e) => set("recurrence", e.target.value)} disabled={!canWrite} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Starts" htmlFor="e-start">
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
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Location (optional)" htmlFor="e-loc">
          <TextInput id="e-loc" value={v.location} onChange={(e) => set("location", e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField label="URL (optional)" htmlFor="e-url">
          <TextInput id="e-url" value={v.url} onChange={(e) => set("url", e.target.value)} disabled={!canWrite} />
        </FormField>
      </div>

      {mode === "create" ? (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Audience" htmlFor="e-aud">
            <SelectInput
              id="e-aud"
              allowEmpty={false}
              options={[
                { value: "ALL", label: "All clients" },
                { value: "CLIENT", label: "A client" },
                { value: "GROUP", label: "A client group" },
              ]}
              value={v.audience}
              onChange={(e) => set("audience", e.target.value as EventInitial["audience"])}
            />
          </FormField>
          {v.audience === "CLIENT" ? (
            <FormField label="Client" htmlFor="e-client">
              <SelectInput id="e-client" placeholder="Select a client…" options={clients} value={v.clientId} onChange={(e) => set("clientId", e.target.value)} />
            </FormField>
          ) : v.audience === "GROUP" ? (
            <FormField label="Client group" htmlFor="e-group">
              <SelectInput id="e-group" placeholder="Select a group…" options={groups} value={v.clientGroupId} onChange={(e) => set("clientGroupId", e.target.value)} />
            </FormField>
          ) : null}
        </div>
      ) : (
        <div className="text-sm">
          <span className="text-stone-500">Audience: </span>
          <span className="font-semibold">{audienceLabel}</span>
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
      {canWrite ? (
        <div className="flex gap-3">
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : mode === "create" ? "Create event" : "Save"}
          </Button>
          {mode === "edit" ? (
            <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
