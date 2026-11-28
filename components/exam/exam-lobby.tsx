"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Icon } from "@/components/icon";
import { MathText } from "@/components/assessments/math-text";
import { multiScreen } from "@/lib/client/exam/lockdown";
import { storageAvailable } from "@/lib/client/exam/store";
import { cn } from "@/lib/utils";
import type { lobbyState } from "@/lib/exams/candidate-view";

type Lobby = Awaited<ReturnType<typeof lobbyState>>;
type Check = { id: string; label: string; status: "pending" | "ok" | "warn" | "fail"; detail?: string };

const WINDOW_TEXT: Record<string, string> = {
  draft: "This exam is not open yet.",
  upcoming: "This exam has not started yet.",
  open: "The exam is open.",
  entry_closed: "Entry to this exam has closed.",
  closed: "This exam has closed.",
};

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
}

/**
 * The exam lobby: who you are, the rules, a system check, then the exam opens
 * in its own dedicated window. This tab becomes a holding page that can bring
 * the exam window back to the front if it gets hidden.
 */
export function ExamLobby({ examId, inSeb }: { examId: string; inSeb: boolean }) {
  const [state, setState] = useState<Lobby | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [opened, setOpened] = useState<"none" | "popup" | "blocked">("none");
  const [alive, setAlive] = useState(false);
  const popup = useRef<Window | null>(null);
  const lastAlive = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    async (accessCode?: string) => {
      setError(null);
      const res = await apiGet<Lobby | { needsCode: true }>(`/api/exam/${examId}/state${accessCode ? `?code=${encodeURIComponent(accessCode)}` : ""}`);
      if (res.error) {
        if (res.error.code === "access_code_required" || res.error.code === "bad_access_code") setNeedsCode(true);
        return setError(res.error.message);
      }
      if (res.data && "needsCode" in res.data) return setNeedsCode(true);
      setNeedsCode(false);
      setState(res.data as Lobby);
    },
    [examId]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state only after await, not synchronously
    void load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [load]);

  // System check.
  useEffect(() => {
    if (!state) return;
    const sec = state.exam.security;
    const run = async () => {
      const list: Check[] = [];
      const skew = Math.abs(Date.parse(state.serverNow) - Date.now());
      list.push({ id: "browser", label: "Browser supports the exam", status: "indexedDB" in window && "localStorage" in window ? "ok" : "fail" });
      list.push({
        id: "offline",
        label: "Can keep working offline",
        status: (await storageAvailable()) && "serviceWorker" in navigator ? "ok" : "warn",
        detail: "Private browsing turns this off. Your exam still works while online.",
      });
      if (sec.requireFullscreen && !inSeb) {
        list.push({ id: "fs", label: "Fullscreen available", status: document.fullscreenEnabled ? "ok" : "fail", detail: "Use Chrome, Edge, Firefox or Safari on a computer." });
      }
      if (sec.detectMultiScreen) {
        list.push({
          id: "screens",
          label: "Single screen",
          status: multiScreen() ? "fail" : "ok",
          detail: "Disconnect any second monitor or projector before you start.",
        });
      }
      list.push({
        id: "clock",
        label: "Device clock",
        status: skew > 120_000 ? "warn" : "ok",
        detail: skew > 120_000 ? `Your clock is ${Math.round(skew / 60000)} min off. The exam uses the server's time, so this is fine.` : undefined,
      });
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      list.push({
        id: "storage",
        label: "Storage space",
        status: !est || (est.quota ?? 0) - (est.usage ?? 0) > 50 * 1024 * 1024 ? "ok" : "warn",
      });
      list.push({
        id: "size",
        label: "Screen size",
        status: window.screen.width >= 1000 ? "ok" : "warn",
        detail: window.screen.width < 1000 ? "A laptop or desktop is best. Phones and small tablets work but are harder to use." : undefined,
      });
      list.push({ id: "net", label: "Connected", status: navigator.onLine ? "ok" : "fail" });
      setChecks(list);
    };
    void run();
  }, [state, inSeb]);

  // Is the dedicated window still open?
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(`cbt-${examId}`);
      ch.onmessage = (e) => {
        if (e.data?.type === "alive") {
          lastAlive.current = Date.now();
          setAlive(true);
        }
      };
    } catch {
      /* old browser: the holding page just shows the reopen button */
    }
    const t = setInterval(() => {
      if (lastAlive.current && Date.now() - lastAlive.current > 6000) setAlive(false);
      if (popup.current?.closed) setAlive(false);
    }, 2000);
    return () => {
      clearInterval(t);
      ch?.close();
    };
  }, [examId]);

  const sitUrl = `/exam/${examId}/sit`;

  async function start() {
    if (!state) return;
    setError(null);
    // A first start goes through the API so a closed window, used-up attempts
    // or a wrong device are explained here, not in a blank window.
    if (!state.openAttemptId) {
      const { deviceToken } = await import("@/lib/client/exam/store");
      const res = await apiPost(`/api/exam/${examId}/start`, { deviceToken: deviceToken(), accessCode: code || undefined });
      if (res.error) return setError(res.error.message);
    }
    if (inSeb || !state.exam.security.requireFullscreen) {
      location.assign(sitUrl);
      return;
    }
    const w = window.open(
      sitUrl,
      `cbt-${examId}`,
      `popup=yes,left=0,top=0,width=${window.screen.availWidth},height=${window.screen.availHeight}`
    );
    if (!w) {
      setOpened("blocked");
      return;
    }
    popup.current = w;
    w.focus();
    setOpened("popup");
  }

  function bringToFront() {
    try {
      new BroadcastChannel(`cbt-${examId}`).postMessage({ type: "focus" });
    } catch {
      /* ignore */
    }
    if (popup.current && !popup.current.closed) popup.current.focus();
    else {
      const w = window.open(sitUrl, `cbt-${examId}`, `popup=yes,left=0,top=0,width=${window.screen.availWidth},height=${window.screen.availHeight}`);
      if (w) {
        popup.current = w;
        w.focus();
      } else setOpened("blocked");
    }
  }

  if (needsCode && !state) {
    return (
      <Shell>
        <h1 className="font-heading text-2xl font-black">Enter the access code</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">Your teacher or invigilator will give you the code for this exam.</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(code.trim());
          }}
        >
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-label="Access code"
            className="min-h-12 flex-1 rounded-[10px] border-2 border-border bg-background px-3 font-mono text-lg font-black tracking-widest outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
          />
          <button type="submit" className="min-h-12 rounded-[10px] border-2 border-border bg-primary px-5 font-black text-primary-foreground">
            Continue
          </button>
        </form>
        {error ? <p role="alert" className="mt-3 text-sm font-bold text-destructive">{error}</p> : null}
      </Shell>
    );
  }
  if (!state) {
    return (
      <Shell>
        {error ? (
          <>
            <h1 className="font-heading text-2xl font-black">This exam is not available</h1>
            <p className="mt-2 text-sm font-medium text-muted-foreground">{error}</p>
            <a href="/exam" className="mt-4 inline-block font-bold underline">Sign in with a different Exam ID</a>
          </>
        ) : (
          <p className="text-sm font-bold text-muted-foreground">Loading the exam…</p>
        )}
      </Shell>
    );
  }

  const { exam, candidate } = state;
  const startsAt = candidate.sitting?.startsAt ?? exam.opensAt;
  const msToStart = startsAt ? Date.parse(startsAt) - now : 0;
  const failed = checks.some((c) => c.status === "fail");
  const resume = !!state.openAttemptId;
  const sec = exam.security;
  const minutes = Math.round(exam.durationMin * (1 + candidate.extraTimePct / 100));

  if (opened === "popup") {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full border-2 border-border bg-primary text-primary-foreground">
            <Icon name="monitor" className="size-7" />
          </div>
          <h1 className="font-heading text-2xl font-black">Your exam is open in its own window</h1>
          <p className="mt-2 text-[15px] font-medium text-muted-foreground">
            {alive ? "The exam window is running. Keep this tab open in the background." : "We can't see the exam window. If you closed it, reopen it now — your time is still running."}
          </p>
          <button type="button" onClick={bringToFront} className="mt-5 min-h-12 rounded-[10px] border-2 border-border bg-primary px-6 font-black text-primary-foreground">
            {alive ? "Bring the exam window to the front" : "Reopen the exam window"}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-muted-foreground">{exam.code ?? "Exam"}</div>
          <h1 className="font-heading text-3xl font-black leading-tight">{exam.title}</h1>
          {exam.description ? <p className="mt-1 max-w-2xl text-[15px] font-medium text-muted-foreground">{exam.description}</p> : null}
        </div>
        <div className="rounded-[12px] border-2 border-border bg-background px-4 py-3 text-sm">
          <div className="font-black">{candidate.fullName}</div>
          <div className="num font-mono text-xs font-bold text-muted-foreground">Exam ID {candidate.candidateNo}</div>
          {candidate.regNumber ? <div className="text-xs font-bold text-muted-foreground">Reg. no. {candidate.regNumber}</div> : null}
          {candidate.sitting ? (
            <div className="mt-1 text-xs font-bold text-muted-foreground">
              {candidate.sitting.name}
              {candidate.sitting.venue ? ` · ${candidate.sitting.venue}` : ""}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Fact label="Time allowed" value={`${minutes} min`} note={candidate.extraTimePct ? `includes ${candidate.extraTimePct}% extra time` : undefined} />
        <Fact label="Sections" value={String(exam.sectionCount)} />
        <Fact label="Pass mark" value={`${exam.passMark}%`} />
        <Fact label="Attempts" value={`${state.attemptsUsed} of ${exam.attemptsAllowed} used`} />
      </div>
      {exam.opensAt || exam.closesAt ? (
        <p className="mt-3 text-sm font-bold text-muted-foreground">
          {exam.opensAt ? `Opens ${when(exam.opensAt)}` : ""}
          {exam.opensAt && exam.closesAt ? " · " : ""}
          {exam.closesAt ? `Closes ${when(exam.closesAt)}` : ""}
        </p>
      ) : null}

      {exam.instructions ? (
        <section className="mt-5 rounded-[12px] border-2 border-border bg-background p-4">
          <h2 className="text-sm font-black uppercase text-muted-foreground">Instructions</h2>
          <MathText as="div" className="mt-2 text-[15px] leading-relaxed">
            {exam.instructions}
          </MathText>
        </section>
      ) : null}

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[12px] border-2 border-border bg-background p-4">
          <h2 className="text-sm font-black uppercase text-muted-foreground">Exam rules</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm font-medium">
            {sec.requireFullscreen ? <li>The exam runs in fullscreen in its own window. The questions are hidden whenever you leave fullscreen.</li> : null}
            {sec.detectTabSwitch ? <li>Switching to another tab, window or app is recorded and seen by the invigilator.</li> : null}
            {sec.blockClipboard ? <li>Copy, cut and paste are disabled.</li> : null}
            {sec.blockPrint ? <li>Printing and screenshots are blocked or recorded.</li> : null}
            {sec.maxViolations > 0 ? (
              <li>
                After {sec.maxViolations} warnings your exam is{" "}
                {sec.onMaxViolations === "LOCK" ? "locked until the invigilator unlocks it" : sec.onMaxViolations === "AUTO_SUBMIT" ? "submitted automatically" : "flagged"}.
              </li>
            ) : null}
            {sec.awayAutoSubmitSec ? <li>Leaving the exam for more than {sec.awayAutoSubmitSec} seconds submits it automatically.</li> : null}
            {exam.navigation === "LINEAR" ? <li>You answer questions in order and cannot go back to an earlier question.</li> : null}
            {exam.navigation === "SECTION_LOCKED" ? <li>Once you finish a section you cannot return to it.</li> : null}
            {exam.negativeMarking ? <li>Wrong answers lose marks. Leaving a question blank does not.</li> : null}
            <li>Your answers are saved on this device as you go. If the network drops, keep working — they upload when it returns.</li>
            <li>The timer keeps running if you close the window or the computer restarts. Reopen the exam to continue.</li>
          </ul>
        </div>
        <div className="rounded-[12px] border-2 border-border bg-background p-4">
          <h2 className="text-sm font-black uppercase text-muted-foreground">System check</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-black text-white",
                    c.status === "ok" ? "bg-[var(--success)]" : c.status === "warn" ? "bg-[var(--warning)]" : c.status === "fail" ? "bg-destructive" : "bg-muted-foreground"
                  )}
                  aria-hidden
                >
                  {c.status === "ok" ? "✓" : c.status === "fail" ? "✕" : "!"}
                </span>
                <span>
                  <span className="font-bold">{c.label}</span>
                  {c.detail && c.status !== "ok" ? <span className="block text-xs text-muted-foreground">{c.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {state.past.length ? (
        <section className="mt-5 rounded-[12px] border-2 border-border bg-background p-4">
          <h2 className="text-sm font-black uppercase text-muted-foreground">Your attempts</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {state.past.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">Attempt {a.attemptNo} · submitted {when(a.submittedAt)}</span>
                {a.released ? (
                  <a className="font-black underline" href={`/exam/${examId}/done?attempt=${a.id}`}>
                    {a.scorePercent != null ? `${Math.round(a.scorePercent)}%` : "Result"} {a.grade ? `· ${a.grade}` : ""} — view
                  </a>
                ) : (
                  <span className="text-muted-foreground">Result not released yet</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 rounded-[12px] border-2 border-border bg-card p-4">
        <p className="text-sm font-bold">{WINDOW_TEXT[state.window]}</p>
        {state.window === "upcoming" && msToStart > 0 ? (
          <p className="num text-3xl font-black">
            Starts in {Math.floor(msToStart / 3_600_000)}h {Math.floor((msToStart % 3_600_000) / 60_000)}m {Math.floor((msToStart % 60_000) / 1000)}s
          </p>
        ) : null}
        {state.canStart ? (
          <>
            {!resume ? (
              <label className="flex items-start gap-2 text-sm font-bold">
                <input type="checkbox" className="mt-0.5 size-5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                I am {candidate.fullName}, I have read the rules, and I will sit this exam on my own without help.
              </label>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={(!resume && !agree) || failed}
                onClick={() => {
                  if (state.window === "upcoming" && msToStart > 0) return;
                  void start();
                }}
                className="min-h-12 rounded-[10px] border-2 border-border bg-primary px-6 text-lg font-black text-primary-foreground disabled:opacity-40"
              >
                {resume ? "Resume my exam" : "Start the exam"}
              </button>
              {failed ? <span className="text-sm font-bold text-destructive">Fix the system check problems first.</span> : null}
            </div>
            {opened === "blocked" ? (
              <div className="rounded-[10px] border-2 border-[var(--warning)] p-3 text-sm font-bold">
                Your browser blocked the exam window. Allow pop-ups for this site, or{" "}
                <a className="underline" href={sitUrl}>
                  open the exam in this tab
                </a>
                .
              </div>
            ) : null}
          </>
        ) : null}
        {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}
      </div>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-background px-4 py-8">
      <div className={cn("mx-auto rounded-[18px] border-2 border-border bg-card p-6 shadow-[6px_6px_0_0_var(--border)]", wide ? "max-w-5xl" : "max-w-lg")}>{children}</div>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[12px] border-2 border-border bg-background p-3">
      <div className="text-xs font-black uppercase text-muted-foreground">{label}</div>
      <div className="num text-xl font-black">{value}</div>
      {note ? <div className="text-xs font-bold text-muted-foreground">{note}</div> : null}
    </div>
  );
}
