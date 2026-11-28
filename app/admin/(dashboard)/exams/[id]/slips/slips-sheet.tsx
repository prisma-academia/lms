"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { SelectInput } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { IssuedPin } from "@/lib/exams/admin-dto";

export type SlipCandidate = {
  id: string;
  fullName: string;
  regNumber: string | null;
  candidateNo: string;
  active: boolean;
  sitting: string | null;
  venue: string | null;
  /** Already formatted in the academy's time zone; empty when unknown. */
  when: string;
};

/**
 * Printable slips, three to an A4 page. PINs are only ever known at the moment
 * they are issued, so printing means issuing new ones — which is why the
 * button says so and asks first.
 */
export function SlipsSheet({
  examId,
  examTitle,
  examCode,
  durationMin,
  academyName,
  loginUrl,
  candidates,
  sittings,
  sittingFilter,
  filteredByIds,
  canWrite,
}: {
  examId: string;
  examTitle: string;
  examCode: string | null;
  durationMin: number;
  academyName: string;
  loginUrl: string;
  candidates: SlipCandidate[];
  sittings: { id: string; name: string }[];
  sittingFilter: string;
  filteredByIds: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pins, setPins] = useState<Map<string, IssuedPin> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printToken, setPrintToken] = useState(0);
  const printable = candidates.filter((c) => c.active);

  // Print once the slips with their new PINs are on the page.
  useEffect(() => {
    if (!printToken) return;
    const t = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(t);
  }, [printToken]);

  async function generate() {
    if (
      !(await confirm({
        title: `Issue new PINs for ${printable.length} ${printable.length === 1 ? "candidate" : "candidates"}?`,
        description:
          "Their current PINs stop working straight away, including any already printed, emailed or handed out. Only print when you are ready to give these slips out.",
        confirmLabel: "Issue PINs and print",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    setError(null);
    const res = await apiPost<{ issued: IssuedPin[] }>(`/api/tenant/exams/${examId}/candidates/pins`, { candidateIds: printable.map((c) => c.id) });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    setPins(new Map(res.data!.issued.map((p) => [p.id, p])));
    setPrintToken((n) => n + 1);
  }

  const host = (() => {
    try {
      return new URL(loginUrl).host;
    } catch {
      return loginUrl;
    }
  })();

  return (
    <div>
      <div className="flex flex-col gap-4 print:hidden">
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            {!filteredByIds && sittings.length ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="slip-sitting" className="text-[13px] font-bold">
                  Sitting
                </label>
                <SelectInput
                  id="slip-sitting"
                  placeholder="Everyone"
                  className="w-56"
                  options={[...sittings.map((s) => ({ value: s.id, label: s.name })), { value: "none", label: "No sitting" }]}
                  value={sittingFilter}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPins(null);
                    router.replace(`/admin/exams/${examId}/slips${v ? `?sitting=${v}` : ""}`);
                  }}
                />
              </div>
            ) : null}
            <p className="num min-w-0 flex-1 basis-56 text-[13px] font-bold">
              {printable.length} {printable.length === 1 ? "slip" : "slips"}
              {filteredByIds ? " for the selected candidates" : ""}
              {candidates.length > printable.length ? ` (${candidates.length - printable.length} blocked or withdrawn left out)` : ""}
            </p>
            {canWrite ? (
              pins ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => window.print()}>
                    <Icon name="file" aria-hidden />
                    Print again
                  </Button>
                  <Button type="button" variant="outline" onClick={generate} disabled={busy}>
                    New PINs again
                  </Button>
                </div>
              ) : (
                <Button type="button" onClick={generate} disabled={busy || printable.length === 0}>
                  <Icon name="file" aria-hidden />
                  {busy ? "Issuing PINs…" : "Generate new PINs and print"}
                </Button>
              )
            ) : null}
          </div>
          <p className="mt-3 flex items-start gap-2 text-[13px] font-medium text-muted-foreground">
            <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0" aria-hidden />
            Generating slips issues new PINs. Any PIN given out before stops working. Keep printed slips secure until the exam.
          </p>
          {!canWrite ? <p className="mt-2 text-[13px] font-bold">You need permission to change exams to issue PINs.</p> : null}
          {error ? (
            <p role="alert" className="mt-2 text-sm font-bold text-destructive">
              {error}
            </p>
          ) : null}
        </Card>
        {!pins ? (
          printable.length === 0 ? (
            <Card>
              <EmptyState icon="users" title="Nobody to print for">
                Add candidates on the exam&apos;s Candidates tab first.
              </EmptyState>
            </Card>
          ) : (
            <p className="text-[13px] font-medium text-muted-foreground">The slips appear here, with their PINs, once they are generated.</p>
          )
        ) : null}
      </div>

      {pins ? (
        <div className="mt-5 grid gap-4 print:mt-0 print:block">
          {printable.map((c) => {
            const pin = pins.get(c.id)?.pin ?? "——————";
            return (
              <article
                key={c.id}
                className="break-inside-avoid rounded-[12px] border-2 border-dashed border-border bg-card p-5 text-card-foreground print:mb-[5mm] print:h-[84mm] print:overflow-hidden print:rounded-none print:border-black print:bg-white print:p-[6mm] print:text-black"
              >
                <header className="flex items-start justify-between gap-3 border-b-2 border-border pb-2 print:border-black">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground print:text-black">{academyName}</p>
                    <p className="font-heading text-lg leading-tight">{examTitle}</p>
                  </div>
                  <p className="shrink-0 text-right text-[11px] font-bold">
                    Exam slip
                    {examCode ? <span className="block font-mono">{examCode}</span> : null}
                  </p>
                </header>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
                  <div>
                    <p className="text-base font-black">{c.fullName}</p>
                    {c.regNumber ? <p>Reg. no. {c.regNumber}</p> : null}
                    <p>
                      {c.sitting ? `${c.sitting}` : ""}
                      {c.venue ? `${c.sitting ? " · " : ""}${c.venue}` : ""}
                    </p>
                    <p>
                      {c.when ? `${c.when} · ` : ""}
                      {durationMin} minutes
                    </p>
                  </div>
                  <div className="row-span-2 flex flex-col gap-2 text-center">
                    <div className="rounded-[8px] border-2 border-border px-3 py-1.5 print:border-black">
                      <p className="text-[10px] font-black uppercase tracking-wider">Exam ID</p>
                      <p className="font-mono text-lg font-black tracking-wider">{c.candidateNo}</p>
                    </div>
                    <div className="rounded-[8px] border-2 border-border px-3 py-1.5 print:border-black">
                      <p className="text-[10px] font-black uppercase tracking-wider">PIN</p>
                      <p className="font-mono text-xl font-black tracking-[0.3em]">{pin}</p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[12px]">
                  Sign in at <strong className="font-mono">{host}/exam</strong> with the Exam ID and PIN above. Keep this slip private.
                </p>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
