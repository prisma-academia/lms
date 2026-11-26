"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, TextInput, TextArea } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export type AssignedClient = {
  id: string;
  label: string;
  email: string;
  status: string; // "UNPAID" | PaymentStatus
  /** When the payment was recorded, formatted on the server. Null if unpaid. */
  paidLabel: string | null;
};

/** A status is a word first; the colour only reinforces it. */
const STATUS: Record<string, { label: string; color?: string }> = {
  SUCCESS: { label: "Paid", color: "var(--success)" },
  UNPAID: { label: "Not paid" },
  PENDING: { label: "Waiting for payment", color: "var(--warning)" },
  FAILED: { label: "Payment failed", color: "var(--destructive)" },
  REFUNDED: { label: "Refunded" },
};

export function FeeEditor({
  id,
  initial,
  assigned,
  canWrite,
}: {
  id: string;
  initial: {
    name: string;
    description: string;
    amount: string;
    currency: string;
    dueAt: string;
    targetLabel: string;
  };
  assigned: AssignedClient[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [amount, setAmount] = useState(initial.amount);
  const [dueAt, setDueAt] = useState(initial.dueAt);
  const [error, setError] = useState<string | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busyClient, setBusyClient] = useState<string | null>(null);

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!name.trim()) {
      setError("Give the fee a name.");
      return;
    }
    if (Number.isNaN(amountCents) || amountCents < 1) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    const res = await apiPatch(`/api/tenant/fees/${id}`, {
      name: name.trim(),
      description: description.trim() === "" ? null : description,
      amountCents,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Fee saved");
    router.refresh();
  }

  async function markPaid(clientId: string) {
    setTrackingError(null);
    setBusyClient(clientId);
    const res = await apiPost(`/api/tenant/fees/${id}/payments`, { clientId, status: "SUCCESS" });
    setBusyClient(null);
    if (res.error) {
      setTrackingError(res.error.message);
      return;
    }
    toast("Marked as paid");
    router.refresh();
  }

  async function markUnpaid(client: AssignedClient) {
    const yes = await confirm({
      title: `Mark ${client.label} as not paid?`,
      description: "The payment recorded for this fee is removed. You can mark it paid again at any time.",
      confirmLabel: "Mark not paid",
      destructive: true,
    });
    if (!yes) return;
    setTrackingError(null);
    setBusyClient(client.id);
    const res = await apiDelete(`/api/tenant/fees/${id}/payments?clientId=${encodeURIComponent(client.id)}`);
    setBusyClient(null);
    if (res.error) {
      setTrackingError(res.error.message);
      return;
    }
    toast("Marked as not paid");
    router.refresh();
  }

  async function onDelete() {
    const yes = await confirm({
      title: `Delete “${initial.name}”?`,
      description: "The fee and every payment recorded against it are deleted. This cannot be undone.",
      confirmLabel: "Delete fee",
      destructive: true,
    });
    if (!yes) return;
    setDeleting(true);
    const res = await apiDelete(`/api/tenant/fees/${id}`);
    setDeleting(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Fee deleted");
    router.push("/admin/fees");
  }

  const paidCount = assigned.filter((a) => a.status === "SUCCESS").length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="font-heading text-lg leading-tight">Fee details</h2>
        <form onSubmit={saveDetails} className="mt-4 flex max-w-xl flex-col gap-4">
          <p className="text-sm font-medium">
            <span className="text-muted-foreground">Charged to: </span>
            <span className="font-bold">{initial.targetLabel}</span>
          </p>
          <FormField label="Name" htmlFor="fee-name">
            <TextInput
              id="fee-name"
              name="name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canWrite}
            />
          </FormField>
          <FormField label="Description" htmlFor="fee-desc">
            <TextArea
              id="fee-desc"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canWrite}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={`Amount (${initial.currency})`} htmlFor="fee-amount">
              <TextInput
                id="fee-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!canWrite}
              />
            </FormField>
            <FormField label="Due date" htmlFor="fee-due">
              <TextInput
                id="fee-due"
                name="dueAt"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                disabled={!canWrite}
              />
            </FormField>
          </div>
          {error ? (
            <p role="alert" className="text-sm font-bold text-destructive">
              {error}
            </p>
          ) : null}
          {canWrite ? (
            // The destructive action sits apart from the primary one.
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="submit" disabled={saving || deleting}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button type="button" variant="destructive" onClick={onDelete} disabled={saving || deleting}>
                {deleting ? "Deleting…" : "Delete fee"}
              </Button>
            </div>
          ) : null}
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg leading-tight">Who has paid</h2>
          {assigned.length > 0 ? (
            <p className="num text-sm font-bold text-muted-foreground">
              {paidCount} of {assigned.length} paid
            </p>
          ) : null}
        </div>
        {trackingError ? (
          <p role="alert" className="mt-3 text-sm font-bold text-destructive">
            {trackingError}
          </p>
        ) : null}
        {assigned.length === 0 ? (
          <EmptyState icon="users" title="Nobody is charged this fee yet">
            If the fee is charged to a group, add learners to that group and they will appear here.
          </EmptyState>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {assigned.map((a) => {
              const paid = a.status === "SUCCESS";
              const status = STATUS[a.status];
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[10px] border-2 border-border bg-background px-3 py-2"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="truncate text-sm font-bold text-foreground">{a.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.email}
                      {paid && a.paidLabel ? ` · paid ${a.paidLabel}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge color={status?.color}>{status?.label ?? a.status}</Badge>
                    {canWrite ? (
                      paid ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => markUnpaid(a)}
                          disabled={busyClient === a.id}
                          aria-label={`Mark ${a.label} as not paid`}
                        >
                          {busyClient === a.id ? "Saving…" : "Mark not paid"}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => markPaid(a.id)}
                          disabled={busyClient === a.id}
                          aria-label={`Mark ${a.label} as paid`}
                        >
                          {busyClient === a.id ? "Saving…" : "Mark paid"}
                        </Button>
                      )
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
