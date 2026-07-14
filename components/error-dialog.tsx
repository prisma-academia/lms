"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

export type ShowErrorOptions = {
  title?: string;
  message: string;
  /** Runs when the user clicks Retry. May be async; the dialog closes after it settles. */
  onRetry?: () => void | Promise<void>;
  /** Runs when the user clicks Cancel (or dismisses). */
  onCancel?: () => void;
  retryLabel?: string;
  cancelLabel?: string;
};

type ErrorDialogContextValue = {
  /** Show a modal error with Cancel/Retry actions. */
  showError: (options: ShowErrorOptions) => void;
};

const ErrorDialogContext = createContext<ErrorDialogContextValue | null>(null);

/**
 * Global error dialog for client-side / runtime failures (failed fetches,
 * form submits, mutations). Presents as a modal with Cancel + Retry.
 * Mounted once at the app root so `useErrorDialog()` is available everywhere.
 */
export function useErrorDialog(): ErrorDialogContextValue {
  const ctx = useContext(ErrorDialogContext);
  if (!ctx) {
    throw new Error("useErrorDialog must be used within an <ErrorDialogProvider>");
  }
  return ctx;
}

export function ErrorDialogProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ShowErrorOptions | null>(null);
  const [busy, setBusy] = useState(false);

  const showError = useCallback((options: ShowErrorOptions) => {
    setCurrent(options);
    setBusy(false);
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    setBusy(false);
  }, []);

  const handleCancel = useCallback(() => {
    current?.onCancel?.();
    close();
  }, [current, close]);

  const handleRetry = useCallback(async () => {
    if (!current) return;
    try {
      setBusy(true);
      await current.onRetry?.();
    } finally {
      close();
    }
  }, [current, close]);

  return (
    <ErrorDialogContext.Provider value={{ showError }}>
      {children}
      <Dialog
        open={current !== null}
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        {current ? (
          <DialogContent showClose={false} className="max-w-md">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex size-12 items-center justify-center rounded-full border-2 border-ink bg-red text-ink shadow-brutal-sm">
                <Icon name="alert-triangle" className="size-6" />
              </span>
              <div className="flex flex-col gap-1">
                <DialogTitle>{current.title ?? "Something went wrong"}</DialogTitle>
                <DialogDescription>{current.message}</DialogDescription>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" onClick={handleCancel} disabled={busy}>
                  {current.cancelLabel ?? (current.onRetry ? "Cancel" : "Dismiss")}
                </Button>
                {current.onRetry ? (
                  <Button variant="default" onClick={handleRetry} disabled={busy}>
                    {busy ? "Retrying…" : (current.retryLabel ?? "Retry")}
                  </Button>
                ) : null}
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </ErrorDialogContext.Provider>
  );
}
