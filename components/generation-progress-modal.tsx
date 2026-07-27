"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GenerationProgressState = {
  open: boolean;
  percent: number;
  label: string;
  completed?: number;
  total?: number;
  error: string | null;
  /** True while work is in flight (hides dismiss until error or finish). */
  running: boolean;
};

export const INITIAL_GENERATION_PROGRESS: GenerationProgressState = {
  open: false,
  percent: 0,
  label: "",
  error: null,
  running: false,
};

export function GenerationProgressModal({
  state,
  title = "Generating…",
  onClose,
  onRetry,
}: {
  state: GenerationProgressState;
  title?: string;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const showCounter =
    typeof state.completed === "number" &&
    typeof state.total === "number" &&
    state.total > 0;

  return (
    <Dialog
      open={state.open}
      onOpenChange={(next) => {
        // Only allow dismiss when not running (error / finished).
        if (!next && !state.running) onClose();
      }}
    >
      <DialogContent
        showClose={!state.running}
        className="max-w-md"
        onPointerDownOutside={(e) => {
          if (state.running) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (state.running) e.preventDefault();
        }}
      >
        <DialogTitle>{state.error ? "Generation failed" : title}</DialogTitle>
        <DialogDescription className="sr-only">
          {state.error ? state.error : state.label || "Generation in progress"}
        </DialogDescription>

        {state.error ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-red-600">{state.error}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="relative flex size-24 items-center justify-center">
              <span
                aria-hidden
                className="absolute inset-0 size-24 animate-spin rounded-full border-2 border-border border-t-primary opacity-40"
              />
              <span className="font-heading text-3xl tabular-nums text-foreground">
                {Math.round(state.percent)}%
              </span>
            </div>

            <div className="w-full">
              <div
                className="h-2 overflow-hidden rounded-full border border-border bg-muted"
                role="progressbar"
                aria-valuenow={Math.round(state.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={state.label || "Progress"}
              >
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, state.percent))}%` }}
                />
              </div>
              <p className="mt-3 text-center text-sm font-medium text-foreground">{state.label}</p>
              {showCounter ? (
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  Module {state.completed} of {state.total}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
