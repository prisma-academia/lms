"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

/**
 * Show a secret exactly once: an API key or a webhook signing secret. The
 * server keeps only a hash (keys) or ciphertext (secrets), so closing this is
 * final — the copy button and the warning say so.
 */
export function SecretDialog({
  secret,
  title,
  description,
  onClose,
}: {
  secret: string | null;
  title: string;
  description: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="mt-4 flex flex-col gap-3">
          <code className="block break-all rounded-[10px] border-2 border-border bg-background px-3 py-2.5 font-mono text-[13px]" data-testid="secret-value">
            {secret}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={copy}>
              <Icon name={copied ? "check" : "file"} />
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
            <span className="text-xs font-bold text-muted-foreground" role="status">
              {copied ? "Copied. Store it somewhere safe now." : ""}
            </span>
          </div>
          <p className="flex items-start gap-2 rounded-[10px] border-2 border-dashed border-border px-3 py-2 text-sm font-medium">
            <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0" />
            This is the only time it is shown. If it is lost, rotate it and update wherever it is used.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => { setCopied(false); onClose(); }}>
              I have stored it
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
