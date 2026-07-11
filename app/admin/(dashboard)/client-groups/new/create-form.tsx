"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea } from "@/components/form-field";

const Schema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
});
type Values = z.infer<typeof Schema>;

export function CreateClientGroupForm() {
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(Schema) });
  const [error, setError] = useState<string | null>(null);
  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost<{ group: { id: string } }>("/api/tenant/client-groups", values);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push(`/admin/client-groups/${res.data!.group.id}`);
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormField label="Name" htmlFor="name" error={formState.errors.name?.message}>
        <TextInput id="name" {...register("name")} />
      </FormField>
      <FormField label="Description (optional)" htmlFor="description" error={formState.errors.description?.message}>
        <TextArea id="description" {...register("description")} />
      </FormField>
      {error ? <p className="text-sm text-red">{error}</p> : null}
      <div>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Creating…" : "Create group"}
        </Button>
      </div>
    </form>
  );
}
