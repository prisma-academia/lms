"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, SelectInput } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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
  const confirm = useConfirm();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function set<K extends keyof PlanInitial>(key: K, value: PlanInitial[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceMonthlyCents = Math.round(parseFloat(v.priceMonthly) * 100);
    const storageBytes = Math.round(parseFloat(v.storageGb) * GB);
    if (mode === "create" && !/^[a-z0-9_-]+$/.test(v.code)) {
      return setError("The code can only use lowercase letters, numbers, hyphens and underscores.");
    }
    if (!v.name.trim()) return setError("Give the plan a name.");
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
      toast("Plan created");
      router.push("/plans");
    } else {
      toast("Plan saved");
      router.refresh();
    }
  }

  async function onDelete() {
    const yes = await confirm({
      title: `Delete the ${v.name.trim() || "plan"} plan?`,
      description:
        "Academies can no longer choose it. A plan that academies are subscribed to cannot be deleted. This cannot be undone.",
      confirmLabel: "Delete plan",
      destructive: true,
    });
    if (!yes) return;
    setDeleting(true);
    const res = await apiDelete(`/api/platform/plans/${id}`);
    setDeleting(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Plan deleted");
    router.push("/plans");
  }

  return (
    <form onSubmit={submit} className="grid max-w-xl gap-4">
      <FormField
        label="Code"
        htmlFor="p-code"
        hint={
          mode === "edit"
            ? "The code cannot be changed once a plan exists."
            : "A short identifier used in links and records, such as “starter”. Lowercase, no spaces."
        }
      >
        <TextInput
          id="p-code"
          name="code"
          autoComplete="off"
          spellCheck={false}
          value={v.code}
          onChange={(e) => set("code", e.target.value)}
          disabled={mode === "edit"}
        />
      </FormField>
      <FormField label="Name" htmlFor="p-name">
        <TextInput id="p-name" name="name" autoComplete="off" value={v.name} onChange={(e) => set("name", e.target.value)} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Monthly price" htmlFor="p-price">
          <TextInput
            id="p-price"
            name="priceMonthly"
            type="number"
            inputMode="decimal"
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Max learners" htmlFor="p-learners" hint="Leave blank for no limit.">
          <TextInput id="p-learners" type="number" min="0" value={v.maxLearners} onChange={(e) => set("maxLearners", e.target.value)} />
        </FormField>
        <FormField label="Max instructors" htmlFor="p-instructors" hint="Leave blank for no limit.">
          <TextInput id="p-instructors" type="number" min="0" value={v.maxInstructors} onChange={(e) => set("maxInstructors", e.target.value)} />
        </FormField>
        <FormField label="Max courses" htmlFor="p-courses" hint="Leave blank for no limit.">
          <TextInput id="p-courses" type="number" min="0" value={v.maxCourses} onChange={(e) => set("maxCourses", e.target.value)} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Visibility"
          htmlFor="p-public"
          hint="Hidden plans are not offered to academies, but stay on those already using them."
        >
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
        <FormField label="Sort order" htmlFor="p-sort" hint="Lower numbers are listed first.">
          <TextInput id="p-sort" type="number" value={v.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {/* The destructive action sits apart from the primary one, never beside it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={pending || deleting}>
          {pending ? "Saving…" : mode === "create" ? "Create plan" : "Save changes"}
        </Button>
        {mode === "edit" ? (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={pending || deleting}>
            {deleting ? "Deleting…" : "Delete plan"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
