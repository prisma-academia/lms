"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function ClientResetPasswordAction({ clientId }: { clientId: string }) {
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    const ok = await confirm({
      title: "Reset this learner’s password?",
      description:
        "They are emailed a temporary password and signed out everywhere. Their current password stops working straight away.",
      confirmLabel: "Reset password",
    });
    if (!ok) return;
    setPending(true);
    setError(null);
    setInfo(null);
    const res = await apiPost(`/api/tenant/clients/${clientId}/reset-password`, {});
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setInfo("A temporary password has been emailed to the learner.");
  }

  return (
    <div className="mt-6 border-t-2 border-dashed border-border pt-4">
      <Button variant="outline" onClick={reset} disabled={pending}>
        {pending ? "Resetting…" : "Reset password"}
      </Button>
      <p className="mt-2 text-xs font-medium text-muted-foreground">
        Emails the learner a temporary password and signs them out.
      </p>
      {info ? (
        <p role="status" className="mt-2 text-sm font-bold text-foreground">
          {info}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
