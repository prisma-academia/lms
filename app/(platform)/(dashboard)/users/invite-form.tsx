"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";

const Schema = z.object({
  email: z.email(),
  name: z.string().min(1).max(200),
  roleTemplateId: z.string().min(1),
});
type Values = z.infer<typeof Schema>;

export function InviteUserForm({ roles }: { roles: { id: string; name: string }[] }) {
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
  });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost("/api/platform/users", values);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    window.location.reload();
  });

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <FormField label="Email" htmlFor="email" error={formState.errors.email?.message}>
        <TextInput id="email" type="email" {...register("email")} />
      </FormField>
      <FormField label="Name" htmlFor="name" error={formState.errors.name?.message}>
        <TextInput id="name" {...register("name")} />
      </FormField>
      <FormField label="Role" htmlFor="role" error={formState.errors.roleTemplateId?.message}>
        <select
          id="role"
          className="w-full rounded-[10px] border-2 border-border bg-card px-3.5 py-2.5 text-[16px] font-medium text-card-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
          {...register("roleTemplateId")}
        >
          <option value="">Select…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive sm:col-span-3">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Inviting…" : "Send invite"}
        </Button>
      </div>
    </form>
  );
}
