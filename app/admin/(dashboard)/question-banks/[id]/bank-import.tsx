"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { MathText } from "@/components/assessments/math-text";
import { extractPdfText } from "@/components/assessments/pdf-text";
import { questionType } from "@/lib/assessments/types";
import type { QuestionTypeValue } from "@/lib/schemas/question";
import { cn } from "@/lib/utils";

type Format = "csv" | "aiken" | "gift" | "json";
type Preview = { type: QuestionTypeValue; prompt: string; points: number; difficulty: string | null; tags: string[] };
type Issue = { item: number; line?: number; message: string };
type Generated = {
  type: QuestionTypeValue;
  prompt: string;
  options?: unknown;
  answer?: unknown;
  difficulty?: string | null;
  explanation?: string | null;
};

const SAMPLES: Record<Format, string> = {
  aiken: `What is the capital of Nigeria?
A. Lagos
B. Abuja
C. Kano
D. Ibadan
ANSWER: B`,
  gift: `::Q1:: Water boils at 100°C at sea level. {T}

What is 12 × 12? {#144}

Name the largest planet. {=Jupiter =jupiter}

Which gas do plants take in? {=Carbon dioxide ~Oxygen ~Nitrogen ~Hydrogen}`,
  csv: `type,prompt,options,answer,points,difficulty,explanation,tags
single,What is 2 + 2?,3|4|5|6,B,1,easy,Basic addition.,maths
multiple,Which are prime?,2|4|5|9,A|C,2,medium,,maths
tf,The sun is a star.,,true,1,easy,,science
numeric,g on Earth in m/s²?,m/s²,9.81±0.05,1,medium,,physics
short,Chemical symbol for gold?,,Au,1,easy,,chemistry`,
  json: `[{ "type": "SINGLE_CHOICE", "prompt": "2 + 2 = ?", "options": ["3","4"], "answer": [1], "points": 1 }]`,
};

const GEN_TYPES: { value: QuestionTypeValue; label: string }[] = [
  { value: "SINGLE_CHOICE", label: "Single choice" },
  { value: "MULTIPLE_CHOICE", label: "Multiple choice" },
  { value: "TRUE_FALSE", label: "True / false" },
  { value: "SHORT_ANSWER", label: "Short answer" },
  { value: "NUMERIC", label: "Numeric" },
  { value: "FILL_BLANKS", label: "Fill in the blanks" },
  { value: "MATCHING", label: "Matching" },
  { value: "ORDERING", label: "Ordering" },
  { value: "ESSAY", label: "Essay" },
];

export function BankImport({ bankId, aiEnabled, onImported }: { bankId: string; aiEnabled: boolean; onImported: () => void }) {
  const [mode, setMode] = useState<"ai" | "import" | "export">(aiEnabled ? "ai" : "import");
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg leading-tight">Add many at once</h2>
        <Segmented
          ariaLabel="Bulk tools"
          options={[
            ...(aiEnabled ? [{ value: "ai" as const, label: "Generate with AI" }] : []),
            { value: "import" as const, label: "Import" },
            { value: "export" as const, label: "Export" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      <div className="mt-4">
        {mode === "ai" ? <AiGenerator bankId={bankId} onImported={onImported} /> : null}
        {mode === "import" ? <Importer bankId={bankId} onImported={onImported} /> : null}
        {mode === "export" ? <Exporter bankId={bankId} /> : null}
      </div>
    </Card>
  );
}

function Exporter({ bankId }: { bankId: string }) {
  const links: { format: string; label: string; note: string }[] = [
    { format: "json", label: "JSON", note: "Everything, every type. Re-import here or into another academy." },
    { format: "csv", label: "CSV (spreadsheet)", note: "Choice, true/false, short, numeric, ordering, equation, blanks." },
    { format: "gift", label: "GIFT (Moodle)", note: "Choice, multi, true/false, short, numeric, matching, essay." },
    { format: "aiken", label: "Aiken", note: "Single and multiple choice only." },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {links.map((l) => (
        <a
          key={l.format}
          href={`/api/tenant/question-banks/${bankId}/export?format=${l.format}`}
          className="flex flex-col rounded-[10px] border-2 border-border bg-background p-3 hover:bg-muted"
        >
          <span className="text-sm font-black">Download {l.label}</span>
          <span className="text-xs text-muted-foreground">{l.note}</span>
        </a>
      ))}
    </div>
  );
}

function Importer({ bankId, onImported }: { bankId: string; onImported: () => void }) {
  const [format, setFormat] = useState<Format>("csv");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | { ready: number; duplicates: number; issues: Issue[]; preview: Preview[] }>(null);

  async function run(dryRun: boolean) {
    if (!text.trim()) return setError("Paste the questions or choose a file.");
    setBusy(true);
    setError(null);
    const res = await apiPost<{ ready?: number; imported?: number; duplicates: number; issues: Issue[]; preview?: Preview[] }>(
      `/api/tenant/question-banks/${bankId}/import`,
      { format, text, dryRun }
    );
    setBusy(false);
    if (res.error) return setError(res.error.message);
    if (dryRun) setResult({ ready: res.data!.ready ?? 0, duplicates: res.data!.duplicates, issues: res.data!.issues, preview: res.data!.preview ?? [] });
    else {
      setResult(null);
      setText("");
      onImported();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <FormField label="Format" htmlFor="imp-fmt">
          <SelectInput
            id="imp-fmt"
            allowEmpty={false}
            options={[
              { value: "csv", label: "CSV / spreadsheet" },
              { value: "aiken", label: "Aiken" },
              { value: "gift", label: "GIFT (Moodle)" },
              { value: "json", label: "JSON" },
            ]}
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as Format);
              setResult(null);
            }}
          />
        </FormField>
        <FormField label="File" htmlFor="imp-file">
          <input
            id="imp-file"
            type="file"
            accept=".csv,.txt,.json,.gift,.aiken,text/plain,text/csv,application/json"
            className="block w-full text-sm file:mr-3 file:rounded-[8px] file:border-2 file:border-border file:bg-card file:px-3 file:py-1.5 file:font-bold"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setText(await f.text());
              setResult(null);
              if (/\.csv$/i.test(f.name)) setFormat("csv");
              else if (/\.json$/i.test(f.name)) setFormat("json");
              else if (/gift/i.test(f.name)) setFormat("gift");
            }}
          />
        </FormField>
      </div>
      <FormField label="…or paste" htmlFor="imp-text">
        <TextArea id="imp-text" className="min-h-40 font-mono text-[13px]" value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder={SAMPLES[format]} />
      </FormField>
      <details className="text-xs">
        <summary className="cursor-pointer font-bold text-muted-foreground">Show an example</summary>
        <pre className="mt-2 overflow-x-auto rounded-[8px] bg-muted p-3 font-mono">{SAMPLES[format]}</pre>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setText(SAMPLES[format])}>
          Use the example
        </Button>
      </details>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="flex flex-col gap-2 rounded-[10px] border-2 border-border bg-background p-3">
          <div className="flex flex-wrap gap-2 text-sm font-bold">
            <Badge color="var(--success)">{result.ready} ready</Badge>
            {result.duplicates ? <Badge>{result.duplicates} already in the bank (skipped)</Badge> : null}
            {result.issues.length ? <Badge color="var(--destructive)">{result.issues.length} with problems</Badge> : null}
          </div>
          {result.issues.length ? (
            <ul className="max-h-40 overflow-y-auto text-xs font-medium text-destructive">
              {result.issues.map((i, n) => (
                <li key={n}>
                  #{i.item}
                  {i.line ? ` (line ${i.line})` : ""}: {i.message}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="max-h-64 overflow-y-auto text-sm">
            {result.preview.map((p, n) => (
              <li key={n} className="flex gap-2 border-t border-border py-1.5">
                <Badge className="shrink-0 text-[10px]">{questionType(p.type).label}</Badge>
                <MathText className="line-clamp-1">{p.prompt}</MathText>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => run(true)} disabled={busy}>
          {busy ? "Checking…" : "Check"}
        </Button>
        <Button type="button" onClick={() => run(false)} disabled={busy || !result || result.ready === 0}>
          Import {result ? result.ready : ""} questions
        </Button>
      </div>
    </div>
  );
}

function AiGenerator({ bankId, onImported }: { bankId: string; onImported: () => void }) {
  const [source, setSource] = useState<"topic" | "text">("topic");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState<Set<QuestionTypeValue>>(new Set(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]));
  const [difficulty, setDifficulty] = useState("MIXED");
  const [level, setLevel] = useState("");
  const [audience, setAudience] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Generated[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [rejected, setRejected] = useState(0);

  async function generate() {
    setError(null);
    if (source === "topic" && topic.trim().length < 3) return setError("Describe the topic.");
    if (source === "text" && text.trim().length < 50) return setError("Paste at least a paragraph, or choose a PDF.");
    if (types.size === 0) return setError("Pick at least one question type.");
    setBusy(true);
    const res = await apiPost<{ questions: Generated[]; rejected: number }>(`/api/tenant/question-banks/${bankId}/generate`, {
      source: source === "topic" ? { kind: "topic", topic } : { kind: "text", text, label: label ?? undefined },
      count,
      types: [...types],
      difficulty,
      level: level || null,
      audience: audience || null,
      instructions: instructions || null,
    });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    setResults(res.data!.questions);
    setRejected(res.data!.rejected);
    setPicked(new Set(res.data!.questions.map((_, i) => i)));
  }

  async function save() {
    if (!results) return;
    const chosen = results.filter((_, i) => picked.has(i));
    if (chosen.length === 0) return setError("Select the questions to keep.");
    setBusy(true);
    const res = await apiPost(`/api/tenant/question-banks/${bankId}/import`, {
      format: "json",
      text: JSON.stringify(chosen),
      dryRun: false,
      skipDuplicates: true,
    });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    setResults(null);
    onImported();
  }

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        ariaLabel="Source"
        options={[
          { value: "topic", label: "From a topic" },
          { value: "text", label: "From notes or a PDF" },
        ]}
        value={source}
        onChange={setSource}
      />
      {source === "topic" ? (
        <FormField label="Topic" htmlFor="ai-topic" hint="Be specific: syllabus, level and what to focus on.">
          <TextArea id="ai-topic" className="min-h-20" maxLength={2000} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. SS2 Physics — Newton's laws of motion, with simple calculations" />
        </FormField>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 py-2 text-sm font-bold hover:bg-muted">
            Choose a PDF
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy(true);
                try {
                  setText(await extractPdfText(f));
                  setLabel(f.name);
                } catch {
                  setError("Could not read text from that PDF. If it is a scan, paste the text instead.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <FormField label={label ? `Text from ${label}` : "Source text"} htmlFor="ai-text">
            <TextArea id="ai-text" className="min-h-40" maxLength={60000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste lesson notes, a textbook section, or a past paper." />
          </FormField>
        </div>
      )}
      <fieldset>
        <legend className="mb-2 text-[13px] font-bold">Question types</legend>
        <div className="flex flex-wrap gap-2">
          {GEN_TYPES.map((t) => {
            const on = types.has(t.value);
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setTypes((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.value)) next.delete(t.value);
                    else next.add(t.value);
                    return next;
                  })
                }
                className={cn(
                  "min-h-9 rounded-full border-2 border-border px-3 text-sm font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
                  on ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
                )}
              >
                {on ? "✓ " : ""}
                {t.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="How many" htmlFor="ai-count">
          <TextInput id="ai-count" type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
        </FormField>
        <FormField label="Difficulty" htmlFor="ai-diff">
          <SelectInput
            id="ai-diff"
            allowEmpty={false}
            options={[
              { value: "MIXED", label: "A mix" },
              { value: "EASY", label: "Easy" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HARD", label: "Hard" },
            ]}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          />
        </FormField>
        <FormField label="Thinking level" htmlFor="ai-level">
          <SelectInput
            id="ai-level"
            placeholder="Any"
            options={["Remember", "Understand", "Apply", "Analyse", "Evaluate"].map((l) => ({ value: l.toLowerCase(), label: l }))}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
        </FormField>
        <FormField label="Candidates" htmlFor="ai-aud">
          <TextInput id="ai-aud" maxLength={200} placeholder="e.g. JSS3 students" value={audience} onChange={(e) => setAudience(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Anything else (optional)" htmlFor="ai-ins">
        <TextInput id="ai-ins" maxLength={1000} placeholder="e.g. Use Nigerian names and Naira in word problems" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="button" onClick={generate} disabled={busy}>
          {busy ? "Writing questions… (up to a minute)" : results ? "Generate again" : "Generate questions"}
        </Button>
      </div>

      {results ? (
        <div className="flex flex-col gap-2 rounded-[10px] border-2 border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-black">
              {results.length} drafted{rejected ? ` · ${rejected} discarded as malformed` : ""} — check each before keeping it
            </span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPicked(new Set(results.map((_, i) => i)))}>
                Select all
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPicked(new Set())}>
                None
              </Button>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {results.map((q, i) => (
              <li key={i}>
                <label className={cn("flex cursor-pointer gap-3 rounded-[8px] border-2 p-2.5", picked.has(i) ? "border-primary bg-primary/5" : "border-border bg-card")}>
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={picked.has(i)}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge className="text-[10px]">{questionType(q.type).label}</Badge>
                      {q.difficulty ? <Badge className="text-[10px]">{q.difficulty.toLowerCase()}</Badge> : null}
                    </div>
                    <MathText as="div" className="mt-1 text-sm font-bold">
                      {q.prompt}
                    </MathText>
                    <GeneratedAnswer q={q} />
                    {q.explanation ? <MathText as="div" className="mt-1 text-xs text-muted-foreground">{q.explanation}</MathText> : null}
                  </div>
                </label>
              </li>
            ))}
          </ul>
          <div>
            <Button type="button" onClick={save} disabled={busy || picked.size === 0}>
              Add {picked.size} to the bank
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GeneratedAnswer({ q }: { q: Generated }) {
  const LETTERS = "ABCDEFGH";
  if (Array.isArray(q.options) && Array.isArray(q.answer) && ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(q.type)) {
    const right = new Set(q.answer as number[]);
    return (
      <ul className="mt-1 grid gap-0.5 text-xs sm:grid-cols-2">
        {(q.options as string[]).map((o, i) => (
          <li key={i} className={right.has(i) ? "font-black text-[var(--success)]" : "text-muted-foreground"}>
            {LETTERS[i]}. <MathText>{o}</MathText> {right.has(i) ? "✓" : ""}
          </li>
        ))}
      </ul>
    );
  }
  let summary = "";
  if (q.type === "SHORT_ANSWER" && Array.isArray(q.answer)) summary = (q.answer as string[]).join(" / ");
  else if (q.type === "NUMERIC") {
    const a = q.answer as { value: number; tolerance: number };
    summary = `${a.value}${a.tolerance ? ` ± ${a.tolerance}` : ""}`;
  } else if (q.type === "FILL_BLANKS") summary = Object.values(q.answer as Record<string, string[]>).map((v) => v[0]).join(", ");
  else if (q.type === "MATCHING") {
    const o = q.options as { left: string[]; right: string[] };
    summary = o.left.map((l, i) => `${l} → ${o.right[i]}`).join(" · ");
  } else if (q.type === "ORDERING") summary = (q.options as { items: string[] }).items.join(" → ");
  return summary ? <div className="mt-1 text-xs font-bold text-[var(--success)]">Answer: {summary}</div> : null;
}
