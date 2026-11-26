"use client";

import { useState } from "react";
import { apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";
import { PermissionPicker } from "../permission-picker";

export function RoleDetailEditor({
  id,
  name,
  isSystem,
  initial,
  allPermissions,
  endpoint,
}: {
  id: string;
  name: string;
  isSystem: boolean;
  initial: string[];
  allPermissions: readonly string[];
  endpoint: string;
}) {
  void id;
  const { toast } = useToast();
  const [n, setN] = useState(name);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await apiPatch(endpoint, {
      ...(isSystem ? {} : { name: n }),
      permissions: Array.from(selected),
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Role saved");
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <FormField
        label="Role name"
        htmlFor="rn"
        hint={
          isSystem
            ? "Built-in roles cannot be renamed, and the Owner role cannot lose permissions."
            : undefined
        }
        className="max-w-md"
      >
        <TextInput
          id="rn"
          name="name"
          autoComplete="off"
          value={n}
          onChange={(e) => setN(e.target.value)}
          disabled={isSystem}
        />
      </FormField>
      <div>
        <h2 className="mb-2 text-[13px] font-bold text-foreground">What this role can do</h2>
        <PermissionPicker permissions={allPermissions} selected={selected} onChange={setSelected} />
      </div>
      <p className="text-[13px] font-medium text-muted-foreground">
        Changing a role does not change people who already have it. To update someone, open
        their page and apply the role again.
      </p>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
