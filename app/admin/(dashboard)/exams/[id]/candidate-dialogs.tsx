"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import type { CandidateRow, CandidateStatusValue, IssuedPin } from "@/lib/exams/admin-dto";
import { useBuilder } from "./builder-context";
import { Notice, intOrNull } from "./ui";

export type AddResult = {
  issued: IssuedPin[];
  added: number;
  alreadyListed: number;
  skipped: { fullName: string; reason: string }[];
};

export type AddMode = "learners" | "group" | "course" | "external" | "csv";

function Footer({ onCancel, busy, label, disabled, onSubmit }: { onCancel: () => void; busy: boolean; label: string; disabled?: boolean; onSubmit: () => void }) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 border-t-2 border-dashed border-border pt-4 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="button" onClick={onSubmit} disabled={busy || disabled}>
        {busy ? "Working…" : label}
      </Button>
    </div>
  );
}

function SittingSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { exam } = useBuilder();
  if (!exam.sittings.length) return null;
  return (
    <FormField label="Sitting (optional)" htmlFor={id}>
      <SelectInput id={id} placeholder="No sitting" options={exam.sittings.map((s) => ({ value: s.id, label: s.name }))} value={value} onChange={(e) => onChange(e.target.value)} />
    </FormField>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-3 text-sm font-bold text-destructive">
      {error}
    </p>
  ) : null;
}

/* ───────────────────────────── add ───────────────────────────── */

export function AddCandidatesDialog({ mode, onClose, onAdded }: { mode: AddMode | null; onClose: () => void; onAdded: (r: AddResult) => void }) {
  return (
    <Dialog open={mode != null} onOpenChange={(o) => (o ? undefined : onClose())}>
      {mode === "learners" ? <LearnersForm onClose={onClose} onAdded={onAdded} /> : null}
      {mode === "group" ? <GroupForm onClose={onClose} onAdded={onAdded} /> : null}
      {mode === "course" ? <CourseForm onClose={onClose} onAdded={onAdded} /> : null}
      {mode === "external" ? <ExternalForm onClose={onClose} onAdded={onAdded} /> : null}
      {mode === "csv" ? <CsvForm onClose={onClose} onAdded={onAdded} /> : null}
    </Dialog>
  );
}

type FormProps = { onClose: () => void; onAdded: (r: AddResult) => void };

function useAdd(onAdded: (r: AddResult) => void, onClose: () => void) {
  const { exam } = useBuilder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(body: unknown) {
    setBusy(true);
    setError(null);
    const res = await apiPost<AddResult>(`/api/tenant/exams/${exam.id}/candidates`, body);
    setBusy(false);
    if (res.error) return setError(res.error.message);
    onAdded(res.data!);
    onClose();
  }
  return { busy, error, setError, run };
}

type Learner = { id: string; email: string; name: string; status: string; onList: boolean };

function LearnersForm({ onClose, onAdded }: FormProps) {
  const { exam } = useBuilder();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ key: string; learners: Learner[]; error: string | null } | null>(null);
  const [picked, setPicked] = useState<Map<string, Learner>>(new Map());
  const [sittingId, setSittingId] = useState("");
  const { busy, error, run } = useAdd(onAdded, onClose);

  const key = q.trim();
  useEffect(() => {
    const t = setTimeout(() => {
      void apiGet<{ learners: Learner[] }>(`/api/tenant/exams/${exam.id}/candidates/learners?q=${encodeURIComponent(key)}`).then((res) => {
        setFound({ key, learners: res.data?.learners ?? [], error: res.error?.message ?? null });
      });
    }, 250);
    return () => clearTimeout(t);
  }, [key, exam.id]);
  const loading = !found || found.key !== key;

  return (
    <DialogContent className="max-w-xl">
      <DialogTitle>Add learners</DialogTitle>
      <DialogDescription>Learners with an account. They can sit from their dashboard or with the Exam ID and PIN you print for them.</DialogDescription>
      <div className="mt-4 flex flex-col gap-3">
        <TextInput type="search" aria-label="Search learners" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="max-h-72 overflow-y-auto rounded-[10px] border-2 border-border" aria-busy={loading}>
          {found?.error ? <p className="p-3 text-sm font-bold text-destructive">{found.error}</p> : null}
          {!loading && found && found.learners.length === 0 ? (
            <p className="p-4 text-center text-[13px] font-medium text-muted-foreground">No learners match.</p>
          ) : null}
          <ul className={loading ? "opacity-60" : undefined}>
            {(found?.learners ?? []).map((l) => (
              <li key={l.id} className="border-b-2 border-border last:border-b-0">
                <label className={"flex items-center gap-3 px-3 py-2 " + (l.onList ? "opacity-60" : "cursor-pointer hover:bg-accent/40")}>
                  <Checkbox
                    checked={l.onList || picked.has(l.id)}
                    disabled={l.onList}
                    onCheckedChange={(v) =>
                      setPicked((prev) => {
                        const next = new Map(prev);
                        if (v === true) next.set(l.id, l);
                        else next.delete(l.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{l.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{l.email}</span>
                  </span>
                  {l.onList ? <Badge>On the list</Badge> : l.status !== "ACTIVE" ? <Badge>{l.status.toLowerCase()}</Badge> : null}
                </label>
              </li>
            ))}
          </ul>
        </div>
        {picked.size ? (
          <p className="text-[13px] font-bold">
            {picked.size} selected: <span className="font-medium text-muted-foreground">{[...picked.values()].slice(0, 4).map((l) => l.name).join(", ")}{picked.size > 4 ? "…" : ""}</span>
          </p>
        ) : null}
        <SittingSelect id="add-l-sitting" value={sittingId} onChange={setSittingId} />
      </div>
      <ErrorLine error={error} />
      <Footer
        onCancel={onClose}
        busy={busy}
        disabled={picked.size === 0}
        label={`Add ${picked.size || ""} ${picked.size === 1 ? "learner" : "learners"}`.replace("  ", " ")}
        onSubmit={() => run({ mode: "learners", clientIds: [...picked.keys()], sittingId: sittingId || null })}
      />
    </DialogContent>
  );
}

function GroupForm({ onClose, onAdded }: FormProps) {
  const { groups } = useBuilder();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [sittingId, setSittingId] = useState("");
  const { busy, error, run } = useAdd(onAdded, onClose);
  return (
    <DialogContent className="max-w-md">
      <DialogTitle>Add a learner group</DialogTitle>
      <DialogDescription>Everyone in the group now is added. People who join the group later are not added automatically.</DialogDescription>
      <div className="mt-4 flex flex-col gap-3">
        {groups.length ? (
          <FormField label="Group" htmlFor="add-g-group">
            <SelectInput id="add-g-group" allowEmpty={false} options={groups.map((g) => ({ value: g.id, label: `${g.name} (${g.members})` }))} value={groupId} onChange={(e) => setGroupId(e.target.value)} />
          </FormField>
        ) : (
          <Notice tone="warn">There are no learner groups yet. Create one under Learner groups.</Notice>
        )}
        <SittingSelect id="add-g-sitting" value={sittingId} onChange={setSittingId} />
      </div>
      <ErrorLine error={error} />
      <Footer onCancel={onClose} busy={busy} disabled={!groupId} label="Add group" onSubmit={() => run({ mode: "group", clientGroupId: groupId, sittingId: sittingId || null })} />
    </DialogContent>
  );
}

function CourseForm({ onClose, onAdded }: FormProps) {
  const { exam, courses } = useBuilder();
  const [courseId, setCourseId] = useState(exam.courseId ?? courses[0]?.id ?? "");
  const [sittingId, setSittingId] = useState("");
  const { busy, error, run } = useAdd(onAdded, onClose);
  return (
    <DialogContent className="max-w-md">
      <DialogTitle>Add a course&apos;s learners</DialogTitle>
      <DialogDescription>Everyone enrolled on the course now is added.</DialogDescription>
      <div className="mt-4 flex flex-col gap-3">
        <FormField label="Course" htmlFor="add-c-course">
          <SelectInput id="add-c-course" allowEmpty={false} options={courses.map((c) => ({ value: c.id, label: c.name }))} value={courseId} onChange={(e) => setCourseId(e.target.value)} />
        </FormField>
        <SittingSelect id="add-c-sitting" value={sittingId} onChange={setSittingId} />
      </div>
      <ErrorLine error={error} />
      <Footer onCancel={onClose} busy={busy} disabled={!courseId} label="Add enrollees" onSubmit={() => run({ mode: "course", courseId, sittingId: sittingId || null })} />
    </DialogContent>
  );
}

type ExtRow = { fullName: string; email: string; regNumber: string; sittingId: string; extraTimePct: string };
const blankRow = (): ExtRow => ({ fullName: "", email: "", regNumber: "", sittingId: "", extraTimePct: "" });

function ExternalForm({ onClose, onAdded }: FormProps) {
  const { exam } = useBuilder();
  const [rows, setRows] = useState<ExtRow[]>([blankRow()]);
  const { busy, error, setError, run } = useAdd(onAdded, onClose);
  const set = (i: number, patch: Partial<ExtRow>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function submit() {
    const filled = rows.filter((r) => r.fullName.trim() || r.email.trim() || r.regNumber.trim());
    if (!filled.length) return setError("Enter at least one name.");
    if (filled.some((r) => !r.fullName.trim())) return setError("Every candidate needs a name.");
    const bad = filled.find((r) => r.extraTimePct.trim() && ((intOrNull(r.extraTimePct) ?? -1) < 0 || (intOrNull(r.extraTimePct) ?? 0) > 300));
    if (bad) return setError("Extra time is a whole number from 0 to 300 (percent).");
    void run({
      mode: "external",
      candidates: filled.map((r) => ({
        fullName: r.fullName.trim(),
        email: r.email.trim() || null,
        regNumber: r.regNumber.trim() || null,
        sittingId: r.sittingId || null,
        extraTimePct: intOrNull(r.extraTimePct) ?? 0,
      })),
    });
  }

  return (
    <DialogContent className="max-w-3xl">
      <DialogTitle>Add external candidates</DialogTitle>
      <DialogDescription>People without a learner account — applicants, visiting students. They sign in with the Exam ID and PIN on their slip. For many people, import a CSV instead.</DialogDescription>
      <div className="mt-4 flex flex-col gap-3">
        {rows.map((r, i) => (
          <fieldset key={i} className="grid gap-2 rounded-[10px] border-2 border-border p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.4fr_1fr_1fr_90px_auto]">
            <legend className="sr-only">Candidate {i + 1}</legend>
            <TextInput aria-label={`Candidate ${i + 1} full name`} placeholder="Full name *" value={r.fullName} onChange={(e) => set(i, { fullName: e.target.value })} />
            <TextInput aria-label={`Candidate ${i + 1} email`} type="email" placeholder="Email (for the slip)" value={r.email} onChange={(e) => set(i, { email: e.target.value })} />
            <TextInput aria-label={`Candidate ${i + 1} registration number`} placeholder="Reg. no." value={r.regNumber} onChange={(e) => set(i, { regNumber: e.target.value })} />
            {exam.sittings.length ? (
              <SelectInput aria-label={`Candidate ${i + 1} sitting`} placeholder="No sitting" options={exam.sittings.map((s) => ({ value: s.id, label: s.name }))} value={r.sittingId} onChange={(e) => set(i, { sittingId: e.target.value })} />
            ) : (
              <span className="hidden lg:block" />
            )}
            <TextInput aria-label={`Candidate ${i + 1} extra time percent`} type="number" min={0} max={300} placeholder="+% time" value={r.extraTimePct} onChange={(e) => set(i, { extraTimePct: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove candidate ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
              <Icon name="x" aria-hidden />
            </Button>
          </fieldset>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, blankRow()])} disabled={rows.length >= 50}>
            <Icon name="plus" aria-hidden />
            Another candidate
          </Button>
        </div>
      </div>
      <ErrorLine error={error} />
      <Footer onCancel={onClose} busy={busy} label="Add candidates" onSubmit={submit} />
    </DialogContent>
  );
}

type CsvRow = {
  line: number;
  fullName: string;
  email: string | null;
  regNumber: string | null;
  sitting: string | null;
  extraTimePct: number;
  learner: boolean;
  issue: string | null;
};

function CsvForm({ onClose, onAdded }: FormProps) {
  const { exam } = useBuilder();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{ csv: string; rows: CsvRow[]; valid: number; invalid: number; headerFound: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = preview && preview.csv === csv ? preview : null;

  async function check() {
    setBusy(true);
    setError(null);
    const res = await apiPost<{ rows: CsvRow[]; valid: number; invalid: number; headerFound: boolean }>(`/api/tenant/exams/${exam.id}/candidates/import`, { csv, dryRun: true });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    setPreview({ csv, ...res.data! });
  }

  async function importNow() {
    setBusy(true);
    setError(null);
    const res = await apiPost<AddResult>(`/api/tenant/exams/${exam.id}/candidates/import`, { csv, dryRun: false });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    onAdded(res.data!);
    onClose();
  }

  async function readFile(file: File) {
    if (file.size > 2_000_000) return setError("The file is too large (2 MB at most).");
    setCsv(await file.text());
  }

  return (
    <DialogContent className="max-w-3xl">
      <DialogTitle>Import candidates from CSV</DialogTitle>
      <DialogDescription>
        Columns: <code className="font-mono">fullName</code> (or <code className="font-mono">name</code>), <code className="font-mono">email</code>, <code className="font-mono">regNumber</code>,{" "}
        <code className="font-mono">sitting</code> (the sitting&apos;s name), <code className="font-mono">extraTimePct</code>. Only the name is required. A spreadsheet saved as CSV works.
      </DialogDescription>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border-2 border-border bg-card px-3 text-[13px] font-bold shadow-sm focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-ring">
            <Icon name="upload" className="size-4" aria-hidden />
            Choose a file
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-xs font-medium text-muted-foreground">or paste below</span>
        </div>
        <TextArea
          aria-label="CSV text"
          className="min-h-36 font-mono text-[13px]"
          placeholder={"fullName,email,regNumber,sitting,extraTimePct\nAda Obi,ada@example.com,UNI/2026/001,Morning,0"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          spellCheck={false}
        />
        {current ? (
          <>
            <Notice tone={current.invalid ? "warn" : "ok"}>
              {current.valid} {current.valid === 1 ? "row is" : "rows are"} ready to import
              {current.invalid ? `; ${current.invalid} ${current.invalid === 1 ? "has a problem and will be skipped" : "have problems and will be skipped"}` : ""}.
              {current.headerFound ? "" : " No header row found, so columns were read in the order fullName, email, regNumber, sitting, extraTimePct."}
            </Notice>
            <div className="max-h-64 overflow-auto rounded-[10px] border-2 border-border">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-card text-xs font-black uppercase text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-2 py-1.5">Line</th>
                    <th scope="col" className="px-2 py-1.5">Name</th>
                    <th scope="col" className="px-2 py-1.5">Email</th>
                    <th scope="col" className="px-2 py-1.5">Reg. no.</th>
                    <th scope="col" className="px-2 py-1.5">Sitting</th>
                    <th scope="col" className="px-2 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {current.rows.map((r) => (
                    <tr key={r.line} className={"border-t-2 border-border " + (r.issue ? "bg-destructive/10" : "")}>
                      <td className="num px-2 py-1.5">{r.line}</td>
                      <td className="px-2 py-1.5 font-bold">{r.fullName || "—"}</td>
                      <td className="px-2 py-1.5">{r.email ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.regNumber ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.sitting ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.issue ? <span className="font-bold text-destructive">{r.issue}</span> : r.learner ? "Linked to learner account" : "Ready"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
      <ErrorLine error={error} />
      <div className="mt-5 flex flex-col-reverse gap-2 border-t-2 border-dashed border-border pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {current ? (
          <Button type="button" onClick={importNow} disabled={busy || current.valid === 0}>
            {busy ? "Importing…" : `Import ${current.valid} ${current.valid === 1 ? "candidate" : "candidates"}`}
          </Button>
        ) : (
          <Button type="button" onClick={check} disabled={busy || !csv.trim()}>
            {busy ? "Checking…" : "Check the file"}
          </Button>
        )}
      </div>
    </DialogContent>
  );
}

/* ───────────────────────────── edit ───────────────────────────── */

export function EditCandidateDialog({ candidate, onClose, onSaved }: { candidate: CandidateRow | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={candidate != null} onOpenChange={(o) => (o ? undefined : onClose())}>
      {candidate ? <EditForm key={candidate.id} candidate={candidate} onClose={onClose} onSaved={onSaved} /> : null}
    </Dialog>
  );
}

function EditForm({ candidate, onClose, onSaved }: { candidate: CandidateRow; onClose: () => void; onSaved: () => void }) {
  const { exam } = useBuilder();
  const [fullName, setFullName] = useState(candidate.fullName);
  const [email, setEmail] = useState(candidate.email ?? "");
  const [regNumber, setRegNumber] = useState(candidate.regNumber ?? "");
  const [sittingId, setSittingId] = useState(candidate.sittingId ?? "");
  const [extra, setExtra] = useState(String(candidate.extraTimePct));
  const [status, setStatus] = useState<CandidateStatusValue>(candidate.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!fullName.trim()) return setError("The candidate needs a name.");
    const pct = intOrNull(extra);
    if (pct == null || pct < 0 || pct > 300) return setError("Extra time is a whole number from 0 to 300 (percent).");
    setBusy(true);
    setError(null);
    const res = await apiPatch(`/api/tenant/exams/${exam.id}/candidates/${candidate.id}`, {
      fullName: fullName.trim(),
      email: email.trim() || null,
      regNumber: regNumber.trim() || null,
      sittingId: sittingId || null,
      extraTimePct: pct,
      status,
    });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    onSaved();
    onClose();
  }

  const minutes = Math.round(exam.durationMin * (1 + (intOrNull(extra) ?? 0) / 100));

  return (
    <DialogContent className="max-w-lg">
      <DialogTitle>{candidate.fullName}</DialogTitle>
      <DialogDescription>
        Exam ID <span className="font-mono font-bold">{candidate.candidateNo}</span>
        {candidate.clientId ? " · has a learner account" : " · external candidate"}
      </DialogDescription>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FormField label="Full name" htmlFor="ec-name" className="sm:col-span-2">
          <TextInput id="ec-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} />
        </FormField>
        <FormField label="Email" htmlFor="ec-email">
          <TextInput id="ec-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Registration no." htmlFor="ec-reg">
          <TextInput id="ec-reg" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} maxLength={60} />
        </FormField>
        <FormField label="Sitting" htmlFor="ec-sitting">
          <SelectInput id="ec-sitting" placeholder="No sitting" options={exam.sittings.map((s) => ({ value: s.id, label: s.name }))} value={sittingId} onChange={(e) => setSittingId(e.target.value)} />
        </FormField>
        <FormField label="Extra time (%)" htmlFor="ec-extra" hint={`${minutes} minutes in total.`}>
          <TextInput id="ec-extra" type="number" inputMode="numeric" min={0} max={300} value={extra} onChange={(e) => setExtra(e.target.value)} />
        </FormField>
        <FormField label="Status" htmlFor="ec-status" className="sm:col-span-2" hint="Blocked and withdrawn candidates cannot start the exam.">
          <SelectInput
            id="ec-status"
            allowEmpty={false}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "BLOCKED", label: "Blocked" },
              { value: "WITHDRAWN", label: "Withdrawn" },
            ]}
            value={status}
            onChange={(e) => setStatus(e.target.value as CandidateStatusValue)}
          />
        </FormField>
      </div>
      <ErrorLine error={error} />
      <Footer onCancel={onClose} busy={busy} label="Save candidate" onSubmit={save} />
    </DialogContent>
  );
}

/* ───────────────────────────── PINs ───────────────────────────── */

function csvCell(v: string | null) {
  const s = v ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function PinsDialog({ issued, title, onClose }: { issued: IssuedPin[] | null; title: string; onClose: () => void }) {
  const { exam, origin } = useBuilder();
  function download() {
    if (!issued) return;
    const lines = [
      "examId,fullName,email,regNumber,pin,signIn",
      ...issued.map((c) => [c.candidateNo, c.fullName, c.email, c.regNumber, c.pin, `${origin}/exam`].map(csvCell).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(exam.code || exam.title).replace(/[^A-Za-z0-9_-]+/g, "-")}-pins.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Dialog open={issued != null} onOpenChange={(o) => (o ? undefined : onClose())}>
      {issued ? (
        <DialogContent className="max-w-2xl">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            These PINs are shown <strong>only now</strong> — they are stored scrambled and cannot be looked up again. Download or print them before closing. A lost PIN can be reset.
          </DialogDescription>
          <div className="mt-4 max-h-80 overflow-auto rounded-[10px] border-2 border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-card text-xs font-black uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2">Name</th>
                  <th scope="col" className="px-3 py-2">Exam ID</th>
                  <th scope="col" className="px-3 py-2">PIN</th>
                </tr>
              </thead>
              <tbody>
                {issued.map((c) => (
                  <tr key={c.id} className="border-t-2 border-border">
                    <td className="px-3 py-2 font-bold">{c.fullName}</td>
                    <td className="px-3 py-2 font-mono">{c.candidateNo}</td>
                    <td className="px-3 py-2 font-mono text-base font-black tracking-[0.2em]">{c.pin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              I have saved them
            </Button>
            <Button type="button" onClick={download}>
              <Icon name="download" aria-hidden />
              Download as CSV
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
