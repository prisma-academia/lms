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
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only."),
  description: z.string().max(5000).optional(),
});
type Values = z.infer<typeof Schema>;

export function CreateProgrammeForm() {
  const router = useRouter();
  const { register, handleSubmit, setValue, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
  });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost<{ programme: { id: string } }>("/api/tenant/programmes", values);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push(`/admin/programmes/${res.data!.programme.id}`);
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <FormField label="Title" htmlFor="title" error={formState.errors.title?.message}>
        <TextInput
          id="title"
          {...register("title")}
          onBlur={(e) => {
            const slugField = (e.currentTarget.form?.elements.namedItem("slug") as HTMLInputElement | null)?.value;
            if (!slugField) {
              const derived = e.currentTarget.value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
              if (derived) setValue("slug", derived, { shouldValidate: true });
            }
          }}
        />
      </FormField>
      <FormField label="Slug" htmlFor="slug" error={formState.errors.slug?.message}>
        <TextInput id="slug" {...register("slug")} />
      </FormField>
      <FormField label="Description (optional)" htmlFor="description" error={formState.errors.description?.message}>
        <TextArea id="description" {...register("description")} />
      </FormField>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Creating…" : "Create programme"}
        </Button>
      </div>
    </form>
  );
}
