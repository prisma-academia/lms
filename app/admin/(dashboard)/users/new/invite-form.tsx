"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";

const Schema = z.object({
  firstName: z.string().min(1, "Enter a first name.").max(100),
  lastName: z.string().min(1, "Enter a last name.").max(100),
  otherName: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  email: z.email("Enter a valid email address."),
  roleTemplateId: z.string().min(1, "Choose a role."),
});
type Values = z.infer<typeof Schema>;

export function InviteTenantUserForm({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(Schema) });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost<{ user: { id: string } }>("/api/tenant/users", values);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Invite sent.");
    if (res.data?.user.id) router.push(`/admin/users/${res.data.user.id}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField label="First name" htmlFor="invite-first" error={formState.errors.firstName?.message}>
        <TextInput id="invite-first" autoComplete="off" {...register("firstName")} />
      </FormField>
      <FormField label="Last name" htmlFor="invite-last" error={formState.errors.lastName?.message}>
        <TextInput id="invite-last" autoComplete="off" {...register("lastName")} />
      </FormField>
      <FormField label="Other name (optional)" htmlFor="invite-other" error={formState.errors.otherName?.message}>
        <TextInput id="invite-other" autoComplete="off" {...register("otherName")} />
      </FormField>
      <FormField label="Phone (optional)" htmlFor="invite-phone" error={formState.errors.phone?.message}>
        <TextInput id="invite-phone" type="tel" inputMode="tel" autoComplete="off" {...register("phone")} />
      </FormField>
      <FormField
        label="Email"
        htmlFor="invite-email"
        hint="The invite and a temporary password are sent here."
        error={formState.errors.email?.message}
      >
        <TextInput id="invite-email" type="email" autoComplete="off" spellCheck={false} {...register("email")} />
      </FormField>
      <FormField
        label="Role"
        htmlFor="invite-role"
        hint="Sets what this person can see and change. You can adjust it later."
        error={formState.errors.roleTemplateId?.message}
      >
        <SelectInput
          id="invite-role"
          placeholder="Choose a role…"
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          {...register("roleTemplateId")}
        />
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Sending invite…" : "Send invite"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/users">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
