"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * "Are you sure?" as part of the app, instead of the browser's `confirm()`.
 *
 * The native dialog cannot say what is about to be deleted in the app's own
 * words, cannot be styled or themed, blocks the whole tab while it is open, and
 * is ignored outright by some embedded browsers — where the action then either
 * always runs or never does. This one is an ordinary dialog: focus is trapped
 * and restored, Escape and the backdrop cancel, and the dangerous choice is
 * never the default.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete this quiz?", description: "…", confirmLabel: "Delete quiz", destructive: true }))) return;
 */

export type ConfirmOptions = {
  /** The question, ending in a question mark. Name the thing: "Delete this quiz?" */
  title: string;
  /** What will happen, and whether it can be undone. */
  description?: ReactNode;
  /** The action in its own words — "Delete quiz", not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within a <ConfirmProvider>");
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // The promise's resolver for the question on screen. A ref, not state: it is
  // called from event handlers, never read while rendering.
  const resolver = useRef<((answer: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    // A second question while one is open answers the first with "no".
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  const settle = useCallback((answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options != null} onOpenChange={(open) => (open ? undefined : settle(false))}>
        {options ? (
          <DialogContent
            showClose={false}
            role="alertdialog"
            className="max-w-md"
            // Cancel is the safe default: focus lands there, so Enter on a
            // question the reader has not finished reading does nothing.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-confirm-cancel]")?.focus();
            }}
          >
            <DialogTitle>{options.title}</DialogTitle>
            {options.description ? (
              <DialogDescription>{options.description}</DialogDescription>
            ) : (
              // Radix warns when a dialog has no description; an empty one keeps
              // it quiet without inventing copy.
              <DialogDescription className="sr-only">{options.title}</DialogDescription>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" data-confirm-cancel onClick={() => settle(false)}>
                {options.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                type="button"
                variant={options.destructive ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
