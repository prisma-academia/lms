"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { FormField, TextInput, TextArea } from "@/components/form-field";

export type AssignedClient = {
  id: string;
  label: string;
  email: string;
  status: string; // "UNPAID" | PaymentStatus
  paidAt: string | null;
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
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [amount, setAmount] = useState(initial.amount);
  const [dueAt, setDueAt] = useState(initial.dueAt);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyClient, setBusyClient] = useState<string | null>(null);

  async function saveDetails() {
    setError(null);
    setInfo(null);
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (Number.isNaN(amountCents) || amountCents < 1) {
      setError("Enter a valid amount.");
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
    setInfo("Saved.");
    router.refresh();
  }

  async function markPaid(clientId: string) {
    setBusyClient(clientId);
    const res = await apiPost(`/api/tenant/fees/${id}/payments`, { clientId, status: "SUCCESS" });
    setBusyClient(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.refresh();
  }

  async function markUnpaid(clientId: string) {
    setBusyClient(clientId);
    const res = await apiDelete(`/api/tenant/fees/${id}/payments?clientId=${encodeURIComponent(clientId)}`);
    setBusyClient(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.refresh();
  }

  async function onDelete() {
    if (!confirm("Delete this fee and all its payment records?")) return;
    const res = await apiDelete(`/api/tenant/fees/${id}`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push("/admin/fees");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Fee details</h2>
        <div className="mt-4 flex max-w-xl flex-col gap-4">
          <div className="text-sm">
            <span className="text-stone-500">Target: </span>
            <span className="font-semibold">{initial.targetLabel}</span>
          </div>
          <FormField label="Name" htmlFor="fee-name">
            <TextInput id="fee-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField label="Description" htmlFor="fee-desc">
            <TextArea id="fee-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={`Amount (${initial.currency})`} htmlFor="fee-amount">
              <TextInput
                id="fee-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!canWrite}
              />
            </FormField>
            <FormField label="Due date" htmlFor="fee-due">
              <TextInput id="fee-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} disabled={!canWrite} />
            </FormField>
          </div>
          {error ? <p className="text-sm text-red">{error}</p> : null}
          {info ? <p className="text-sm text-ink/70">{info}</p> : null}
          {canWrite ? (
            <div className="flex gap-3">
              <Button type="button" onClick={saveDetails} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="destructive" onClick={onDelete}>
                Delete fee
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Payment tracking</h2>
        {assigned.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No clients are assigned this fee.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {assigned.map((a) => {
              const paid = a.status === "SUCCESS";
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-ink bg-paper px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{a.label}</div>
                    <div className="truncate text-xs text-ink/55">{a.email}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>{paid ? "Paid" : a.status === "UNPAID" ? "Unpaid" : a.status}</Badge>
                    {canWrite ? (
                      paid ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => markUnpaid(a.id)}
                          disabled={busyClient === a.id}
                        >
                          Mark unpaid
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => markPaid(a.id)}
                          disabled={busyClient === a.id}
                        >
                          Mark paid
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
