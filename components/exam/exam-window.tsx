"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuestionPlayer, MediaStimulus, type Uploader } from "@/components/assessments/question-player";
import { MathText } from "@/components/assessments/math-text";
import { Icon } from "@/components/icon";
import { Calculator } from "@/components/exam/calculator";
import { useExamEngine, type ExamEngine } from "@/components/exam/use-exam-engine";
import { createLockdown, enterFullscreen, isFullscreen } from "@/lib/client/exam/lockdown";
import { examStore } from "@/lib/client/exam/store";
import { apiPost } from "@/lib/client/api";
import { putFileToStorage } from "@/lib/client/image-upload";
import { isResponseAnswered } from "@/lib/assessments/types";
import type { PackageItem } from "@/lib/exams/paper";
import { cn } from "@/lib/utils";

/**
 * The CBT exam window: a full-screen, locked-down paper.
 *
 * Owns presentation and navigation rules; the engine (use-exam-engine) owns
 * answers, the clock and sync; the lockdown controller reports integrity
 * events. See those modules for the guarantees each one makes.
 */

const EXAM_CSS = `
.exam-root { --exam-zoom: 1; }
.exam-paper { zoom: var(--exam-zoom); }
.exam-hc { --background:#000; --foreground:#fff; --card:#0a0a0a; --card-foreground:#fff; --border:#f5f5f5; --muted:#1a1a1a; --muted-foreground:#e5e5e5; --primary:#ffd400; --primary-foreground:#000; --ring:#ffd400; }
.exam-dys { letter-spacing: .04em; word-spacing: .14em; line-height: 1.85; }
@media print { .exam-root { display: none !important; } body::after { content: "Printing is disabled during the exam."; } }
.exam-noselect { -webkit-user-select: none; user-select: none; }
.exam-noselect input, .exam-noselect textarea, .exam-noselect [data-allow-select] { -webkit-user-select: text; user-select: text; }
`;

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function plain(s: string): string {
  return s.replace(/\$\$?([^$]+)\$\$?/g, " $1 ").replace(/\[\[[^\]]+\]\]/g, " blank ").replace(/\\[a-z]+/gi, " ");
}

function watermark(text: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='220'><text x='10' y='120' transform='rotate(-24 210 110)' font-family='system-ui' font-size='15' font-weight='700' fill='rgba(120,120,120,0.10)'>${text.replace(/[<&>'"]/g, "")}</text></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export function ExamWindow({ examId }: { examId: string }) {
  const engine = useExamEngine(examId);

  if (engine.phase === "booting") {
    return (
      <FullScreenMessage icon="refresh" title="Preparing your exam…">
        Downloading the paper to this device so it keeps working if the network drops.
      </FullScreenMessage>
    );
  }
  if (engine.phase === "error") {
    const code = engine.error?.code;
    return (
      <FullScreenMessage icon="alert-triangle" title={code === "other_device" ? "Open on another device" : "The exam could not open"}>
        <p>{engine.error?.message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => engine.retry()} className="min-h-11 rounded-[10px] border-2 border-border bg-primary px-5 font-black text-primary-foreground">
            Try again
          </button>
          <a href={`/exam/${examId}`} className="inline-flex min-h-11 items-center rounded-[10px] border-2 border-border bg-card px-5 font-black">
            Back to the exam lobby
          </a>
        </div>
      </FullScreenMessage>
    );
  }
  if (engine.phase === "finished") return <Finished examId={examId} attemptId={engine.payload?.attemptId ?? ""} />;
  return <Running engine={engine} examId={examId} />;
}

function Finished({ examId, attemptId }: { examId: string; attemptId: string }) {
  useEffect(() => {
    const t = setTimeout(() => location.replace(`/exam/${examId}/done?attempt=${attemptId}`), 1200);
    return () => clearTimeout(t);
  }, [examId, attemptId]);
  return (
    <FullScreenMessage icon="check-circle" title="Your exam has been submitted">
      Your answers are safely with the examiners. Opening your receipt…
    </FullScreenMessage>
  );
}

export function FullScreenMessage({ icon, title, children }: { icon: "refresh" | "alert-triangle" | "check-circle" | "pause" | "lock" | "maximize"; title: string; children?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-6 text-center">
      <div className="max-w-lg">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full border-2 border-border bg-card">
          <Icon name={icon} className={cn("size-7", icon === "refresh" && "animate-spin")} />
        </div>
        <h1 className="font-heading text-2xl font-black">{title}</h1>
        <div className="mt-2 text-[15px] font-medium text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/* ═════════════════════════════ the running exam ═════════════════════════════ */

type ToolPanel = null | "calculator" | "formula" | "notes";

function Running({ engine, examId }: { engine: ExamEngine; examId: string }) {
  const p = engine.payload!;
  const sec = p.exam.security;
  const tools = p.exam.tools;
  const items = p.pkg.items;
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const order = useMemo(() => p.pkg.sections.flatMap((s) => s.itemKeys), [p.pkg.sections]);
  const sectionOf = useMemo(() => new Map(p.pkg.sections.flatMap((s) => s.itemKeys.map((k) => [k, s.id] as const))), [p.pkg.sections]);
  const groups = useMemo(() => new Map(p.pkg.groups.map((g) => [g.id, g])), [p.pkg.groups]);

  const [saved] = useState(() => engine.progress());
  const [current, setCurrent] = useState<string>(saved.current && byKey.has(saved.current) ? saved.current : order[0]);
  const visited = useRef<string[]>(saved.visited);
  const [lockedSections, setLockedSections] = useState<string[]>(saved.lockedSections);
  /** Exam time remaining (ms) when each section was first entered: section clocks run on the exam clock. */
  const [sectionStart, setSectionStart] = useState<Record<string, number>>(saved.sectionStartedAt);

  const [fullscreen, setFullscreen] = useState(isFullscreen());
  const [started, setStarted] = useState(!sec.requireFullscreen);
  const [away, setAway] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [panel, setPanel] = useState<ToolPanel>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [contrast, setContrast] = useState(false);
  const [dyslexic, setDyslexic] = useState(false);
  const [lineReader, setLineReader] = useState(false);
  const [highlighter, setHighlighter] = useState(false);
  const [readerY, setReaderY] = useState(0);
  const [notes, setNotes] = useState<Record<string, { text: string; highlights: number[] }>>({});
  const [, force] = useState(0);
  const timeAcc = useRef<{ key: string; ms: number; since: number | null }>({ key: current, ms: 0, since: null });

  const canWrite = engine.status === "IN_PROGRESS" && !engine.paused && !engine.pendingSubmit;
  const remaining = engine.remainingMs();
  const item = byKey.get(current)!;
  const idx = order.indexOf(current);
  const sectionId = sectionOf.get(current)!;
  const section = p.pkg.sections.find((s) => s.id === sectionId)!;
  const sectionLeft = section.timeLimitMin
    ? section.timeLimitMin * 60_000 - ((sectionStart[sectionId] ?? remaining) - remaining)
    : null;

  // The latest values, for the clock tick below (which runs outside render).
  const live = useRef({ sectionId, sectionLeft, lockedSections, sectionStart, sectionTitle: section.title });
  useEffect(() => {
    live.current = { sectionId, sectionLeft, lockedSections, sectionStart, sectionTitle: section.title };
  });

  // The clock tick: re-render four times a second, start section clocks, and
  // when a section's own time runs out lock it and move the paper on.
  useEffect(() => {
    const t = setInterval(() => {
      force((n) => n + 1);
      const l = live.current;
      if (l.sectionStart[l.sectionId] === undefined) {
        setSectionStart((s) => (s[l.sectionId] === undefined ? { ...s, [l.sectionId]: engine.remainingMs() } : s));
      }
      if (l.sectionLeft !== null && l.sectionLeft <= 0 && !l.lockedSections.includes(l.sectionId)) {
        setLockedSections((locked) => (locked.includes(l.sectionId) ? locked : [...locked, l.sectionId]));
        const nextSection = p.pkg.sections[p.pkg.sections.findIndex((s) => s.id === l.sectionId) + 1];
        if (nextSection?.itemKeys[0]) {
          setCurrent(nextSection.itemKeys[0]);
          setWarning(`Time for “${l.sectionTitle}” is up. You have moved on to “${nextSection.title}”.`);
        }
      }
    }, 250);
    return () => clearInterval(t);
  }, [engine, p.pkg.sections]);

  // Notes and highlights stay on this device only.
  useEffect(() => {
    void examStore.notes(p.attemptId).then((ns) =>
      setNotes(Object.fromEntries(ns.map((n) => [n.key, { text: n.text, highlights: n.highlights }])))
    );
  }, [p.attemptId]);

  // Service worker: cache this page, its scripts and every question's media.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(process.env.NODE_ENV === "production" ? "/exam-sw.js" : "/exam-sw.js?dev=1", { scope: "/exam/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const scripts = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin + "/_next/static/"));
        reg.active?.postMessage({ type: "precache", urls: [location.href, ...scripts, ...p.pkg.assets] });
      })
      .catch(() => undefined);
  }, [p.pkg.assets]);

  // Lockdown.
  const onAway = useCallback(
    (isAway: boolean, ms: number) => {
      setAway(isAway);
      if (!isAway && ms > 1500) {
        setWarning(
          `You left the exam for ${Math.round(ms / 1000)} s. This has been recorded and the invigilator can see it.`
        );
        if (sec.awayAutoSubmitSec && ms / 1000 >= sec.awayAutoSubmitSec) {
          void engine.logEvent("AWAY_TIMEOUT", { awayMs: ms });
          void engine.submit("AWAY");
        }
      }
    },
    [engine, sec.awayAutoSubmitSec]
  );
  useEffect(() => {
    const lock = createLockdown({
      security: sec,
      onEvent: (e) => void engine.logEvent(e.type, e.detail),
      onAway,
      onFullscreenChange: setFullscreen,
      onBlocked: (m) => {
        setToast(m);
        setTimeout(() => setToast(null), 2600);
      },
    });
    lock.start();
    return () => lock.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track time on the current question (paused clocks and hidden tabs excluded).
  useEffect(() => {
    const acc = timeAcc.current;
    if (acc.key !== current) {
      const total = acc.ms + (acc.since ? Date.now() - acc.since : 0);
      if (total >= 1000) void engine.addTime(acc.key, Math.round(total / 1000));
      timeAcc.current = { key: current, ms: 0, since: Date.now() };
    }
  }, [current, engine]);
  useEffect(() => {
    const acc = timeAcc.current;
    if (away || engine.paused) {
      if (acc.since) {
        acc.ms += Date.now() - acc.since;
        acc.since = null;
      }
    } else if (!acc.since) acc.since = Date.now();
  }, [away, engine.paused]);

  // Remember where the candidate is, so a reload lands on the same question.
  useEffect(() => {
    if (!visited.current.includes(current)) visited.current = [...visited.current, current];
    void engine.saveProgress({ current, visited: visited.current, lockedSections, sectionStartedAt: sectionStart });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, lockedSections, sectionStart]);

  /* ─────────── navigation rules ─────────── */

  const reachable = useCallback(
    (key: string) => {
      const sid = sectionOf.get(key)!;
      if (lockedSections.includes(sid) && sid !== sectionId) return false;
      if (lockedSections.includes(sid)) return false;
      const target = order.indexOf(key);
      if (p.exam.navigation === "LINEAR") return target >= idx;
      if (p.exam.navigation === "SECTION_LOCKED") {
        const curSection = p.pkg.sections.findIndex((s) => s.id === sectionId);
        const tSection = p.pkg.sections.findIndex((s) => s.id === sid);
        return tSection >= curSection;
      }
      return true;
    },
    [lockedSections, sectionId, order, idx, p.exam.navigation, p.pkg.sections, sectionOf]
  );

  const go = useCallback(
    (key: string) => {
      if (!key || key === current || !reachable(key)) return;
      const fromSection = sectionId;
      const toSection = sectionOf.get(key)!;
      if (p.exam.navigation !== "FREE" && toSection !== fromSection) {
        // Leaving a section under section-locked / linear navigation closes it.
        setLockedSections((l) => (l.includes(fromSection) ? l : [...l, fromSection]));
      }
      setCurrent(key);
      setPaletteOpen(false);
      document.getElementById("exam-question")?.focus();
    },
    [current, reachable, sectionId, sectionOf, p.exam.navigation]
  );
  const next = () => order[idx + 1] && go(order[idx + 1]);
  const prev = () => order[idx - 1] && go(order[idx - 1]);

  // Keyboard: A–E pick an option, N/P next/previous, F flag, S review.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      const k = e.key.toLowerCase();
      if ("abcde".includes(k) && k.length === 1) {
        const btn = document.querySelector<HTMLButtonElement>(`#exam-question [data-choice-letter="${k.toUpperCase()}"]`);
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      } else if (k === "n" || k === "arrowright") {
        e.preventDefault();
        next();
      } else if (k === "p" || k === "arrowleft") {
        e.preventDefault();
        prev();
      } else if (k === "f" && tools.flagging) {
        e.preventDefault();
        void engine.toggleFlag(current);
      } else if (k === "s") {
        e.preventDefault();
        setReviewOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ─────────── uploads for file / audio answers ─────────── */

  const uploader: Uploader = useCallback(
    async (file, name) => {
      const type = (file as File).type || "application/octet-stream";
      const res = await apiPost<{ url: string; key: string }>(`/api/exam/attempts/${p.attemptId}/upload`, {
        contentType: type,
        contentLength: file.size,
      });
      if (!res.data) return { error: res.error?.message ?? "Could not upload. Check the connection." };
      const put = await putFileToStorage({ url: res.data.url, file: file as File, contentType: type });
      if (!put.ok) return { error: put.message };
      return { key: res.data.key, name, size: file.size, type };
    },
    [p.attemptId]
  );

  /* ─────────── derived ─────────── */

  const resp = engine.responses[current];
  const questionLocked = !!item.timeLimitSec && (resp?.timeSpentSec ?? 0) >= item.timeLimitSec;
  const answeredOf = (k: string) => {
    const it = byKey.get(k);
    return !!it && isResponseAnswered(it.type, engine.responses[k]?.answer);
  };
  const strikesLeft = sec.maxViolations > 0 ? Math.max(0, sec.maxViolations - engine.strikes.count) : null;
  const timerTone = remaining <= 60_000 ? "critical" : remaining <= 5 * 60_000 ? "danger" : remaining <= 10 * 60_000 ? "warn" : "ok";
  const group = item.groupId ? groups.get(item.groupId) : undefined;
  const wm = sec.watermark ? watermark(`${p.candidate.fullName} · ${p.candidate.candidateNo} · ${new Date().toLocaleDateString()}`) : undefined;

  // The two-minute and one-minute warnings are spoken too, where allowed.
  const announced = useRef<Set<number>>(new Set());
  useEffect(() => {
    for (const mark of [10, 5, 1]) {
      if (remaining <= mark * 60_000 && remaining > (mark * 60_000 - 3000) && !announced.current.has(mark)) {
        announced.current.add(mark);
        setWarning(`${mark} minute${mark === 1 ? "" : "s"} left.`);
        if (tools.textToSpeech && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(`${mark} minute${mark === 1 ? "" : "s"} remaining`));
      }
    }
  }, [remaining, tools.textToSpeech]);

  const needsFullscreen = sec.requireFullscreen && (!fullscreen || !started);
  const hidePaper = needsFullscreen || engine.paused || engine.status === "LOCKED" || !!engine.pendingSubmit;

  return (
    <div
      className={cn("exam-root exam-noselect relative flex min-h-dvh flex-col bg-background text-foreground", contrast && "exam-hc", dyslexic && "exam-dys")}
      style={{ ["--exam-zoom" as string]: zoom }}
      onMouseMove={lineReader ? (e) => setReaderY(e.clientY) : undefined}
    >
      <style>{EXAM_CSS}</style>

      {/* ───────── header ───────── */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-border bg-card px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1 basis-48">
          <div className="truncate text-sm font-black">{p.exam.title}</div>
          <div className="truncate text-xs font-bold text-muted-foreground">
            {p.candidate.fullName} · <span className="num">{p.candidate.candidateNo}</span>
          </div>
        </div>
        <ConnectionPill engine={engine} />
        {strikesLeft !== null ? (
          <span
            className={cn("rounded-full border-2 px-2.5 py-1 text-xs font-black", strikesLeft <= 1 ? "border-destructive text-destructive" : "border-border text-muted-foreground")}
            title="Leaving the exam window, copying or other blocked actions count as warnings."
          >
            Warnings left: {strikesLeft}
          </span>
        ) : null}
        <div
          role="timer"
          aria-live={timerTone === "critical" ? "assertive" : "off"}
          aria-label={`Time left ${fmt(remaining)}`}
          className={cn(
            "num min-w-[7.5rem] rounded-[10px] border-2 px-3 py-1 text-center text-2xl font-black tabular-nums",
            timerTone === "ok" && "border-border",
            timerTone === "warn" && "border-[var(--warning)] text-[var(--warning)]",
            timerTone === "danger" && "border-destructive text-destructive",
            timerTone === "critical" && "animate-pulse border-destructive bg-destructive text-white"
          )}
        >
          {engine.paused ? "PAUSED" : fmt(remaining)}
        </div>
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          className="min-h-11 rounded-[10px] border-2 border-border bg-primary px-4 text-sm font-black text-primary-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
        >
          Review & submit
        </button>
      </header>

      {/* ───────── toolbar ───────── */}
      <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-border bg-muted/40 px-3 py-1.5">
        {tools.palette ? (
          <ToolButton label="Questions" icon="grid" onClick={() => setPaletteOpen((o) => !o)} pressed={paletteOpen} className="lg:hidden" />
        ) : null}
        {p.exam.calculator !== "NONE" ? (
          <ToolButton label="Calculator" icon="grid" onClick={() => setPanel(panel === "calculator" ? null : "calculator")} pressed={panel === "calculator"} />
        ) : null}
        {p.exam.formulaSheet ? (
          <ToolButton label="Formula sheet" icon="file" onClick={() => setPanel(panel === "formula" ? null : "formula")} pressed={panel === "formula"} />
        ) : null}
        {tools.scratchpad ? <ToolButton label="Notes" icon="clipboard" onClick={() => setPanel(panel === "notes" ? null : "notes")} pressed={panel === "notes"} /> : null}
        {tools.highlighter && group ? <ToolButton label="Highlighter" icon="star" onClick={() => setHighlighter((h) => !h)} pressed={highlighter} /> : null}
        {tools.lineReader ? <ToolButton label="Line reader" icon="minimize" onClick={() => setLineReader((l) => !l)} pressed={lineReader} /> : null}
        {tools.textToSpeech && "speechSynthesis" in globalThis ? (
          <ToolButton
            label="Read aloud"
            icon="volume"
            onClick={() => {
              speechSynthesis.cancel();
              const view = item.view as { choices?: { text: string }[] };
              const text = plain(item.prompt) + (view.choices ? ". Options: " + view.choices.map((c, i) => `${"ABCDEFGH"[i]}, ${plain(c.text)}`).join(". ") : "");
              speechSynthesis.speak(new SpeechSynthesisUtterance(text));
            }}
          />
        ) : null}
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <ToolButton label="Smaller text" icon="zoom-out" onClick={() => setZoom((z) => Math.max(0.85, +(z - 0.1).toFixed(2)))} />
        <ToolButton label="Larger text" icon="zoom-in" onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))} />
        <ToolButton label="High contrast" icon="sun" onClick={() => setContrast((c) => !c)} pressed={contrast} />
        <ToolButton label="Easier reading" icon="book" onClick={() => setDyslexic((d) => !d)} pressed={dyslexic} />
        {sec.requireFullscreen && !fullscreen ? <ToolButton label="Fullscreen" icon="maximize" onClick={() => void enterFullscreen()} /> : null}
        <span className="ml-auto text-xs font-bold text-muted-foreground">
          {tools.progress ? `${engine.stats.answered} of ${engine.stats.total} answered` : null}
          {engine.stats.flagged ? ` · ${engine.stats.flagged} flagged` : ""}
        </span>
      </div>

      <div className="relative flex flex-1">
        {/* ───────── palette ───────── */}
        {tools.palette ? (
          <aside
            className={cn(
              "z-20 w-72 shrink-0 overflow-y-auto border-r-2 border-border bg-card p-3",
              "max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-lg",
              !paletteOpen && "max-lg:hidden"
            )}
            aria-label="Question palette"
          >
            <Palette
              sections={p.pkg.sections}
              current={current}
              answered={answeredOf}
              flagged={(k) => !!engine.responses[k]?.flagged}
              reachable={reachable}
              locked={(sid) => lockedSections.includes(sid)}
              byKey={byKey}
              onGo={go}
            />
          </aside>
        ) : null}

        {/* ───────── question ───────── */}
        <main
          className={cn("relative min-w-0 flex-1 overflow-y-auto", hidePaper && "pointer-events-none select-none blur-md")}
          style={wm ? { backgroundImage: wm } : undefined}
          aria-hidden={hidePaper}
        >
          <div className={cn("exam-paper mx-auto grid gap-6 px-4 py-6 sm:px-8", group ? "max-w-7xl lg:grid-cols-2" : "max-w-3xl")}>
            {group ? (
              <Passage
                group={group}
                highlighter={highlighter}
                highlights={notes[`g:${group.id}`]?.highlights ?? []}
                onToggle={(i) => {
                  const key = `g:${group.id}`;
                  const cur = notes[key] ?? { text: "", highlights: [] };
                  const hl = cur.highlights.includes(i) ? cur.highlights.filter((x) => x !== i) : [...cur.highlights, i];
                  const n = { ...notes, [key]: { ...cur, highlights: hl } };
                  setNotes(n);
                  void examStore.putNote({ id: `${p.attemptId}:${key}`, attemptId: p.attemptId, key, text: cur.text, highlights: hl });
                }}
              />
            ) : null}
            <section id="exam-question" tabIndex={-1} className="outline-none" aria-label={`Question ${item.n}`}>
              {order.indexOf(section.itemKeys[0]) === idx && section.instructions ? (
                <div className="mb-4 rounded-[10px] border-2 border-dashed border-border bg-muted/50 p-3 text-sm font-medium">
                  <div className="mb-1 text-xs font-black uppercase text-muted-foreground">{section.title}</div>
                  <MathText>{section.instructions}</MathText>
                </div>
              ) : null}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                  {p.pkg.sections.length > 1 ? `${section.title} · ` : ""}Question {item.n} of {engine.stats.total}
                </span>
                <span className="rounded-full border-2 border-border px-2 py-0.5 text-xs font-black">
                  {item.points} mark{item.points === 1 ? "" : "s"}
                </span>
                {sectionLeft !== null ? (
                  <span className="num rounded-full border-2 border-border px-2 py-0.5 text-xs font-black">Section: {fmt(sectionLeft)}</span>
                ) : null}
                {item.timeLimitSec ? (
                  <span className="num rounded-full border-2 border-border px-2 py-0.5 text-xs font-black">
                    {questionLocked ? "Time for this question is up" : `This question: ${fmt((item.timeLimitSec - (resp?.timeSpentSec ?? 0)) * 1000)}`}
                  </span>
                ) : null}
                {tools.flagging ? (
                  <button
                    type="button"
                    aria-pressed={!!resp?.flagged}
                    onClick={() => void engine.toggleFlag(current)}
                    className={cn(
                      "ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border-2 px-3 text-xs font-black outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
                      resp?.flagged ? "border-[var(--warning)] bg-[var(--warning)] text-black" : "border-border bg-card"
                    )}
                  >
                    ⚑ {resp?.flagged ? "Flagged for review" : "Flag for review"}
                  </button>
                ) : null}
              </div>
              <QuestionPlayer
                question={{ id: item.key, type: item.type, prompt: item.prompt, view: item.view, media: item.media }}
                value={resp?.answer}
                onChange={(v) => canWrite && !questionLocked && void engine.setAnswer(current, v)}
                disabled={!canWrite || questionLocked}
                eliminator={tools.eliminator}
                uploader={uploader}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
                {resp && isResponseAnswered(item.type, resp.answer) && canWrite && !questionLocked ? (
                  <button type="button" onClick={() => void engine.setAnswer(current, null)} className="underline underline-offset-4">
                    Clear my answer
                  </button>
                ) : null}
                <SaveState saved={!!resp} synced={!resp || resp.rev <= resp.ackedRev} offline={engine.conn === "offline"} />
              </div>
            </section>
          </div>
        </main>

        {/* ───────── tools panel ───────── */}
        {panel ? (
          <aside className="z-20 w-80 shrink-0 overflow-y-auto border-l-2 border-border bg-card p-3 max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:shadow-lg" aria-label="Tools">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-black">{panel === "calculator" ? "Calculator" : panel === "formula" ? "Formula sheet" : "My notes"}</span>
              <button type="button" aria-label="Close tool" onClick={() => setPanel(null)} className="grid size-9 place-items-center rounded-[8px] border-2 border-border">
                <Icon name="x" className="size-4" />
              </button>
            </div>
            {panel === "calculator" ? <Calculator scientific={p.exam.calculator === "SCIENTIFIC"} /> : null}
            {panel === "formula" ? <MathText as="div" className="text-sm leading-relaxed">{p.exam.formulaSheet}</MathText> : null}
            {panel === "notes" ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Rough work for question {item.n}. Only you can see this; it is not marked.</p>
                <textarea
                  aria-label={`Notes for question ${item.n}`}
                  className="min-h-64 w-full rounded-[10px] border-2 border-border bg-background p-2 text-sm outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
                  value={notes[current]?.text ?? ""}
                  onChange={(e) => {
                    const text = e.target.value;
                    setNotes((n) => ({ ...n, [current]: { text, highlights: n[current]?.highlights ?? [] } }));
                    void examStore.putNote({ id: `${p.attemptId}:${current}`, attemptId: p.attemptId, key: current, text, highlights: [] });
                  }}
                />
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      {/* ───────── footer nav ───────── */}
      <footer className="sticky bottom-0 z-20 flex items-center gap-2 border-t-2 border-border bg-card px-3 py-2">
        <button
          type="button"
          onClick={prev}
          disabled={idx === 0 || !reachable(order[idx - 1] ?? "")}
          className="inline-flex min-h-12 items-center gap-2 rounded-[10px] border-2 border-border bg-card px-4 font-black outline-none disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-ring"
        >
          <Icon name="arrow-left" className="size-4" /> Previous
        </button>
        <div className="mx-auto hidden text-xs font-bold text-muted-foreground sm:block">
          Keys: A–E choose · N next · P previous{tools.flagging ? " · F flag" : ""} · S review
        </div>
        {idx < order.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="ml-auto inline-flex min-h-12 items-center gap-2 rounded-[10px] border-2 border-border bg-primary px-5 font-black text-primary-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
          >
            {sectionOf.get(order[idx + 1]) !== sectionId && p.exam.navigation !== "FREE" ? "Finish section" : "Next"} <Icon name="arrow-right" className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="ml-auto inline-flex min-h-12 items-center gap-2 rounded-[10px] border-2 border-border bg-primary px-5 font-black text-primary-foreground"
          >
            Review & submit
          </button>
        )}
      </footer>

      {/* ───────── overlays ───────── */}
      {wm ? <div aria-hidden className="pointer-events-none fixed inset-0 z-[5]" style={{ backgroundImage: wm }} /> : null}
      {lineReader ? (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 z-40 h-14 -translate-y-1/2 rounded-sm" style={{ top: readerY, boxShadow: "0 0 0 100vmax rgba(0,0,0,0.55)" }} />
      ) : null}
      {toast ? (
        <div role="status" className="fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-[10px] border-2 border-destructive bg-card px-4 py-2 text-sm font-black text-destructive shadow-lg">
          {toast}
        </div>
      ) : null}

      {needsFullscreen && !engine.pendingSubmit ? (
        <Overlay>
          <Icon name="maximize" className="mx-auto mb-3 size-10" />
          <h2 className="font-heading text-2xl font-black">{started ? "Return to fullscreen" : "Start the exam in fullscreen"}</h2>
          <p className="mt-2 text-[15px] font-medium text-muted-foreground">
            {started
              ? "The paper is hidden outside fullscreen. Leaving was recorded. Return now to continue — your time is still running."
              : "The exam runs in fullscreen. Leaving fullscreen, switching tabs or windows, copying and printing are recorded and may end your exam."}
          </p>
          <button
            type="button"
            autoFocus
            onClick={async () => {
              const ok = await enterFullscreen();
              if (ok) {
                setStarted(true);
                setFullscreen(true);
              }
            }}
            className="mt-5 min-h-12 rounded-[10px] border-2 border-border bg-primary px-6 text-lg font-black text-primary-foreground"
          >
            {started ? "Return to the exam" : "Enter fullscreen and begin"}
          </button>
        </Overlay>
      ) : null}

      {engine.paused && !engine.pendingSubmit ? (
        <Overlay>
          <Icon name="pause" className="mx-auto mb-3 size-10" />
          <h2 className="font-heading text-2xl font-black">Your exam has been paused</h2>
          <p className="mt-2 text-[15px] font-medium text-muted-foreground">The invigilator has paused the exam. Your time is stopped. Please wait.</p>
        </Overlay>
      ) : null}

      {engine.status === "LOCKED" && !engine.pendingSubmit ? (
        <Overlay>
          <Icon name="lock" className="mx-auto mb-3 size-10 text-destructive" />
          <h2 className="font-heading text-2xl font-black">Exam locked</h2>
          <p className="mt-2 text-[15px] font-medium text-muted-foreground">
            Too many warnings were recorded. Raise your hand — only the invigilator can unlock your exam. Your answers are saved; your time is still running.
          </p>
        </Overlay>
      ) : null}

      {engine.pendingSubmit ? (
        <Overlay>
          <Icon name={engine.conn === "offline" ? "alert-triangle" : "refresh"} className={cn("mx-auto mb-3 size-10", engine.conn !== "offline" && "animate-spin")} />
          <h2 className="font-heading text-2xl font-black">
            {engine.pendingSubmit.reason === "TIME_UP" ? "Time is up" : "Submitting your exam"}
          </h2>
          <p className="mt-2 text-[15px] font-medium text-muted-foreground">
            {engine.conn === "offline"
              ? "You are offline. Your answers are saved on this device and will be submitted automatically as soon as the connection returns. Do not close this window."
              : "Sending your answers…"}
          </p>
          {engine.conn === "offline" ? (
            <button type="button" onClick={() => void engine.sync({ force: true })} className="mt-4 min-h-11 rounded-[10px] border-2 border-border bg-card px-5 font-black">
              Try now
            </button>
          ) : null}
        </Overlay>
      ) : null}

      {warning && !hidePaper ? (
        <Overlay onClose={() => setWarning(null)}>
          <Icon name="alert-triangle" className="mx-auto mb-3 size-10 text-[var(--warning)]" />
          <p className="text-lg font-black">{warning}</p>
          {strikesLeft !== null && engine.strikes.action !== "WARN" ? (
            <p className="mt-2 text-sm font-bold text-muted-foreground">
              Warnings left before your exam is {engine.strikes.action === "LOCK" ? "locked" : "submitted"}: {strikesLeft}
            </p>
          ) : null}
          <button type="button" autoFocus onClick={() => setWarning(null)} className="mt-4 min-h-11 rounded-[10px] border-2 border-border bg-primary px-6 font-black text-primary-foreground">
            I understand
          </button>
        </Overlay>
      ) : null}

      {engine.announcements[0] && !engine.pendingSubmit ? (
        <Overlay onClose={() => engine.dismissAnnouncement(engine.announcements[0].id)}>
          <Icon name="bell" className="mx-auto mb-3 size-10 text-primary" />
          <div className="text-xs font-black uppercase text-muted-foreground">Message from the invigilator</div>
          <p className="mt-2 whitespace-pre-wrap text-lg font-black">{engine.announcements[0].message}</p>
          <button
            type="button"
            autoFocus
            onClick={() => engine.dismissAnnouncement(engine.announcements[0].id)}
            className="mt-4 min-h-11 rounded-[10px] border-2 border-border bg-primary px-6 font-black text-primary-foreground"
          >
            OK
          </button>
        </Overlay>
      ) : null}

      {reviewOpen && !engine.pendingSubmit ? (
        <ReviewScreen
          engine={engine}
          sections={p.pkg.sections}
          byKey={byKey}
          answered={answeredOf}
          reachable={reachable}
          remaining={remaining}
          onGo={(k) => {
            setReviewOpen(false);
            go(k);
          }}
          onClose={() => setReviewOpen(false)}
          onSubmit={() => {
            setReviewOpen(false);
            void engine.submit("MANUAL");
          }}
        />
      ) : null}

      {/* Holding page link for a dedicated window: tells the opener we are alive. */}
      <OpenerBeacon examId={examId} />
    </div>
  );
}

/* ═════════════════════════════ pieces ═════════════════════════════ */

function ToolButton({ label, icon, onClick, pressed, className }: { label: string; icon: Parameters<typeof Icon>[0]["name"]; onClick: () => void; pressed?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border-2 px-2.5 text-xs font-black outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
        pressed ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
        className
      )}
    >
      <Icon name={icon} className="size-4" />
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}

function ConnectionPill({ engine }: { engine: ExamEngine }) {
  const { conn, stats } = engine;
  // A routine heartbeat is not "saving": only answers not yet confirmed are.
  const label =
    conn === "offline"
      ? `Offline · ${stats.unsynced ? `${stats.unsynced} saved on device` : "saved on device"}`
      : stats.unsynced
        ? "Saving…"
        : "Online · all saved";
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-black",
        conn === "offline" ? "border-[var(--warning)] text-[var(--warning)]" : "border-[var(--success)] text-[var(--success)]"
      )}
    >
      <span className={cn("size-2 rounded-full", conn === "offline" ? "bg-[var(--warning)]" : "bg-[var(--success)]")} />
      {label}
    </span>
  );
}

function SaveState({ saved, synced, offline }: { saved: boolean; synced: boolean; offline: boolean }) {
  if (!saved) return null;
  return <span>{synced ? "✓ Saved" : offline ? "✓ Saved on this device — will upload when online" : "Saving…"}</span>;
}

function Palette({
  sections,
  current,
  answered,
  flagged,
  reachable,
  locked,
  byKey,
  onGo,
}: {
  sections: { id: string; title: string; itemKeys: string[] }[];
  current: string;
  answered: (k: string) => boolean;
  flagged: (k: string) => boolean;
  reachable: (k: string) => boolean;
  locked: (sid: string) => boolean;
  byKey: Map<string, PackageItem>;
  onGo: (k: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "unanswered" | "flagged">("all");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1" role="group" aria-label="Show">
        {(["all", "unanswered", "flagged"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn("min-h-8 flex-1 rounded-[8px] border-2 text-[11px] font-black capitalize", filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border")}
          >
            {f}
          </button>
        ))}
      </div>
      {sections.map((s) => (
        <div key={s.id}>
          <div className="mb-1.5 flex items-center justify-between text-xs font-black uppercase text-muted-foreground">
            <span className="truncate">{s.title}</span>
            {locked(s.id) ? <span className="flex items-center gap-1"><Icon name="lock" className="size-3" /> closed</span> : null}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {s.itemKeys
              .filter((k) => (filter === "unanswered" ? !answered(k) : filter === "flagged" ? flagged(k) : true))
              .map((k) => {
                const it = byKey.get(k)!;
                const ok = reachable(k) || k === current;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!ok}
                    onClick={() => onGo(k)}
                    aria-current={k === current ? "step" : undefined}
                    aria-label={`Question ${it.n}${answered(k) ? ", answered" : ", not answered"}${flagged(k) ? ", flagged" : ""}`}
                    className={cn(
                      "num relative grid h-10 place-items-center rounded-[8px] border-2 text-sm font-black outline-none focus-visible:outline-[3px] focus-visible:outline-ring disabled:opacity-35",
                      answered(k) ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-border bg-background",
                      k === current && "ring-[3px] ring-primary ring-offset-2 ring-offset-card"
                    )}
                  >
                    {it.n}
                    {flagged(k) ? <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-card bg-[var(--warning)]" aria-hidden /> : null}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      <div className="mt-1 grid gap-1 text-[11px] font-bold text-muted-foreground">
        <span className="flex items-center gap-2"><span className="size-3 rounded bg-[var(--success)]" /> Answered</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded border-2 border-border" /> Not answered</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-[var(--warning)]" /> Flagged for review</span>
      </div>
    </div>
  );
}

function Passage({
  group,
  highlighter,
  highlights,
  onToggle,
}: {
  group: { id: string; title: string | null; stimulus: string; media: { kind: "image" | "audio" | "video"; url: string; maxPlays?: number | null; alt?: string | null } | null };
  highlighter: boolean;
  highlights: number[];
  onToggle: (i: number) => void;
}) {
  const sentences = useMemo(() => group.stimulus.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/), [group.stimulus]);
  return (
    <article className="rounded-[14px] border-2 border-border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto">
      {group.title ? <h2 className="mb-2 font-heading text-lg font-black">{group.title}</h2> : null}
      {group.media ? <div className="mb-3"><MediaStimulus media={group.media} /></div> : null}
      <div className="text-[15px] leading-relaxed">
        {sentences.map((s, i) => (
          <span
            key={i}
            onClick={highlighter ? () => onToggle(i) : undefined}
            className={cn(highlights.includes(i) && "bg-[#fde047] text-black", highlighter && "cursor-pointer hover:bg-[#fde047]/50")}
          >
            <MathText>{s}</MathText>{" "}
          </span>
        ))}
      </div>
      {highlighter ? <p className="mt-2 text-xs font-bold text-muted-foreground">Click a sentence to highlight it.</p> : null}
    </article>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      onKeyDown={(e) => e.key === "Escape" && onClose?.()}
    >
      <div className="w-full max-w-lg rounded-[16px] border-2 border-border bg-card p-6 text-center shadow-xl">{children}</div>
    </div>
  );
}

function ReviewScreen({
  engine,
  sections,
  byKey,
  answered,
  reachable,
  remaining,
  onGo,
  onClose,
  onSubmit,
}: {
  engine: ExamEngine;
  sections: { id: string; title: string; itemKeys: string[] }[];
  byKey: Map<string, PackageItem>;
  answered: (k: string) => boolean;
  reachable: (k: string) => boolean;
  remaining: number;
  onGo: (k: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const unanswered = engine.stats.total - engine.stats.answered;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="review-title" className="fixed inset-0 z-[55] overflow-y-auto bg-black/70 p-4">
      <div className="mx-auto my-6 w-full max-w-3xl rounded-[16px] border-2 border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="review-title" className="font-heading text-2xl font-black">Review before you submit</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Time left: <span className="num font-black text-foreground">{fmt(remaining)}</span>. You can go back to any question still open.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Back to the exam" className="grid size-10 place-items-center rounded-[8px] border-2 border-border">
            <Icon name="x" className="size-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Answered" value={engine.stats.answered} tone="ok" />
          <Stat label="Not answered" value={unanswered} tone={unanswered ? "bad" : "ok"} />
          <Stat label="Flagged" value={engine.stats.flagged} tone={engine.stats.flagged ? "warn" : "ok"} />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {sections.map((s) => {
            const keys = s.itemKeys;
            const missing = keys.filter((k) => !answered(k));
            const flagged = keys.filter((k) => engine.responses[k]?.flagged);
            return (
              <div key={s.id} className="rounded-[10px] border-2 border-border p-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm font-black">
                  <span>{s.title}</span>
                  <span className="text-muted-foreground">
                    {keys.length - missing.length} / {keys.length} answered
                  </span>
                </div>
                {missing.length || flagged.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...new Set([...missing, ...flagged])].map((k) => (
                      <button
                        key={k}
                        type="button"
                        disabled={!reachable(k)}
                        onClick={() => onGo(k)}
                        className={cn(
                          "num min-h-9 min-w-9 rounded-[8px] border-2 px-2 text-sm font-black disabled:opacity-40",
                          engine.responses[k]?.flagged ? "border-[var(--warning)]" : "border-destructive text-destructive"
                        )}
                      >
                        {byKey.get(k)?.n}
                        {engine.responses[k]?.flagged ? " ⚑" : ""}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-5 rounded-[10px] border-2 border-destructive/60 bg-destructive/5 p-4">
          <p className="text-sm font-bold">
            Submitting ends your exam. You will not be able to change any answer afterwards.
            {unanswered ? ` ${unanswered} question${unanswered === 1 ? " is" : "s are"} still unanswered.` : ""}
          </p>
          <label className="mt-3 block text-sm font-bold" htmlFor="confirm-submit">
            Type <span className="font-black">SUBMIT</span> to confirm
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              id="confirm-submit"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className="min-h-11 flex-1 rounded-[10px] border-2 border-border bg-background px-3 font-black uppercase tracking-widest outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
            />
            <button
              type="button"
              disabled={confirm.trim().toUpperCase() !== "SUBMIT"}
              onClick={onSubmit}
              className="min-h-11 rounded-[10px] border-2 border-destructive bg-destructive px-5 font-black text-white disabled:opacity-40"
            >
              Submit exam
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "bad" | "warn" }) {
  return (
    <div className={cn("rounded-[10px] border-2 p-3", tone === "bad" ? "border-destructive" : tone === "warn" ? "border-[var(--warning)]" : "border-border")}>
      <div className="num text-2xl font-black">{value}</div>
      <div className="text-xs font-bold text-muted-foreground">{label}</div>
    </div>
  );
}

/** Lets the lobby tab that opened this window know the exam is running in it. */
function OpenerBeacon({ examId }: { examId: string }) {
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(`cbt-${examId}`);
      const t = setInterval(() => ch?.postMessage({ type: "alive" }), 2000);
      ch.onmessage = (e) => {
        if (e.data?.type === "focus") window.focus();
      };
      return () => {
        clearInterval(t);
        ch?.close();
      };
    } catch {
      return undefined;
    }
  }, [examId]);
  return null;
}
