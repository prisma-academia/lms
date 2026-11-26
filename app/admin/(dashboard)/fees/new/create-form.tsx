"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import type { SelectOption } from "@/lib/geo/options";

type Option = { value: string; label: string };

export function CreateFeeForm({
  clients,
  groups,
  currencyOptions,
}: {
  clients: Option[];
  groups: Option[];
  currencyOptions: SelectOption[];
}) {
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!name.trim()) return setError("Give the fee a name.");
    if (Number.isNaN(amountCents) || amountCents < 1) return setError("Enter an amount greater than zero.");
    if (!target) return setError(`Choose a ${targetType === "client" ? "learner" : "group"}.`);

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

  const noTargets = targetType === "client" ? clients.length === 0 : groups.length === 0;

  return (
    <form onSubmit={submit} className="grid max-w-xl gap-4">
      <FormField label="Name" htmlFor="fee-name" hint="What the charge is for, such as “Term 1 tuition”.">
        <TextInput
          id="fee-name"
          name="name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField label="Description (optional)" htmlFor="fee-desc">
        <TextArea id="fee-desc" name="description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Amount" htmlFor="fee-amount">
          <TextInput
            id="fee-amount"
            name="amount"
            type="number"
            inputMode="decimal"
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
            options={currencyOptions}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Due date (optional)" htmlFor="fee-due">
        <TextInput id="fee-due" name="dueAt" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Charge it to" htmlFor="fee-target-type">
          <SelectInput
            id="fee-target-type"
            allowEmpty={false}
            options={[
              { value: "client", label: "One learner" },
              { value: "group", label: "A group of learners" },
            ]}
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value as "client" | "group");
              setTarget("");
            }}
          />
        </FormField>
        <FormField
          label={targetType === "client" ? "Learner" : "Group"}
          htmlFor="fee-target"
          hint={
            noTargets
              ? targetType === "client"
                ? "There are no learners yet. Add one first."
                : "There are no groups yet. Create one first."
              : targetType === "group"
                ? "Everyone in the group is charged the same amount."
                : undefined
          }
        >
          <SelectInput
            id="fee-target"
            placeholder={`Choose a ${targetType === "client" ? "learner" : "group"}…`}
            options={targetType === "client" ? clients : groups}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={noTargets}
          />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create fee"}
        </Button>
      </div>
    </form>
  );
}
