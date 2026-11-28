"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Icon } from "@/components/icon";

/** Exam ID + PIN sign-in, the way exam centres hand out credentials on a slip. */
export function ExamLogin({ academy, hasAccount }: { academy: string; hasAccount: boolean }) {
  const [candidateNo, setCandidateNo] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!candidateNo.trim() || !/^\d{6}$/.test(pin)) return setError("Enter the Exam ID and the 6-digit PIN from your slip.");
    setBusy(true);
    const res = await apiPost<{ examId: string }>("/api/exam/login", { candidateNo: candidateNo.trim(), pin });
    setBusy(false);
    if (res.error || !res.data) return setError(res.error?.message ?? "Could not sign in. Try again.");
    location.assign(`/exam/${res.data.examId}`);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-[18px] border-2 border-border bg-card p-6 shadow-[6px_6px_0_0_var(--border)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-[12px] border-2 border-border bg-primary text-primary-foreground">
            <Icon name="monitor" className="size-6" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-muted-foreground">{academy}</div>
            <h1 className="font-heading text-2xl font-black leading-tight">Computer-based test</h1>
          </div>
        </div>
        <label htmlFor="cand-no" className="text-sm font-black">
          Exam ID
        </label>
        <input
          id="cand-no"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={candidateNo}
          onChange={(e) => setCandidateNo(e.target.value.toUpperCase())}
          placeholder="e.g. MTH101-482913"
          className="mt-1 w-full rounded-[10px] border-2 border-border bg-background px-3.5 py-3 font-mono text-lg font-black tracking-wider outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <label htmlFor="cand-pin" className="mt-4 block text-sm font-black">
          PIN
        </label>
        <input
          id="cand-pin"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6 digits"
          className="mt-1 w-full rounded-[10px] border-2 border-border bg-background px-3.5 py-3 text-center font-mono text-2xl font-black tracking-[0.5em] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        {error ? (
          <p role="alert" className="mt-3 text-sm font-bold text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 min-h-12 w-full rounded-[10px] border-2 border-border bg-primary text-lg font-black text-primary-foreground outline-none disabled:opacity-60 focus-visible:outline-[3px] focus-visible:outline-ring"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
        <p className="mt-4 text-center text-xs font-medium text-muted-foreground">
          Your Exam ID and PIN are on the exam slip from your school or exam centre.
          {hasAccount ? (
            <>
              {" "}
              Or go to <a className="font-bold underline" href="/my-exams">My exams</a> with your account.
            </>
          ) : (
            <>
              {" "}
              Have a learner account? <a className="font-bold underline" href="/auth/login?next=/my-exams">Sign in</a> instead.
            </>
          )}
        </p>
      </form>
    </div>
  );
}
