"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { useApiError } from "@/components/use-api-error";

const Schema = z.object({
  displayName: z.string().min(1, "Enter your name."),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
});

type Values = z.infer<typeof Schema>;

export function ClientProfileForm({
  initialDisplayName,
  initialFirstName,
  initialLastName,
  initialPhone,
}: {
  initialDisplayName: string;
  initialFirstName: string;
  initialLastName: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      displayName: initialDisplayName,
      firstName: initialFirstName || undefined,
      lastName: initialLastName || undefined,
      phone: initialPhone || undefined,
    },
  });
  const [saved, setSaved] = useState(false);
  const report = useApiError();

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    const res = await apiPatch<{ client: { id: string } }>("/api/client/profile", {
      displayName: values.displayName,
      firstName: values.firstName || null,
      lastName: values.lastName || null,
      phone: values.phone || null,
    });
    if (!report(res, () => onSubmit())) return;
    setSaved(true);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      <FormField label="Display name" htmlFor="displayName" error={formState.errors.displayName?.message}>
        <TextInput id="displayName" autoComplete="name" {...register("displayName")} />
      </FormField>
      <FormField label="First name (optional)" htmlFor="firstName" error={formState.errors.firstName?.message}>
        <TextInput id="firstName" autoComplete="given-name" {...register("firstName")} />
      </FormField>
      <FormField label="Last name (optional)" htmlFor="lastName" error={formState.errors.lastName?.message}>
        <TextInput id="lastName" autoComplete="family-name" {...register("lastName")} />
      </FormField>
      <FormField label="Phone (optional)" htmlFor="phone" error={formState.errors.phone?.message}>
        <TextInput id="phone" type="tel" autoComplete="tel" {...register("phone")} />
      </FormField>
      {saved ? <p className="text-sm text-green-700">Profile saved.</p> : null}
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
