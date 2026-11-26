"use client";

/**
 * AssistPanel — ask the AI for something, look at it, then decide.
 *
 * A generic shell for "describe what you want → wait → review → apply". It
 * knows nothing about certificates, site pages or anything else: the caller
 * supplies the request, the preview and what Apply does. Nothing is applied or
 * saved by this component on its own, ever — the only thing it does with a
 * result is hand it to `onApply` when the person presses Apply.
 *
 * PROPS
 *
 *   title            Heading of the panel.
 *   description      One or two sentences under the heading. Optional.
 *   modes            What can be asked for. `create` is required; add `revise`
 *                    to offer "change what is already here" as a second mode
 *                    (a switch appears). Each mode is an `AssistModeConfig`:
 *                      label         text on the mode switch          ("New design")
 *                      promptLabel   label of the text box            ("What is it for?")
 *                      placeholder   text box placeholder             (optional)
 *                      examples      example prompts, shown as buttons that
 *                                    fill the text box                (optional)
 *                      submitLabel   text on the button               ("Design it")
 *                      busyLabel     shown while waiting              ("Designing…")
 *                      unavailable   a sentence saying why this mode cannot be
 *                                    used right now; the mode stays visible but
 *                                    cannot be chosen                 (optional)
 *   initialMode      Which mode is selected first. Defaults to "create".
 *   submit           async ({ mode, prompt, signal }) => AssistOutcome<T>.
 *                    Do the request and RETURN the outcome — never throw:
 *                      { ok: true,  value, notes?, blocked? }
 *                      { ok: false, message, retryable? }
 *                    `value` is opaque to the panel; it is passed back to
 *                    `renderPreview` and `onApply`. `notes` are shown above the
 *                    preview. `blocked: true` disables Apply (say why in a note
 *                    with severity "error"). `signal` aborts when the person
 *                    stops waiting or the panel unmounts; honouring it is
 *                    optional — a late result is ignored either way.
 *   renderPreview    (value) => ReactNode. How to show a result before it is
 *                    applied. Render it the way it will really look.
 *   onApply          (value, mode) => void. Put the result where it belongs.
 *   onUndo           Optional. When given, an "Undo" button is offered after
 *                    Apply and calls this; the caller restores what was there.
 *   renderFields     Optional. (mode, disabled) => ReactNode — extra inputs
 *                    shown under the text box (a style, an orientation…). The
 *                    caller owns their state and reads it inside `submit`.
 *   busyHint         Line shown under the busy label.
 *                    Default: "This usually takes under a minute."
 *   applyLabel       Text on the Apply button. Default: "Apply".
 *   appliedMessage   Shown after Apply. Default says it is not saved yet.
 *   maxLength        Longest prompt accepted. Default 1500.
 *   disabledReason   When set, the whole panel is read-only and this sentence
 *                    says why (no permission, AI not set up…).
 *   className        Extra classes for the outer element.
 *
 * States: idle → busy → (error | result) → applied. A new request can be
 * started from any state except busy.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

export type AssistMode = "create" | "revise";

export type AssistNote = {
  /** `error` is something that must be fixed before the result is usable. */
  severity: "error" | "warning" | "info";
  message: string;
};

export type AssistOutcome<T> =
  | { ok: true; value: T; notes?: AssistNote[]; blocked?: boolean }
  | { ok: false; message: string; retryable?: boolean };

export type AssistModeConfig = {
  label: string;
  promptLabel: string;
  placeholder?: string;
  examples?: string[];
  submitLabel: string;
  busyLabel: string;
  unavailable?: string | null;
};

export type AssistPanelProps<T> = {
  title: string;
  description?: ReactNode;
  modes: { create: AssistModeConfig; revise?: AssistModeConfig };
  initialMode?: AssistMode;
  submit: (input: { mode: AssistMode; prompt: string; signal: AbortSignal }) => Promise<AssistOutcome<T>>;
  renderPreview: (value: T) => ReactNode;
  onApply: (value: T, mode: AssistMode) => void;
  onUndo?: () => void;
  renderFields?: (mode: AssistMode, disabled: boolean) => ReactNode;
  busyHint?: string;
  applyLabel?: string;
  appliedMessage?: string;
  maxLength?: number;
  disabledReason?: string | null;
  className?: string;
};

type Phase<T> =
  | { kind: "idle" }
  | { kind: "busy"; mode: AssistMode }
  | { kind: "error"; message: string; retryable: boolean }
  | { kind: "result"; mode: AssistMode; value: T; notes: AssistNote[]; blocked: boolean }
  | { kind: "applied" };

const SEVERITY: Record<AssistNote["severity"], { label: string; icon: IconName; className: string }> = {
  error: {
    label: "Must fix",
    icon: "alert-triangle",
    className: "border-destructive bg-destructive/10",
  },
  warning: { label: "Check", icon: "alert-triangle", className: "border-warning bg-warning/15" },
  info: { label: "Note", icon: "check-circle", className: "border-border bg-muted" },
};

const SEVERITY_ORDER: AssistNote["severity"][] = ["error", "warning", "info"];

const FOCUS_RING =
  "outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

export function AssistPanel<T>({
  title,
  description,
  modes,
  initialMode = "create",
  submit,
  renderPreview,
  onApply,
  onUndo,
  renderFields,
  busyHint = "This usually takes under a minute.",
  applyLabel = "Apply",
  appliedMessage = "Applied. Nothing is saved until you save.",
  maxLength = 1500,
  disabledReason = null,
  className,
}: AssistPanelProps<T>) {
  const uid = useId();
  const promptId = `${uid}-prompt`;
  const hintId = `${uid}-hint`;
  const blockedId = `${uid}-blocked`;

  const available = (mode: AssistMode) => Boolean(modes[mode]) && !modes[mode]?.unavailable;
  const [selectedMode, setSelectedMode] = useState<AssistMode>(initialMode);
  // A mode can become unavailable while it is selected (the thing to revise
  // was deleted). Fall back rather than leave a dead form on screen.
  const mode: AssistMode = available(selectedMode) ? selectedMode : "create";
  const config = modes[mode] ?? modes.create;

  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase<T>>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  /** Identifies the newest request, so a slow old one cannot overwrite it. */
  const requestNumber = useRef(0);

  const busy = phase.kind === "busy";
  const locked = Boolean(disabledReason);

  // Stop the request when the panel goes away.
  useEffect(
    () => () => {
      requestNumber.current += 1;
      controller.current?.abort();
    },
    []
  );

  // A visible clock, because "is it still working?" is the only question
  // anyone has while they wait.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  // When an answer arrives, take the reader to it: it can be below the fold,
  // and a screen reader would otherwise never learn that it is there.
  const phaseKind = phase.kind;
  useEffect(() => {
    if (phaseKind === "result" || phaseKind === "error") resultRef.current?.focus();
  }, [phaseKind]);

  async function run(runMode: AssistMode, text: string) {
    const trimmed = text.trim();
    if (!trimmed || locked) return;

    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const number = ++requestNumber.current;

    setElapsed(0);
    setPhase({ kind: "busy", mode: runMode });

    let outcome: AssistOutcome<T>;
    try {
      outcome = await submit({ mode: runMode, prompt: trimmed, signal: current.signal });
    } catch {
      // `submit` is asked never to throw; if it does, say so plainly.
      outcome = { ok: false, message: "The request could not be completed. Please try again.", retryable: true };
    }
    // Stopped, superseded or unmounted while it was in flight.
    if (number !== requestNumber.current) return;

    setPhase(
      outcome.ok
        ? {
            kind: "result",
            mode: runMode,
            value: outcome.value,
            notes: outcome.notes ?? [],
            blocked: outcome.blocked ?? false,
          }
        : { kind: "error", message: outcome.message, retryable: outcome.retryable ?? true }
    );
  }

  function stopWaiting() {
    requestNumber.current += 1;
    controller.current?.abort();
    setPhase({ kind: "idle" });
    promptRef.current?.focus();
  }

  function fillExample(example: string) {
    setPrompt(example);
    promptRef.current?.focus();
  }

  const modeList = (["create", "revise"] as const).filter((m) => modes[m]);
  const unavailableNote = modeList
    .map((m) => modes[m]?.unavailable)
    .find((reason): reason is string => Boolean(reason));
  const canSubmit = !busy && !locked && prompt.trim().length > 0;
  const notes =
    phase.kind === "result"
      ? [...phase.notes].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
      : [];

  return (
    <section aria-labelledby={`${uid}-title`} className={cn("flex flex-col gap-4", className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={`${uid}-title`} className="flex items-center gap-2 text-base font-bold text-foreground">
            <Icon name="sparkles" className="size-4 shrink-0" aria-hidden />
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-prose text-[13px] font-medium text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {modeList.length > 1 ? (
          <div
            role="group"
            aria-label="What to do"
            className="inline-flex shrink-0 overflow-hidden rounded-[10px] border-2 border-border shadow-sm"
          >
            {modeList.map((m, index) => {
              const item = modes[m]!;
              const active = m === mode;
              const off = Boolean(item.unavailable) || busy || locked;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  // aria-disabled, not disabled: the button stays reachable so
                  // the reason it cannot be used (shown below) can be found.
                  aria-disabled={off || undefined}
                  onClick={() => {
                    if (!off) setSelectedMode(m);
                  }}
                  className={cn(
                    "px-3.5 py-2 text-[13px] font-bold [touch-action:manipulation] transition-colors",
                    FOCUS_RING,
                    "focus-visible:-outline-offset-[3px]",
                    index > 0 && "border-l-2 border-border",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
                    off && !active && "cursor-not-allowed opacity-60 hover:bg-card hover:text-card-foreground"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      {locked ? (
        <p role="note" className="rounded-[10px] border-2 border-border bg-muted px-3 py-2 text-[13px] font-medium">
          {disabledReason}
        </p>
      ) : null}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void run(mode, prompt);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={promptId} className="text-[13px] font-bold text-foreground">
            {config.promptLabel}
          </label>
          <textarea
            ref={promptRef}
            id={promptId}
            value={prompt}
            maxLength={maxLength}
            rows={3}
            disabled={busy || locked}
            aria-describedby={hintId}
            placeholder={config.placeholder}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds a line, as in any text box; Ctrl/Cmd+Enter sends.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
                e.preventDefault();
                void run(mode, prompt);
              }
            }}
            className="min-h-20 w-full resize-y rounded-[10px] border-2 border-border bg-card px-3.5 py-2.5 text-[15px] font-medium leading-relaxed text-card-foreground outline-none transition-shadow placeholder:font-normal placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p id={hintId} className="text-xs font-medium text-muted-foreground">
            {unavailableNote ? `${unavailableNote} ` : ""}
            Ctrl+Enter sends.
          </p>
        </div>

        {config.examples && config.examples.length > 0 && !locked ? (
          <div>
            <p id={`${uid}-examples`} className="text-xs font-bold text-muted-foreground">
              For example
            </p>
            <ul aria-labelledby={`${uid}-examples`} className="mt-1.5 flex flex-col items-start gap-1.5">
              {config.examples.map((example) => (
                <li key={example} className="max-w-full">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fillExample(example)}
                    className={cn(
                      "max-w-full rounded-[8px] border-2 border-dashed border-border bg-card px-2.5 py-1.5 text-left text-[13px] font-medium text-card-foreground [touch-action:manipulation] hover:border-solid hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60",
                      FOCUS_RING
                    )}
                  >
                    <span className="sr-only">Use this example: </span>
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {renderFields ? renderFields(mode, busy || locked) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit}>
            <Icon name="sparkles" aria-hidden />
            {config.submitLabel}
          </Button>
          {busy ? (
            <Button type="button" variant="outline" onClick={stopWaiting}>
              Stop waiting
            </Button>
          ) : null}
        </div>
      </form>

      {/* The label is announced once; the clock is for eyes only, or a screen
          reader would read out every passing second. */}
      <div role="status" aria-live="polite">
        {busy ? (
          <div className="flex items-center gap-3 rounded-[10px] border-2 border-border bg-muted px-3 py-2.5">
            <span
              aria-hidden
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-foreground motion-reduce:animate-none"
            />
            <p className="min-w-0 text-[13px] font-medium">
              <span className="font-bold">{modes[phase.mode]?.busyLabel ?? config.busyLabel}</span>{" "}
              <span className="text-muted-foreground">{busyHint}</span>{" "}
              <span aria-hidden className="num text-muted-foreground">
                {elapsed}s
              </span>
            </p>
          </div>
        ) : null}
        {phase.kind === "applied" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border-2 border-border bg-muted px-3 py-2.5">
            <p className="min-w-0 flex-1 basis-56 text-[13px] font-medium">
              <Icon name="check-circle" className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
              {appliedMessage}
            </p>
            {onUndo ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onUndo();
                  setPhase({ kind: "idle" });
                }}
              >
                Undo
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {phase.kind === "error" ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="alert"
          className={cn("rounded-[10px] border-2 border-destructive bg-destructive/10 px-3 py-3", FOCUS_RING)}
        >
          <p className="flex items-start gap-2 text-sm font-bold text-foreground">
            <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{phase.message}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {phase.retryable ? (
              <Button type="button" size="sm" disabled={!canSubmit} onClick={() => void run(mode, prompt)}>
                <Icon name="refresh" aria-hidden />
                Try again
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={() => setPhase({ kind: "idle" })}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {phase.kind === "result" ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="region"
          aria-label="Result"
          className={cn("flex flex-col gap-3 rounded-[12px] border-2 border-border bg-background p-3", FOCUS_RING)}
        >
          <p className="text-[13px] font-bold text-foreground">
            {phase.blocked
              ? "This result has a problem that has to be fixed first."
              : "Here is what it made. Nothing changes until you apply it."}
          </p>

          {notes.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {notes.map((note, index) => {
                const style = SEVERITY[note.severity];
                return (
                  <li
                    key={`${note.severity}-${index}`}
                    className={cn("flex items-start gap-2 rounded-[8px] border-2 px-2.5 py-2 text-[13px]", style.className)}
                  >
                    <Icon name={style.icon} className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 font-medium">
                      <span className="font-bold">{style.label}: </span>
                      {note.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div>{renderPreview(phase.value)}</div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              // aria-disabled so the button can still be reached and its reason heard.
              aria-disabled={phase.blocked || undefined}
              aria-describedby={phase.blocked ? blockedId : undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => {
                if (phase.blocked) return;
                onApply(phase.value, phase.mode);
                setPhase({ kind: "applied" });
              }}
            >
              <Icon name="check" aria-hidden />
              {applyLabel}
            </Button>
            <Button type="button" variant="outline" disabled={!canSubmit} onClick={() => void run(phase.mode, prompt)}>
              <Icon name="refresh" aria-hidden />
              Try again
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPhase({ kind: "idle" })}>
              Discard
            </Button>
          </div>
          {phase.blocked ? (
            <p id={blockedId} className="text-xs font-medium text-muted-foreground">
              It cannot be applied as it is. Try again, or change your request.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
