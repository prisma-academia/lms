"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { apiDelete, apiPost } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { SelectInput, TextInput } from "@/components/form-field";
import { ATTEMPT_STATUS_LABEL, type CandidateRow, type IssuedPin } from "@/lib/exams/admin-dto";
import { useBuilder } from "./builder-context";
import { AddCandidatesDialog, EditCandidateDialog, PinsDialog, type AddMode, type AddResult } from "./candidate-dialogs";
import { Notice } from "./ui";

const ADD_OPTIONS: { mode: AddMode; label: string; icon: "user" | "users" | "book" | "user-check" | "upload" }[] = [
  { mode: "learners", label: "Learners", icon: "user" },
  { mode: "group", label: "A group", icon: "users" },
  { mode: "course", label: "Course enrollees", icon: "book" },
  { mode: "external", label: "External people", icon: "user-check" },
  { mode: "csv", label: "Import CSV", icon: "upload" },
];

export function CandidatesTab() {
  const { exam, candidates, reload, reloadCandidates, canWrite } = useBuilder();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [mode, setMode] = useState<AddMode | null>(null);
  const [editing, setEditing] = useState<CandidateRow | null>(null);
  const [pins, setPins] = useState<{ title: string; issued: IssuedPin[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sittingFilter, setSittingFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ tone: "ok" | "warn"; text: string; skipped?: AddResult["skipped"] } | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter(
      (c) =>
        (!sittingFilter || (sittingFilter === "none" ? !c.sittingId : c.sittingId === sittingFilter)) &&
        (!q || [c.fullName, c.email, c.regNumber, c.candidateNo].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [candidates, search, sittingFilter]);

  const selectedRows = candidates.filter((c) => selected.has(c.id));
  const scopeIds = selectedRows.length ? selectedRows.map((c) => c.id) : undefined;
  const scopeLabel = selectedRows.length ? `${selectedRows.length} selected` : "everyone";
  const allVisibleOn = visible.length > 0 && visible.every((c) => selected.has(c.id));
  const someVisibleOn = visible.some((c) => selected.has(c.id));

  async function refresh() {
    await Promise.all([reloadCandidates(), reload()]);
  }

  async function onAdded(r: AddResult) {
    await refresh();
    const parts = [`${r.added} ${r.added === 1 ? "candidate" : "candidates"} added`];
    if (r.alreadyListed) parts.push(`${r.alreadyListed} already on the list`);
    if (r.skipped.length) parts.push(`${r.skipped.length} skipped`);
    setReport({ tone: r.skipped.length ? "warn" : "ok", text: `${parts.join(", ")}.`, skipped: r.skipped });
    if (r.issued.length) setPins({ title: `PINs for ${r.issued.length} new ${r.issued.length === 1 ? "candidate" : "candidates"}`, issued: r.issued });
  }

  async function resetPins() {
    const n = scopeIds?.length ?? candidates.length;
    if (
      !(await confirm({
        title: `Issue new PINs for ${scopeLabel}?`,
        description: `${n} ${n === 1 ? "PIN is" : "PINs are"} replaced. The old ones stop working immediately — any slips already printed or emailed become useless.`,
        confirmLabel: "Issue new PINs",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    const res = await apiPost<{ issued: IssuedPin[] }>(`/api/tenant/exams/${exam.id}/candidates/pins`, { candidateIds: scopeIds });
    setBusy(false);
    if (res.error) return toast(res.error.message);
    await reloadCandidates();
    setPins({ title: `New PINs for ${res.data!.issued.length} ${res.data!.issued.length === 1 ? "candidate" : "candidates"}`, issued: res.data!.issued });
  }

  async function emailSlips() {
    const pool = selectedRows.length ? selectedRows : candidates;
    const withEmail = pool.filter((c) => c.email && c.status === "ACTIVE").length;
    if (!withEmail) return toast("None of these candidates has an email address (or they are not active).");
    if (
      !(await confirm({
        title: `Email slips to ${withEmail} ${withEmail === 1 ? "candidate" : "candidates"}?`,
        description: "Each gets a new PIN with their Exam ID, the sign-in link and when and where to sit. Their old PIN stops working. Candidates without an email are not touched.",
        confirmLabel: "Send slips",
      }))
    )
      return;
    setBusy(true);
    const res = await apiPost<{ sent: number; failed: number; noEmail: number; inactive: number }>(`/api/tenant/exams/${exam.id}/candidates/email-slips`, { candidateIds: scopeIds });
    setBusy(false);
    if (res.error) return toast(res.error.message);
    const d = res.data!;
    setReport({
      tone: d.failed ? "warn" : "ok",
      text: `${d.sent} ${d.sent === 1 ? "slip" : "slips"} sent.${d.failed ? ` ${d.failed} could not be delivered — their PIN was still changed, so print their slips or try again.` : ""}${d.noEmail ? ` ${d.noEmail} without an email were skipped.` : ""}`,
    });
    await reloadCandidates();
  }

  async function remove(c: CandidateRow) {
    if (
      !(await confirm({
        title: `Remove ${c.fullName}?`,
        description: "They are taken off the list and their PIN stops working.",
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return;
    const res = await apiDelete(`/api/tenant/exams/${exam.id}/candidates/${c.id}`);
    if (res.error) return toast(res.error.message);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(c.id);
      return next;
    });
    await refresh();
  }

  async function removeSelected() {
    const removable = selectedRows.filter((c) => c.attemptCount === 0);
    if (!removable.length) return toast("Everyone selected has already sat the exam. Set them to Withdrawn instead.");
    if (
      !(await confirm({
        title: `Remove ${removable.length} ${removable.length === 1 ? "candidate" : "candidates"}?`,
        description:
          removable.length < selectedRows.length
            ? `${selectedRows.length - removable.length} who have already sat it are kept.`
            : "Their PINs stop working.",
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    const results = await Promise.all(removable.map((c) => apiDelete(`/api/tenant/exams/${exam.id}/candidates/${c.id}`)));
    setBusy(false);
    const failed = results.filter((r) => r.error).length;
    if (failed) toast(`${failed} could not be removed.`);
    setSelected(new Set());
    await refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {canWrite ? (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13px] font-bold">Add:</span>
            {ADD_OPTIONS.map((o) => (
              <Button key={o.mode} type="button" variant="outline" size="sm" onClick={() => setMode(o.mode)}>
                <Icon name={o.icon} aria-hidden />
                {o.label}
              </Button>
            ))}
          </div>
          {exam.accessMode !== "INVITED" ? (
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              {exam.accessMode === "ENROLLED" ? "Course enrollees" : "Learners with the access code"} can also join without being listed. List them anyway to print slips or give extra time.
            </p>
          ) : null}
        </Card>
      ) : null}

      {report ? (
        <Notice tone={report.tone}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold">{report.text}</p>
              {report.skipped?.length ? (
                <ul className="mt-1 list-disc pl-4">
                  {report.skipped.slice(0, 10).map((s, i) => (
                    <li key={i}>
                      {s.fullName}: {s.reason}
                    </li>
                  ))}
                  {report.skipped.length > 10 ? <li>…and {report.skipped.length - 10} more.</li> : null}
                </ul>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setReport(null)}>
              <Icon name="x" aria-hidden />
            </Button>
          </div>
        </Notice>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput type="search" aria-label="Search candidates" placeholder="Search name, email, reg. no. or Exam ID…" className="min-w-0 flex-1 basis-64" value={search} onChange={(e) => setSearch(e.target.value)} />
          {exam.sittings.length ? (
            <SelectInput
              aria-label="Filter by sitting"
              placeholder="All sittings"
              className="w-auto basis-44"
              options={[...exam.sittings.map((s) => ({ value: s.id, label: s.name })), { value: "none", label: "No sitting" }]}
              value={sittingFilter}
              onChange={(e) => setSittingFilter(e.target.value)}
            />
          ) : null}
        </div>

        {canWrite && candidates.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-y-2 border-dashed border-border py-2.5">
            <span className="num mr-1 text-[13px] font-bold">{selectedRows.length ? `${selectedRows.length} selected` : "Acting on everyone"}</span>
            <Button type="button" variant="outline" size="sm" onClick={resetPins} disabled={busy}>
              <Icon name="refresh" aria-hidden />
              New PINs
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={emailSlips} disabled={busy}>
              <Icon name="mail" aria-hidden />
              Email slips
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/exams/${exam.id}/slips${selectedRows.length ? `?ids=${selectedRows.map((c) => c.id).join(",")}` : ""}`}>
                <Icon name="file" aria-hidden />
                Print slips
              </Link>
            </Button>
            {selectedRows.length ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={removeSelected} disabled={busy}>
                  <Icon name="trash" aria-hidden />
                  Remove
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        {candidates.length === 0 ? (
          <EmptyState
            icon="users"
            title="No candidates yet"
            action={
              canWrite ? (
                <Button type="button" size="sm" onClick={() => setMode("learners")}>
                  Add learners
                </Button>
              ) : undefined
            }
          >
            Everyone on this list gets an Exam ID and PIN to sign in with. Add learners, a group, a course&apos;s enrollees or external people.
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="Nobody matches">
            Clear the search or the sitting filter.
          </EmptyState>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <caption className="sr-only">Candidates for {exam.title}</caption>
              <thead className="text-xs font-black uppercase text-muted-foreground">
                <tr>
                  {canWrite ? (
                    <th scope="col" className="w-8 px-2 py-2">
                      <Checkbox
                        aria-label="Select all shown"
                        checked={allVisibleOn ? true : someVisibleOn ? "indeterminate" : false}
                        onCheckedChange={(v) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            for (const c of visible) {
                              if (v === true) next.add(c.id);
                              else next.delete(c.id);
                            }
                            return next;
                          })
                        }
                      />
                    </th>
                  ) : null}
                  <th scope="col" className="px-2 py-2">Exam ID</th>
                  <th scope="col" className="px-2 py-2">Candidate</th>
                  <th scope="col" className="px-2 py-2">Reg. no.</th>
                  <th scope="col" className="px-2 py-2">Sitting</th>
                  <th scope="col" className="px-2 py-2">Extra time</th>
                  <th scope="col" className="px-2 py-2">Status</th>
                  <th scope="col" className="px-2 py-2">Attempt</th>
                  {canWrite ? (
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-t-2 border-border align-top">
                    {canWrite ? (
                      <td className="px-2 py-2.5">
                        <Checkbox
                          aria-label={`Select ${c.fullName}`}
                          checked={selected.has(c.id)}
                          onCheckedChange={(v) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.add(c.id);
                              else next.delete(c.id);
                              return next;
                            })
                          }
                        />
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-2 py-2.5 font-mono font-bold">{c.candidateNo}</td>
                    <td className="px-2 py-2.5">
                      <span className="font-bold">{c.fullName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.email ?? "No email"}
                        {c.clientId ? " · learner" : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">{c.regNumber ?? "—"}</td>
                    <td className="px-2 py-2.5">{c.sittingName ?? "—"}</td>
                    <td className="num px-2 py-2.5">{c.extraTimePct ? `+${c.extraTimePct}%` : "—"}</td>
                    <td className="px-2 py-2.5">
                      {c.status === "ACTIVE" ? (
                        c.pinLocked ? <Badge color="var(--warning)">PIN locked</Badge> : <Badge color="var(--success)">Active</Badge>
                      ) : (
                        <Badge color="var(--muted)">{c.status === "BLOCKED" ? "Blocked" : "Withdrawn"}</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      {c.latestAttempt ? (
                        <Link
                          href={`/admin/exams/${exam.id}/attempts/${c.latestAttempt.id}`}
                          className="rounded-[4px] font-bold underline underline-offset-2 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {ATTEMPT_STATUS_LABEL[c.latestAttempt.status] ?? c.latestAttempt.status}
                          {c.latestAttempt.scorePercent != null ? ` · ${Math.round(c.latestAttempt.scorePercent)}%` : ""}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Not started</span>
                      )}
                      {c.attemptCount > 1 ? <span className="block text-xs text-muted-foreground">{c.attemptCount} attempts</span> : null}
                    </td>
                    {canWrite ? (
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${c.fullName}`} onClick={() => setEditing(c)}>
                          <Icon name="settings" aria-hidden />
                        </Button>
                        {c.attemptCount === 0 ? (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${c.fullName}`} onClick={() => remove(c)}>
                            <Icon name="trash" aria-hidden />
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddCandidatesDialog mode={mode} onClose={() => setMode(null)} onAdded={onAdded} />
      <EditCandidateDialog
        candidate={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast("Candidate saved.");
          void refresh();
        }}
      />
      <PinsDialog issued={pins?.issued ?? null} title={pins?.title ?? ""} onClose={() => setPins(null)} />
    </div>
  );
}
