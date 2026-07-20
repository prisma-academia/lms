"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, SelectInput } from "@/components/form-field";
import type { SelectOption } from "@/lib/geo/options";

const GB = 1024 ** 3;

export type PlanInitial = {
  code: string;
  name: string;
  priceMonthly: string;
  currency: string;
  storageGb: string;
  maxLearners: string;
  maxInstructors: string;
  maxCourses: string;
  isPublic: boolean;
  sortOrder: string;
};

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

export function PlanForm({
  mode,
  id,
  initial,
  currencyOptions,
}: {
  mode: "create" | "edit";
  id?: string;
  initial: PlanInitial;
  currencyOptions: SelectOption[];
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof PlanInitial>(key: K, value: PlanInitial[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setError(null);
    setInfo(null);
    const priceMonthlyCents = Math.round(parseFloat(v.priceMonthly) * 100);
    const storageBytes = Math.round(parseFloat(v.storageGb) * GB);
    if (mode === "create" && !/^[a-z0-9_-]+$/.test(v.code)) {
      return setError("Code must be lowercase letters, numbers, - or _.");
    }
    if (!v.name.trim()) return setError("Name is required.");
    if (Number.isNaN(priceMonthlyCents) || priceMonthlyCents < 0) return setError("Enter a valid price.");
    if (Number.isNaN(storageBytes) || storageBytes < 0) return setError("Enter a valid storage quota.");

    const payload = {
      name: v.name.trim(),
      priceMonthlyCents,
      currency: v.currency,
      storageQuotaBytes: storageBytes,
      maxLearners: numOrNull(v.maxLearners),
      maxInstructors: numOrNull(v.maxInstructors),
      maxCourses: numOrNull(v.maxCourses),
      isPublic: v.isPublic,
      sortOrder: numOrNull(v.sortOrder) ?? 0,
    };

    setPending(true);
    const res =
      mode === "create"
        ? await apiPost<{ plan: { id: string } }>("/api/platform/plans", { code: v.code, ...payload })
        : await apiPatch(`/api/platform/plans/${id}`, payload);
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (mode === "create") {
      router.push("/plans");
    } else {
      setInfo("Saved.");
      router.refresh();
    }
  }

  async function onDelete() {
    if (!confirm("Delete this plan?")) return;
    const res = await apiDelete(`/api/platform/plans/${id}`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push("/plans");
  }

  return (
    <div className="grid max-w-xl gap-4">
      <FormField label="Code" htmlFor="p-code" hint={mode === "edit" ? "Code cannot be changed." : undefined}>
        <TextInput
          id="p-code"
          value={v.code}
          onChange={(e) => set("code", e.target.value)}
          disabled={mode === "edit"}
        />
      </FormField>
      <FormField label="Name" htmlFor="p-name">
        <TextInput id="p-name" value={v.name} onChange={(e) => set("name", e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Monthly price" htmlFor="p-price">
          <TextInput
            id="p-price"
            type="number"
            min="0"
            step="0.01"
            value={v.priceMonthly}
            onChange={(e) => set("priceMonthly", e.target.value)}
          />
        </FormField>
        <FormField label="Currency" htmlFor="p-currency">
          <SelectInput
            id="p-currency"
            allowEmpty={false}
            options={currencyOptions}
            value={v.currency}
            onChange={(e) => set("currency", e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Storage quota (GB)" htmlFor="p-storage">
        <TextInput
          id="p-storage"
          type="number"
          min="0"
          step="1"
          value={v.storageGb}
          onChange={(e) => set("storageGb", e.target.value)}
        />
      </FormField>
      <div className="grid grid-cols-3 gap-4">
        <FormField label="Max learners" htmlFor="p-learners" hint="blank = unlimited">
          <TextInput id="p-learners" type="number" min="0" value={v.maxLearners} onChange={(e) => set("maxLearners", e.target.value)} />
        </FormField>
        <FormField label="Max instructors" htmlFor="p-instructors" hint="blank = unlimited">
          <TextInput id="p-instructors" type="number" min="0" value={v.maxInstructors} onChange={(e) => set("maxInstructors", e.target.value)} />
        </FormField>
        <FormField label="Max courses" htmlFor="p-courses" hint="blank = unlimited">
          <TextInput id="p-courses" type="number" min="0" value={v.maxCourses} onChange={(e) => set("maxCourses", e.target.value)} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Visibility" htmlFor="p-public">
          <SelectInput
            id="p-public"
            allowEmpty={false}
            options={[
              { value: "true", label: "Public" },
              { value: "false", label: "Hidden" },
            ]}
            value={String(v.isPublic)}
            onChange={(e) => set("isPublic", e.target.value === "true")}
          />
        </FormField>
        <FormField label="Sort order" htmlFor="p-sort">
          <TextInput id="p-sort" type="number" value={v.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </FormField>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
      <div className="flex gap-3">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create plan" : "Save"}
        </Button>
        {mode === "edit" ? (
          <Button type="button" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
