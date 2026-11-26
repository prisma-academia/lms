"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";

const Schema = z.object({
  firstName: z.string().min(1).max(100).optional().or(z.literal("")),
  lastName: z.string().min(1).max(100).optional().or(z.literal("")),
  otherName: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  email: z.email("Enter a valid email address."),
});
type Values = z.infer<typeof Schema>;

export function CreateClientForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(Schema) });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost<{ client: { id: string } }>("/api/tenant/clients", values);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Learner added.");
    if (res.data?.client.id) router.push(`/admin/clients/${res.data.client.id}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField
        label="Email"
        htmlFor="learner-email"
        hint="What they sign in with. After adding them, use “Reset password” on their page to email a temporary password."
        error={formState.errors.email?.message}
        className="sm:col-span-2"
      >
        <TextInput id="learner-email" type="email" autoComplete="off" spellCheck={false} {...register("email")} />
      </FormField>
      <FormField label="First name (optional)" htmlFor="learner-first" error={formState.errors.firstName?.message}>
        <TextInput id="learner-first" autoComplete="off" {...register("firstName")} />
      </FormField>
      <FormField label="Last name (optional)" htmlFor="learner-last" error={formState.errors.lastName?.message}>
        <TextInput id="learner-last" autoComplete="off" {...register("lastName")} />
      </FormField>
      <FormField label="Other name (optional)" htmlFor="learner-other" error={formState.errors.otherName?.message}>
        <TextInput id="learner-other" autoComplete="off" {...register("otherName")} />
      </FormField>
      <FormField label="Phone (optional)" htmlFor="learner-phone" error={formState.errors.phone?.message}>
        <TextInput id="learner-phone" type="tel" inputMode="tel" autoComplete="off" {...register("phone")} />
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Adding…" : "Add learner"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/clients">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
