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
  name: z.string().min(1, "Give the bank a name.").max(200),
  description: z.string().max(2000).optional(),
});
type Values = z.infer<typeof Schema>;

export function CreateBankForm() {
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(Schema) });
  const [error, setError] = useState<string | null>(null);
  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost<{ bank: { id: string } }>("/api/tenant/question-banks", values);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push(`/admin/question-banks/${res.data!.bank.id}`);
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-xl gap-4">
      <FormField
        label="Name"
        htmlFor="name"
        hint="Usually the topic the questions cover, such as “Cell biology”."
        error={formState.errors.name?.message}
      >
        <TextInput id="name" autoComplete="off" {...register("name")} />
      </FormField>
      <FormField label="Description (optional)" htmlFor="description" error={formState.errors.description?.message}>
        <TextArea id="description" {...register("description")} />
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Creating…" : "Create bank"}
        </Button>
      </div>
    </form>
  );
}
