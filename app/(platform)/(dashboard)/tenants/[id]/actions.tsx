"use client";

import { useState } from "react";
import { apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Action = "suspend" | "archive" | "restore";

/** What each action does, said before it happens — two of them sign everyone out. */
const COPY: Record<Action, { title: string; description: string; confirm: string; busy: string }> = {
  suspend: {
    title: "Suspend this academy?",
    description:
      "Everyone at the academy is signed out at once and nobody can sign in until it is restored. Nothing is deleted.",
    confirm: "Suspend academy",
    busy: "Suspending…",
  },
  archive: {
    title: "Archive this academy?",
    description:
      "Everyone at the academy is signed out at once and it is closed to staff and learners. Its data is kept, and it can be restored later.",
    confirm: "Archive academy",
    busy: "Archiving…",
  },
  restore: {
    title: "Restore this academy?",
    description: "Staff and learners will be able to sign in again.",
    confirm: "Restore academy",
    busy: "Restoring…",
  },
};

export function TenantActions({ tenantId, status }: { tenantId: string; status: string }) {
  const confirm = useConfirm();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    const copy = COPY[action];
    const yes = await confirm({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.confirm,
      destructive: action !== "restore",
    });
    if (!yes) return;
    setError(null);
    setPending(action);
    const res = await apiPatch(`/api/platform/tenants/${tenantId}`, { action });
    if (res.error) {
      setPending(null);
      setError(res.error.message);
      return;
    }
    // A full reload on purpose: the status drives most of what this page shows.
    window.location.reload();
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {status !== "SUSPENDED" ? (
          <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => run("suspend")}>
            {pending === "suspend" ? COPY.suspend.busy : "Suspend"}
          </Button>
        ) : null}
        {status !== "ARCHIVED" ? (
          <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => run("archive")}>
            {pending === "archive" ? COPY.archive.busy : "Archive"}
          </Button>
        ) : null}
        {status !== "ACTIVE" ? (
          <Button size="sm" disabled={pending !== null} onClick={() => run("restore")}>
            {pending === "restore" ? COPY.restore.busy : "Restore"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-[13px] font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
