"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { QuestionTypeValue } from "@/lib/schemas/question";
import { BLANK_PATTERN } from "@/lib/assessments/types";
import { MathText, TexPreview } from "@/components/assessments/math-text";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * Renders any question type for a candidate and reports the response.
 *
 * Driven entirely by the registry's candidate view (`view`), so it never sees
 * an answer key. Responses use ORIGINAL option keys, which is what grading
 * expects regardless of how the paper was shuffled.
 *
 * Used by the CBT exam window, the quiz player and the authoring preview.
 */

export type Keyed = { key: number; text: string };
export type Media = { kind: "image" | "audio" | "video"; url: string; maxPlays?: number | null; alt?: string | null };
export type UploadedFile = { key: string; name: string; size: number; type: string; durationSec?: number };
export type Uploader = (file: File | Blob, name: string) => Promise<UploadedFile | { error: string }>;

export type PlayerQuestion = {
  id: string;
  type: QuestionTypeValue;
  prompt: string;
  view: unknown;
  media?: Media | null;
};

export type PlayerProps = {
  question: PlayerQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  /** Exam tool: let the candidate strike options out. */
  eliminator?: boolean;
  uploader?: Uploader;
  /** Hide the prompt (the caller shows it), except for blanks which live in it. */
  hidePrompt?: boolean;
};

const optionBase =
  "flex w-full min-h-12 items-start gap-3 rounded-[10px] border-2 border-border bg-card px-3.5 py-3 text-left text-[15px] font-medium text-card-foreground outline-none transition-colors [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function QuestionPlayer(props: PlayerProps) {
  const { question, hidePrompt } = props;
  const showPrompt = !hidePrompt && question.type !== "FILL_BLANKS";
  return (
    <div className="flex flex-col gap-4">
      {showPrompt ? (
        <MathText as="div" className="text-[17px] font-semibold leading-relaxed text-foreground">
          {question.prompt}
        </MathText>
      ) : null}
      {question.media ? <MediaStimulus media={question.media} /> : null}
      <Body {...props} />
    </div>
  );
}

function Body(props: PlayerProps) {
  switch (props.question.type) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE":
      return <ChoicePlayer {...props} multiple={false} />;
    case "MULTIPLE_CHOICE":
      return <ChoicePlayer {...props} multiple />;
    case "SHORT_ANSWER":
      return <ShortAnswerPlayer {...props} />;
    case "ESSAY":
      return <EssayPlayer {...props} />;
    case "FILL_BLANKS":
      return <FillBlanksPlayer {...props} />;
    case "NUMERIC":
      return <NumericPlayer {...props} />;
    case "MATCHING":
      return <MatchingPlayer {...props} />;
    case "ORDERING":
      return <OrderingPlayer {...props} />;
    case "CATEGORIZE":
      return <CategorizePlayer {...props} />;
    case "HOTSPOT":
      return <HotspotPlayer {...props} />;
    case "MATRIX":
      return <MatrixPlayer {...props} />;
    case "EQUATION":
      return <EquationPlayer {...props} />;
    case "FILE_UPLOAD":
      return <FileUploadPlayer {...props} />;
    case "AUDIO_RESPONSE":
      return <AudioPlayer {...props} />;
    case "CODE":
      return <CodePlayer {...props} />;
  }
}

/* ───────────────────────────── stimulus ───────────────────────────── */

export function MediaStimulus({ media }: { media: Media }) {
  const [plays, setPlays] = useState(0);
  const limit = media.maxPlays ?? null;
  const exhausted = limit !== null && plays >= limit;
  if (media.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={media.url}
        alt={media.alt ?? "Question image"}
        className="max-h-[420px] w-auto max-w-full rounded-[10px] border-2 border-border bg-white object-contain"
        draggable={false}
      />
    );
  }
  if (media.kind === "audio") {
    return (
      <div className="flex flex-col gap-1">
        <audio
          src={media.url}
          controls={!exhausted}
          controlsList="nodownload noplaybackrate"
          onEnded={() => setPlays((p) => p + 1)}
          className="w-full max-w-md"
        />
        {limit !== null ? (
          <span className="text-xs font-bold text-muted-foreground">
            {exhausted ? "No plays left." : `Plays left: ${limit - plays}`}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <video
      src={media.url}
      controls
      controlsList="nodownload"
      className="max-h-[420px] w-full max-w-2xl rounded-[10px] border-2 border-border bg-black"
    />
  );
}

/* ───────────────────────────── choice ───────────────────────────── */

function ChoicePlayer({ question, value, onChange, disabled, eliminator, multiple }: PlayerProps & { multiple: boolean }) {
  const view = (question.view ?? {}) as { choices?: Keyed[] };
  const choices = view.choices ?? [];
  const picked = new Set(Array.isArray(value) ? (value as number[]) : []);
  const [struck, setStruck] = useState<Set<number>>(new Set());

  function toggle(key: number) {
    if (disabled) return;
    if (multiple) {
      const next = new Set(picked);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onChange([...next].sort((a, b) => a - b));
    } else {
      onChange(picked.has(key) ? [] : [key]);
    }
  }

  return (
    <div role={multiple ? "group" : "radiogroup"} className="flex flex-col gap-2">
      {multiple ? <p className="text-xs font-bold text-muted-foreground">Select all that apply.</p> : null}
      {choices.map((c, i) => {
        const on = picked.has(c.key);
        const out = struck.has(c.key);
        return (
          <div key={c.key} className="flex items-stretch gap-2">
            <button
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={on}
              data-choice-letter={LETTERS[i]}
              disabled={disabled}
              onClick={() => toggle(c.key)}
              className={cn(
                optionBase,
                on ? "border-primary bg-primary/10" : "hover:bg-muted",
                out && !on && "opacity-50"
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center border-2 text-[13px] font-black",
                  multiple ? "rounded-[6px]" : "rounded-full",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                )}
                aria-hidden
              >
                {on && multiple ? "✓" : LETTERS[i]}
              </span>
              <MathText className={cn("pt-0.5", out && !on && "line-through")}>{c.text}</MathText>
            </button>
            {eliminator ? (
              <button
                type="button"
                disabled={disabled}
                aria-pressed={out}
                aria-label={out ? `Restore option ${LETTERS[i]}` : `Strike out option ${LETTERS[i]}`}
                title={out ? "Restore option" : "Strike out (rule out) this option"}
                onClick={() =>
                  setStruck((prev) => {
                    const next = new Set(prev);
                    if (next.has(c.key)) next.delete(c.key);
                    else next.add(c.key);
                    return next;
                  })
                }
                className="grid w-10 shrink-0 place-items-center rounded-[10px] border-2 border-border bg-card text-sm font-black text-muted-foreground outline-none hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-ring"
              >
                <span className={out ? "" : "line-through"}>ab</span>
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── text ───────────────────────────── */

const inputClass =
  "w-full rounded-[10px] border-2 border-border bg-card px-3.5 py-2.5 text-[16px] font-medium text-card-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";

function ShortAnswerPlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { maxLength?: number };
  return (
    <input
      type="text"
      aria-label="Your answer"
      className={cn(inputClass, "max-w-xl")}
      maxLength={view.maxLength ?? 300}
      value={typeof value === "string" ? value : ""}
      disabled={disabled}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer"
    />
  );
}

export function wordsIn(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function EssayPlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { minWords?: number | null; maxWords?: number | null };
  const text = typeof value === "string" ? value : "";
  const words = wordsIn(text);
  const over = view.maxWords != null && words > view.maxWords;
  const under = view.minWords != null && words > 0 && words < view.minWords;
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        aria-label="Your answer"
        className={cn(inputClass, "min-h-64 resize-y leading-relaxed")}
        value={text}
        disabled={disabled}
        maxLength={20000}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your answer here"
      />
      <div className={cn("text-xs font-bold", over || under ? "text-destructive" : "text-muted-foreground")}>
        <span className="num">{words}</span> words
        {view.minWords != null ? ` · at least ${view.minWords}` : ""}
        {view.maxWords != null ? ` · at most ${view.maxWords}` : ""}
      </div>
    </div>
  );
}

function FillBlanksPlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { blanks?: { id: string; choices: string[] | null }[] };
  const blanks = new Map((view.blanks ?? []).map((b) => [b.id, b]));
  const resp = (value && typeof value === "object" ? value : {}) as Record<string, string>;
  const segments: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of question.prompt.matchAll(new RegExp(BLANK_PATTERN.source, "g"))) {
    const at = m.index ?? 0;
    if (at > last) segments.push(<MathText key={`t${at}`}>{question.prompt.slice(last, at)}</MathText>);
    const id = m[1];
    const blank = blanks.get(id);
    n++;
    const set = (v: string) => onChange({ ...resp, [id]: v });
    segments.push(
      blank?.choices ? (
        <select
          key={`b${id}`}
          aria-label={`Blank ${n}`}
          disabled={disabled}
          value={resp[id] ?? ""}
          onChange={(e) => set(e.target.value)}
          className="mx-1 inline-block min-h-10 rounded-[8px] border-2 border-primary/60 bg-card px-2 py-1 align-middle text-[15px] font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
        >
          <option value="">— choose —</option>
          {blank.choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <input
          key={`b${id}`}
          type="text"
          aria-label={`Blank ${n}`}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          value={resp[id] ?? ""}
          onChange={(e) => set(e.target.value)}
          className="mx-1 inline-block min-h-10 w-40 rounded-[8px] border-0 border-b-[3px] border-primary/60 bg-primary/5 px-2 py-1 align-middle text-[15px] font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
        />
      )
    );
    last = at + m[0].length;
  }
  if (last < question.prompt.length) segments.push(<MathText key="tail">{question.prompt.slice(last)}</MathText>);
  return <div className="text-[17px] font-semibold leading-[2.4] text-foreground">{segments}</div>;
}

function NumericPlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { unit?: string | null };
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        inputMode="decimal"
        aria-label="Your answer (a number)"
        className={cn(inputClass, "num max-w-56 text-right text-lg")}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9eE+\-.,/ ]/g, ""))}
        placeholder="0"
      />
      {view.unit ? <span className="text-[15px] font-bold text-muted-foreground">{view.unit}</span> : null}
    </div>
  );
}

/* ───────────────────────────── interactive ───────────────────────────── */

function MatchingPlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { left?: Keyed[]; right?: Keyed[] };
  const left = view.left ?? [];
  const right = view.right ?? [];
  const resp = Array.isArray(value) ? (value as (number | null)[]) : [];
  const set = (leftKey: number, rightKey: number | null) => {
    const next = [...resp];
    while (next.length <= leftKey) next.push(null);
    next[leftKey] = rightKey;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {left.map((l, i) => (
        <div key={l.key} className="grid items-center gap-2 rounded-[10px] border-2 border-border bg-card p-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-start gap-2 text-[15px] font-semibold">
            <span className="num text-muted-foreground">{i + 1}.</span>
            <MathText>{l.text}</MathText>
          </div>
          <Icon name="arrow-right" className="hidden size-4 text-muted-foreground sm:block" />
          <select
            aria-label={`Match for item ${i + 1}`}
            disabled={disabled}
            value={resp[l.key] ?? ""}
            onChange={(e) => set(l.key, e.target.value === "" ? null : Number(e.target.value))}
            className="min-h-11 w-full rounded-[8px] border-2 border-border bg-background px-2 text-[15px] font-medium outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
          >
            <option value="">— choose a match —</option>
            {right.map((r, j) => (
              <option key={r.key} value={r.key}>
                {LETTERS[j]}. {r.text}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function OrderingPlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { items?: Keyed[] };
  const items = view.items ?? [];
  const byKey = new Map(items.map((it) => [it.key, it]));
  const order: number[] =
    Array.isArray(value) && (value as number[]).length === items.length ? (value as number[]) : items.map((it) => it.key);
  const [drag, setDrag] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (disabled || to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Put these in order. Use the arrows or drag.">
      {order.map((key, i) => (
        <li
          key={key}
          draggable={!disabled}
          onDragStart={() => setDrag(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (drag !== null) move(drag, i);
            setDrag(null);
          }}
          className={cn(
            "flex items-center gap-3 rounded-[10px] border-2 border-border bg-card px-3 py-2.5",
            drag === i && "opacity-50"
          )}
        >
          <span className="cursor-grab text-muted-foreground" aria-hidden>
            <Icon name="grip" className="size-4" />
          </span>
          <span className="num w-6 text-sm font-black text-muted-foreground">{i + 1}</span>
          <MathText className="flex-1 text-[15px] font-semibold">{byKey.get(key)?.text ?? ""}</MathText>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={disabled || i === 0}
              onClick={() => move(i, i - 1)}
              aria-label="Move up"
              className="grid size-9 place-items-center rounded-[8px] border-2 border-border bg-background outline-none hover:bg-muted disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-ring"
            >
              <Icon name="chevron-up" className="size-4" />
            </button>
            <button
              type="button"
              disabled={disabled || i === order.length - 1}
              onClick={() => move(i, i + 1)}
              aria-label="Move down"
              className="grid size-9 place-items-center rounded-[8px] border-2 border-border bg-background outline-none hover:bg-muted disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-ring"
            >
              <Icon name="chevron-down" className="size-4" />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CategorizePlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { categories?: Keyed[]; items?: Keyed[] };
  const categories = view.categories ?? [];
  const items = view.items ?? [];
  const resp = Array.isArray(value) ? (value as (number | null)[]) : [];
  const [dragKey, setDragKey] = useState<number | null>(null);
  const place = (itemKey: number, cat: number | null) => {
    if (disabled) return;
    const next = [...resp];
    while (next.length <= itemKey) next.push(null);
    next[itemKey] = cat;
    onChange(next);
  };
  const unplaced = items.filter((it) => resp[it.key] === null || resp[it.key] === undefined);

  const chip = (it: Keyed) => (
    <div
      key={it.key}
      draggable={!disabled}
      onDragStart={() => setDragKey(it.key)}
      className="flex items-center gap-2 rounded-[8px] border-2 border-border bg-background px-2.5 py-1.5 text-sm font-semibold"
    >
      <MathText className="flex-1">{it.text}</MathText>
      <select
        aria-label={`Group for ${it.text}`}
        disabled={disabled}
        value={resp[it.key] ?? ""}
        onChange={(e) => place(it.key, e.target.value === "" ? null : Number(e.target.value))}
        className="max-w-36 rounded-[6px] border-2 border-border bg-card px-1 py-0.5 text-xs font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
      >
        <option value="">Group…</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.text}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (dragKey !== null) place(dragKey, null);
          setDragKey(null);
        }}
        className="flex min-h-14 flex-wrap gap-2 rounded-[10px] border-2 border-dashed border-border p-3"
        aria-label="Items not yet placed"
      >
        {unplaced.length === 0 ? (
          <span className="text-xs font-bold text-muted-foreground">Every item is placed.</span>
        ) : (
          unplaced.map(chip)
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div
            key={c.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragKey !== null) place(dragKey, c.key);
              setDragKey(null);
            }}
            className="flex min-h-32 flex-col gap-2 rounded-[10px] border-2 border-border bg-card p-3"
          >
            <MathText className="text-sm font-black uppercase tracking-wide text-muted-foreground">{c.text}</MathText>
            {items.filter((it) => resp[it.key] === c.key).map(chip)}
          </div>
        ))}
      </div>
    </div>
  );
}

function HotspotPlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { imageUrl?: string; alt?: string };
  const point = value && typeof value === "object" ? (value as { x: number; y: number }) : null;
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-muted-foreground">Click the correct place on the image.</p>
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={view.alt || "Image — click to mark your answer"}
        onClick={(e) => {
          if (disabled || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
          const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
          onChange({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
        }}
        className="relative inline-block max-w-full cursor-crosshair select-none self-start overflow-hidden rounded-[10px] border-2 border-border outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
      >
        {view.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.imageUrl} alt="" draggable={false} className="block max-h-[520px] w-auto max-w-full" />
        ) : (
          <div className="grid h-48 w-80 place-items-center bg-muted text-sm font-bold text-muted-foreground">No image</div>
        )}
        {point ? (
          <span
            aria-hidden
            className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-primary shadow-[0_0_0_3px_rgba(0,0,0,0.6)]"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

function MatrixPlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { rows?: string[]; columns?: string[]; multiple?: boolean };
  const rows = view.rows ?? [];
  const cols = view.columns ?? [];
  const resp = Array.isArray(value) ? (value as number[][]) : [];
  const toggle = (r: number, c: number) => {
    if (disabled) return;
    const next = rows.map((_, i) => [...(resp[i] ?? [])]);
    const cur = new Set(next[r]);
    if (view.multiple) {
      if (cur.has(c)) cur.delete(c);
      else cur.add(c);
      next[r] = [...cur].sort((a, b) => a - b);
    } else {
      next[r] = cur.has(c) ? [] : [c];
    }
    onChange(next);
  };
  return (
    <div className="overflow-x-auto rounded-[10px] border-2 border-border">
      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr className="bg-muted">
            <th className="p-2.5 text-left text-xs font-black uppercase text-muted-foreground" scope="col">
              Statement
            </th>
            {cols.map((c, i) => (
              <th key={i} scope="col" className="p-2.5 text-center text-xs font-black uppercase text-muted-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t-2 border-border">
              <th scope="row" className="p-2.5 text-left font-semibold">
                <MathText>{row}</MathText>
              </th>
              {cols.map((col, c) => {
                const on = (resp[r] ?? []).includes(c);
                return (
                  <td key={c} className="p-1.5 text-center">
                    <button
                      type="button"
                      role={view.multiple ? "checkbox" : "radio"}
                      aria-checked={on}
                      aria-label={`${row}: ${col}`}
                      disabled={disabled}
                      onClick={() => toggle(r, c)}
                      className={cn(
                        "mx-auto grid size-9 place-items-center border-2 outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
                        view.multiple ? "rounded-[6px]" : "rounded-full",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      {on ? "✓" : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TEX_BUTTONS: { label: string; insert: string; title: string }[] = [
  { label: "a/b", insert: "\\frac{}{}", title: "Fraction" },
  { label: "√", insert: "\\sqrt{}", title: "Square root" },
  { label: "xⁿ", insert: "^{}", title: "Power" },
  { label: "xₙ", insert: "_{}", title: "Subscript" },
  { label: "π", insert: "\\pi", title: "Pi" },
  { label: "×", insert: "\\times ", title: "Times" },
  { label: "÷", insert: "\\div ", title: "Divide" },
  { label: "( )", insert: "\\left(\\right)", title: "Brackets" },
  { label: "sin", insert: "\\sin(", title: "Sine" },
  { label: "log", insert: "\\log(", title: "Log" },
];

function EquationPlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { placeholder?: string | null };
  const text = typeof value === "string" ? value : "";
  const ref = useRef<HTMLInputElement>(null);
  function insert(snippet: string) {
    const el = ref.current;
    if (!el || disabled) return;
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + snippet + text.slice(end);
    onChange(next);
    const brace = snippet.indexOf("{}");
    const caret = start + (brace >= 0 ? brace + 1 : snippet.length);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Maths symbols">
        {TEX_BUTTONS.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            disabled={disabled}
            onClick={() => insert(b.insert)}
            className="min-h-9 min-w-10 rounded-[8px] border-2 border-border bg-card px-2 text-sm font-bold outline-none hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-ring"
          >
            {b.label}
          </button>
        ))}
      </div>
      <input
        ref={ref}
        type="text"
        aria-label="Your answer (maths)"
        className={cn(inputClass, "max-w-xl font-mono")}
        value={text}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        maxLength={500}
        placeholder={view.placeholder ?? "e.g. \\frac{x^2}{2} + 3x"}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="min-h-12 rounded-[10px] border-2 border-dashed border-border bg-background px-3 py-2">
        {text.trim() ? (
          <TexPreview tex={text} />
        ) : (
          <span className="text-xs font-bold text-muted-foreground">Your answer will appear here as maths.</span>
        )}
      </div>
    </div>
  );
}

function CodePlayer({ question, value, onChange, disabled }: PlayerProps) {
  const view = (question.view ?? {}) as { language?: string; starter?: string };
  const text = typeof value === "string" ? value : view.starter ?? "";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
        <Icon name="code" className="size-4" /> {view.language ?? "code"}
      </div>
      <textarea
        aria-label="Your code"
        className="min-h-72 w-full resize-y rounded-[10px] border-2 border-border bg-[#0f172a] p-3 font-mono text-[14px] leading-relaxed text-slate-100 outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
        value={text}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        maxLength={20000}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart;
            const next = text.slice(0, s) + "  " + text.slice(el.selectionEnd);
            onChange(next);
            requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
          }
        }}
      />
    </div>
  );
}

/* ───────────────────────────── media answers ───────────────────────────── */

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileUploadPlayer({ question, value, onChange, disabled, uploader }: PlayerProps) {
  const view = (question.view ?? {}) as { accept?: string[]; maxMb?: number };
  const file = value && typeof value === "object" ? (value as UploadedFile) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxMb = view.maxMb ?? 10;
  return (
    <div className="flex flex-col gap-2">
      {file ? (
        <div className="flex items-center gap-3 rounded-[10px] border-2 border-border bg-card px-3 py-2.5">
          <Icon name="file" className="size-5 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{file.name}</div>
            <div className="text-xs text-muted-foreground">{formatSize(file.size)} · uploaded</div>
          </div>
          {!disabled ? (
            <button type="button" onClick={() => onChange(null)} className="text-xs font-bold text-destructive underline">
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
      <label
        className={cn(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-border bg-background p-4 text-center text-sm font-bold",
          (disabled || busy || !uploader) && "cursor-not-allowed opacity-60"
        )}
      >
        <Icon name="upload" className="size-5" />
        {busy ? "Uploading…" : file ? "Replace file" : "Choose a file to upload"}
        <span className="text-xs font-medium text-muted-foreground">
          {(view.accept ?? []).join(", ").replace(/application\/|image\//g, "") || "PDF or image"} · up to {maxMb} MB
        </span>
        <input
          type="file"
          className="sr-only"
          accept={(view.accept ?? []).join(",")}
          disabled={disabled || busy || !uploader}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !uploader) return;
            if (f.size > maxMb * 1024 * 1024) return setError(`That file is larger than ${maxMb} MB.`);
            setError(null);
            setBusy(true);
            const res = await uploader(f, f.name);
            setBusy(false);
            if ("error" in res) setError(res.error);
            else onChange(res);
          }}
        />
      </label>
      {!uploader ? <p className="text-xs font-bold text-muted-foreground">Uploads are available when you sit the exam.</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AudioPlayer({ question, value, onChange, disabled, uploader }: PlayerProps) {
  const view = (question.view ?? {}) as { maxSec?: number };
  const maxSec = view.maxSec ?? 120;
  const saved = value && typeof value === "object" ? (value as UploadedFile) : null;
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    if (!uploader) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError("The microphone is blocked. Allow it in the browser and try again.");
    }
    const chunks: Blob[] = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const r = new MediaRecorder(stream, { mimeType: mime });
    rec.current = r;
    const startedAt = Date.now();
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      const blob = new Blob(chunks, { type: mime });
      setLocalUrl(URL.createObjectURL(blob));
      setState("uploading");
      const res = await uploader(blob, `answer.${mime === "audio/webm" ? "weba" : "m4a"}`);
      setState("idle");
      if ("error" in res) setError(res.error);
      else onChange({ ...res, durationSec: Math.round((Date.now() - startedAt) / 1000) });
    };
    r.start(1000);
    setState("recording");
    setElapsed(0);
    timer.current = setInterval(() => {
      const s = Math.round((Date.now() - startedAt) / 1000);
      setElapsed(s);
      if (s >= maxSec) r.stop();
    }, 250);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {state === "recording" ? (
          <button
            type="button"
            onClick={() => rec.current?.stop()}
            className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border-2 border-destructive bg-destructive px-4 font-bold text-white"
          >
            <span className="size-2.5 animate-pulse rounded-full bg-white" /> Stop · {elapsed}s / {maxSec}s
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={disabled || state === "uploading" || !uploader}
            className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border-2 border-border bg-card px-4 font-bold outline-none hover:bg-muted disabled:opacity-60 focus-visible:outline-[3px] focus-visible:outline-ring"
          >
            <Icon name="mic" className="size-4" />
            {state === "uploading" ? "Saving…" : saved ? "Record again" : "Start recording"}
          </button>
        )}
        <span className="text-xs font-bold text-muted-foreground">Up to {maxSec} seconds.</span>
      </div>
      {localUrl ? <audio src={localUrl} controls className="w-full max-w-md" /> : null}
      {saved && !localUrl ? (
        <p className="text-sm font-bold text-foreground">✓ Recording saved{saved.durationSec ? ` (${saved.durationSec}s)` : ""}.</p>
      ) : null}
      {!uploader ? <p className="text-xs font-bold text-muted-foreground">Recording is available when you sit the exam.</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
