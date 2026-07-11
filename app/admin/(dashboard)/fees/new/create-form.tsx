"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { getCurrencyOptions } from "@/lib/geo/currencies";

const CURRENCY_OPTIONS = getCurrencyOptions();
type Option = { value: string; label: string };

export function CreateFeeForm({ clients, groups }: { clients: Option[]; groups: Option[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [dueAt, setDueAt] = useState("");
  const [targetType, setTargetType] = useState<"client" | "group">("client");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!name.trim()) return setError("Name is required.");
    if (Number.isNaN(amountCents) || amountCents < 1) return setError("Enter a valid amount.");
    if (!target) return setError(`Select a ${targetType === "client" ? "client" : "group"}.`);

    setPending(true);
    const res = await apiPost<{ fee: { id: string } }>("/api/tenant/fees", {
      name: name.trim(),
      description: description.trim() || undefined,
      amountCents,
      currency,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      clientId: targetType === "client" ? target : null,
      clientGroupId: targetType === "group" ? target : null,
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push(`/admin/fees/${res.data!.fee.id}`);
  }

  return (
    <div className="grid max-w-xl gap-4">
      <FormField label="Name" htmlFor="fee-name">
        <TextInput id="fee-name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Description (optional)" htmlFor="fee-desc">
        <TextArea id="fee-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Amount" htmlFor="fee-amount">
          <TextInput
            id="fee-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>
        <FormField label="Currency" htmlFor="fee-currency">
          <SelectInput
            id="fee-currency"
            allowEmpty={false}
            options={CURRENCY_OPTIONS}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Due date (optional)" htmlFor="fee-due">
        <TextInput id="fee-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Target type" htmlFor="fee-target-type">
          <SelectInput
            id="fee-target-type"
            allowEmpty={false}
            options={[
              { value: "client", label: "Individual client" },
              { value: "group", label: "Client group" },
            ]}
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value as "client" | "group");
              setTarget("");
            }}
          />
        </FormField>
        <FormField label={targetType === "client" ? "Client" : "Client group"} htmlFor="fee-target">
          <SelectInput
            id="fee-target"
            placeholder={`Select a ${targetType}…`}
            options={targetType === "client" ? clients : groups}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </FormField>
      </div>
      {error ? <p className="text-sm text-red">{error}</p> : null}
      <div>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Creating…" : "Create fee"}
        </Button>
      </div>
    </div>
  );
}
