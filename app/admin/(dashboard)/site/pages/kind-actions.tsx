"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

/**
 * "Go back to the standard screen" for a published design of a built-in screen.
 *
 * It unpublishes, it does not delete: the design becomes a draft the academy
 * can return to, and visitors see the standard screen again straight away.
 */
export function UseStandardScreen({
  pageId,
  label,
  path,
}: {
  pageId: string;
  /** e.g. "sign-in page". */
  label: string;
  path: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const ok = await confirm({
      title: `Go back to the standard ${label}?`,
      description: `Visitors will see the standard screen at ${path} again. Your design is kept as a draft, so you can publish it again later.`,
      confirmLabel: "Use the standard screen",
    });
    if (!ok) return;
    setPending(true);
    setError(null);
    const res = await apiPatch(`/api/tenant/site/pages/${pageId}`, { status: "DRAFT" });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast(`Visitors now see the standard ${label}.`);
    router.refresh();
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void run()}>
        {pending ? "Switching…" : "Go back to the standard screen"}
      </Button>
      {error ? (
        <p role="alert" className="basis-full text-xs font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
