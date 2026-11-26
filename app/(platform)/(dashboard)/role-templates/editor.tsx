"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { PermissionPicker } from "./permission-picker";

export function RoleEditor({
  permissions,
  scope,
}: {
  permissions: readonly string[];
  scope: "platform" | "tenant";
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give the role a name.");
      return;
    }
    setPending(true);
    const res = await apiPost<{ role: { id: string } }>(
      scope === "platform" ? "/api/platform/role-templates" : "/api/tenant/role-templates",
      { name: name.trim(), permissions: Array.from(selected) }
    );
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.role.id) {
      router.push(scope === "platform" ? `/role-templates/${res.data.role.id}` : `/admin/role-templates/${res.data.role.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FormField
        label="Role name"
        htmlFor="rname"
        hint="What you would call this job — for example “Course author” or “Finance officer”."
        className="max-w-md"
      >
        <TextInput
          id="rname"
          name="name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <div>
        <h2 className="mb-2 text-[13px] font-bold text-foreground">What this role can do</h2>
        <PermissionPicker permissions={permissions} selected={selected} onChange={setSelected} />
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create role"}
        </Button>
      </div>
    </form>
  );
}
