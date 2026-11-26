"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";

const Schema = z.object({
  name: z.string().min(1, "Give the group a name.").max(120),
  description: z.string().max(1000).optional(),
});
type Values = z.infer<typeof Schema>;

export function CreateUserGroupForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(Schema) });
  const [error, setError] = useState<string | null>(null);
  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost<{ group: { id: string } }>("/api/tenant/user-groups", values);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Group created. Now add its members.");
    router.push(`/admin/user-groups/${res.data!.group.id}`);
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-xl gap-4">
      <FormField label="Name" htmlFor="group-name" error={formState.errors.name?.message}>
        <TextInput id="group-name" autoComplete="off" placeholder="e.g. Science department…" {...register("name")} />
      </FormField>
      <FormField
        label="Description (optional)"
        htmlFor="group-description"
        hint="A note for staff about who belongs in this group."
        error={formState.errors.description?.message}
      >
        <TextArea id="group-description" {...register("description")} />
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Creating…" : "Create group"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/user-groups">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
