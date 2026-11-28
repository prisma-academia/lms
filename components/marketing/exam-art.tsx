import { Icon } from "@/components/icon";

/**
 * A static mock of the CBT exam screen for the landing page: timer, lockdown
 * status, a maths question and the question palette. Decorative — the copy
 * beside it says the same thing in words — so it is hidden from assistive tech.
 */

type Cell = "answered" | "flagged" | "current" | "open";

const PALETTE: Cell[] = Array.from({ length: 40 }, (_, i) => {
  const n = i + 1;
  if (n === 7) return "current";
  if (n === 4 || n === 15) return "flagged";
  if (n < 7 || n === 9 || n === 12 || n === 13) return "answered";
  return "open";
});

const CELL_CLASS: Record<Cell, string> = {
  answered: "border-foreground bg-[var(--chart-1)] text-foreground",
  flagged: "border-foreground bg-[var(--chart-4)] text-foreground",
  current: "border-foreground bg-primary text-primary-foreground ring-2 ring-foreground ring-offset-1 ring-offset-card",
  open: "border-border bg-background text-muted-foreground",
};

const OPTIONS = [
  { key: "A", text: "x = 2 or x = 3", picked: true },
  { key: "B", text: "x = −2 or x = −3", picked: false },
  { key: "C", text: "x = 1 or x = 6", picked: false },
  { key: "D", text: "x = 5", picked: false },
];

export function ExamArt({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <div
        className="overflow-hidden rounded-[16px] border-2 border-foreground bg-card text-card-foreground"
        style={{ boxShadow: "8px 8px 0 var(--chart-2)" }}
      >
        {/* exam header */}
        <div className="flex items-center justify-between gap-3 border-b-2 border-foreground bg-background px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-heading text-sm leading-tight">Mathematics, paper 2</p>
            <p className="text-[11px] font-bold text-muted-foreground">Question 7 of 40</p>
          </div>
          <span className="num flex shrink-0 items-center gap-1.5 rounded-md border-2 border-foreground bg-primary px-2.5 py-1 font-heading text-sm text-primary-foreground">
            <Icon name="clock" className="size-3.5" /> 42:17
          </span>
        </div>

        {/* integrity strip */}
        <div className="flex flex-wrap gap-2 border-b-2 border-border px-4 py-2.5 text-[11px] font-bold">
          <span className="flex items-center gap-1 rounded-md border-2 border-foreground bg-[var(--chart-3)] px-2 py-0.5 text-foreground">
            <Icon name="lock" className="size-3" /> Fullscreen locked
          </span>
          <span className="flex items-center gap-1 rounded-md border-2 border-border px-2 py-0.5 text-muted-foreground">
            <Icon name="check-circle" className="size-3" /> Saved on this device
          </span>
          <span className="num flex items-center gap-1 rounded-md border-2 border-border px-2 py-0.5 text-muted-foreground">
            <Icon name="alert-triangle" className="size-3" /> Strikes 0 of 3
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto]">
          {/* question */}
          <div className="min-w-0">
            <p className="text-[13px] font-bold">Solve the equation.</p>
            <p className="mt-2 rounded-md border-2 border-border bg-background px-3 py-2 text-center font-serif text-lg italic">
              x² − 5x + 6 = 0
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {OPTIONS.map((o) => (
                <li
                  key={o.key}
                  className={`flex items-center gap-2 rounded-md border-2 px-2.5 py-1.5 text-[12px] font-bold ${
                    o.picked ? "border-foreground bg-[var(--chart-1)] text-foreground" : "border-border"
                  }`}
                >
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded border-2 text-[10px] ${
                      o.picked ? "border-foreground bg-foreground text-background" : "border-border"
                    }`}
                  >
                    {o.key}
                  </span>
                  <span className="font-serif italic">{o.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* palette */}
          <div>
            <p className="text-[11px] font-bold text-muted-foreground">Questions</p>
            <div className="mt-1.5 grid grid-cols-8 gap-1 sm:grid-cols-5">
              {PALETTE.map((cell, i) => (
                <span
                  key={i}
                  className={`num flex size-6 items-center justify-center rounded border-2 text-[9px] font-bold ${CELL_CLASS[cell]}`}
                >
                  {i + 1}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t-2 border-border px-4 py-3">
          <span className="rounded-md border-2 border-border px-3 py-1 text-[12px] font-bold text-muted-foreground">
            Mark for review
          </span>
          <span className="rounded-md border-2 border-foreground bg-foreground px-3 py-1 text-[12px] font-bold text-background">
            Next question
          </span>
        </div>
      </div>
    </div>
  );
}
