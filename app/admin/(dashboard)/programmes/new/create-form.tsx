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
  title: z.string().min(1, "Give the programme a title.").max(200),
  slug: z
    .string()
    .min(1, "Enter a web address.")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only."),
  description: z.string().max(5000).optional(),
});
type Values = z.infer<typeof Schema>;

export function CreateProgrammeForm() {
  const router = useRouter();
  const { toast } = useToast();
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
    toast("Programme created. Now add its courses.");
    router.push(`/admin/programmes/${res.data!.programme.id}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-xl gap-4">
      <FormField label="Title" htmlFor="programme-title" error={formState.errors.title?.message}>
        <TextInput
          id="programme-title"
          autoComplete="off"
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
      <FormField
        label="Web address"
        htmlFor="programme-slug"
        hint="The last part of the programme link. Filled in from the title; change it if you like."
        error={formState.errors.slug?.message}
      >
        <TextInput id="programme-slug" autoComplete="off" spellCheck={false} {...register("slug")} />
      </FormField>
      <FormField
        label="Description (optional)"
        htmlFor="programme-description"
        hint="Shown on the programme page, before a learner enrolls."
        error={formState.errors.description?.message}
      >
        <TextArea id="programme-description" {...register("description")} />
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Creating…" : "Create programme"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/programmes">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
