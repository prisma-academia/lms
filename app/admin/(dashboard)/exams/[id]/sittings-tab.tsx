"use client";

import { useState } from "react";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { FormField, TextArea, TextInput } from "@/components/form-field";
import type { ExamSittingDTO } from "@/lib/exams/admin-dto";
import { formatZoned, fromZonedInput, toZonedInput } from "@/lib/exams/zoned-time";
import { useBuilder } from "./builder-context";
import { Notice, SectionHeading, intOrNull } from "./ui";

export function SittingsTab() {
  const { exam, canWrite, timeZone } = useBuilder();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionHeading
          title="Sittings"
          action={
            canWrite && editing !== "new" ? (
              <Button type="button" size="sm" onClick={() => setEditing("new")}>
                <Icon name="plus" aria-hidden />
                Add sitting
              </Button>
            ) : undefined
          }
        >
          A sitting is one batch of candidates: a time slot, a venue and, for an exam centre, the network they must sit from. Use them when not everyone sits at once. Times are in {timeZone}.
        </SectionHeading>

        {editing === "new" ? <SittingForm sitting={null} onDone={() => setEditing(null)} /> : null}

        {exam.sittings.length === 0 && editing !== "new" ? (
          <EmptyState icon="calendar" title="No sittings">
            Without sittings everyone uses the exam&apos;s own window. Add one per session, room or centre.
          </EmptyState>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {exam.sittings.map((s) =>
              editing === s.id ? (
                <li key={s.id}>
                  <SittingForm sitting={s} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <SittingRow key={s.id} sitting={s} onEdit={() => setEditing(s.id)} />
              )
            )}
          </ul>
        )}
      </Card>
      {exam.security.enforceIpAllowlist ? null : (
        <Notice tone="warn">IP ranges are not being enforced for this exam. Turn on “Enforce sitting IP ranges” on the Security tab for them to take effect.</Notice>
      )}
    </div>
  );
}

function SittingRow({ sitting, onEdit }: { sitting: ExamSittingDTO; onEdit: () => void }) {
  const { exam, reload, canWrite, timeZone } = useBuilder();
  const confirm = useConfirm();
  const { toast } = useToast();
  const full = sitting.capacity != null && sitting.candidateCount > sitting.capacity;

  async function remove() {
    if (
      !(await confirm({
        title: `Delete the sitting “${sitting.name}”?`,
        description: sitting.candidateCount
          ? `Its ${sitting.candidateCount} ${sitting.candidateCount === 1 ? "candidate stays" : "candidates stay"} on the exam without a sitting, and follow the exam's own window.`
          : "No candidates are in it.",
        confirmLabel: "Delete sitting",
        destructive: true,
      }))
    )
      return;
    const res = await apiDelete(`/api/tenant/exams/${exam.id}/sittings/${sitting.id}`);
    if (res.error) return toast(res.error.message);
    toast("Sitting deleted.");
    await reload();
  }

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-[12px] border-2 border-border bg-background p-3.5">
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex flex-wrap items-center gap-2 font-heading text-base">
          {sitting.name}
          {sitting.pausedAt ? <Badge color="var(--warning)">Paused</Badge> : null}
        </p>
        <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
          {formatZoned(sitting.startsAt, timeZone, "Exam window")} → {formatZoned(sitting.endsAt, timeZone, "exam close")}
          {sitting.venue ? ` · ${sitting.venue}` : ""}
        </p>
        <p className="num mt-1 text-[13px] font-bold">
          {sitting.candidateCount}
          {sitting.capacity != null ? ` / ${sitting.capacity}` : ""} {sitting.candidateCount === 1 ? "candidate" : "candidates"}
          {full ? <span className="ml-1 text-destructive">— over capacity</span> : null}
        </p>
        {sitting.ipAllowlist.length ? (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs font-medium text-muted-foreground">
            <Icon name="lock" className="size-3.5" aria-hidden />
            Only from:
            {sitting.ipAllowlist.map((ip) => (
              <code key={ip} className="rounded-[4px] border border-border bg-card px-1 font-mono text-foreground">
                {ip}
              </code>
            ))}
          </p>
        ) : (
          <p className="mt-1 text-xs font-medium text-muted-foreground">From any network.</p>
        )}
      </div>
      {canWrite ? (
        <div className="flex shrink-0 gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label={`Delete ${sitting.name}`} onClick={remove}>
            <Icon name="trash" aria-hidden />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function SittingForm({ sitting, onDone }: { sitting: ExamSittingDTO | null; onDone: () => void }) {
  const { exam, reload, timeZone } = useBuilder();
  const { toast } = useToast();
  const [name, setName] = useState(sitting?.name ?? "");
  const [venue, setVenue] = useState(sitting?.venue ?? "");
  const [capacity, setCapacity] = useState(sitting?.capacity != null ? String(sitting.capacity) : "");
  const [startsAt, setStartsAt] = useState(toZonedInput(sitting?.startsAt, timeZone));
  const [endsAt, setEndsAt] = useState(toZonedInput(sitting?.endsAt, timeZone));
  const [ips, setIps] = useState((sitting?.ipAllowlist ?? []).join("\n"));
  const [errors, setErrors] = useState<{ name?: string; endsAt?: string; capacity?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const uid = sitting?.id ?? "new";

  async function save() {
    const e: typeof errors = {};
    if (!name.trim()) e.name = "Name the sitting, e.g. “Morning — Hall A”.";
    const s = startsAt ? fromZonedInput(startsAt, timeZone) : null;
    const en = endsAt ? fromZonedInput(endsAt, timeZone) : null;
    if (s && en && en <= s) e.endsAt = "Must be after the start.";
    const cap = intOrNull(capacity);
    if (capacity.trim() && (cap == null || cap < 1)) e.capacity = "A whole number, 1 or more.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = {
      name: name.trim(),
      venue: venue.trim() || null,
      capacity: cap,
      startsAt: s,
      endsAt: en,
      ipAllowlist: ips
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    };
    const res = sitting
      ? await apiPatch(`/api/tenant/exams/${exam.id}/sittings/${sitting.id}`, body)
      : await apiPost(`/api/tenant/exams/${exam.id}/sittings`, body);
    setBusy(false);
    if (res.error) return setErrors({ form: res.error.message });
    toast(sitting ? "Sitting saved." : "Sitting added.");
    await reload();
    onDone();
  }

  return (
    <div className="mt-2 grid gap-4 rounded-[12px] border-2 border-border bg-background p-4">
      <p className="font-heading text-base">{sitting ? `Edit ${sitting.name}` : "New sitting"}</p>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_140px]">
        <FormField label="Name" htmlFor={`st-${uid}-name`} error={errors.name} required>
          <TextInput id={`st-${uid}-name`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Venue (optional)" htmlFor={`st-${uid}-venue`}>
          <TextInput id={`st-${uid}-venue`} value={venue} maxLength={200} placeholder="e.g. ICT Centre, Room 2" onChange={(e) => setVenue(e.target.value)} />
        </FormField>
        <FormField label="Seats (optional)" htmlFor={`st-${uid}-cap`} error={errors.capacity}>
          <TextInput id={`st-${uid}-cap`} type="number" inputMode="numeric" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Starts" htmlFor={`st-${uid}-start`} hint="Empty = the exam's opening time.">
          <TextInput id={`st-${uid}-start`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </FormField>
        <FormField label="Ends" htmlFor={`st-${uid}-end`} error={errors.endsAt} hint="Attempts in this sitting are cut off here (extra time is honoured).">
          <TextInput id={`st-${uid}-end`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </FormField>
      </div>
      <FormField
        label="Allowed networks (optional)"
        htmlFor={`st-${uid}-ips`}
        hint="One per line: an address (102.89.12.7) or a range (41.58.10.0/24, 2001:db8::/32). Use the centre's public address — ask its IT staff, or search “what is my IP” on a centre computer. Empty = any network."
      >
        <TextArea id={`st-${uid}-ips`} value={ips} className="min-h-24 font-mono text-[13px]" spellCheck={false} onChange={(e) => setIps(e.target.value)} />
      </FormField>
      {errors.form ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {errors.form}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : sitting ? "Save sitting" : "Add sitting"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
