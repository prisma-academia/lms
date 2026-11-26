"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { useApiError } from "@/components/use-api-error";

const Schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(12, "Use at least 12 characters."),
    confirm: z.string().min(1, "Type the new password again."),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ["confirm"],
    message: "The two passwords don't match.",
  });

type Values = z.infer<typeof Schema>;

export function ChangePasswordForm({ dialogErrors = false }: { dialogErrors?: boolean }) {
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
  });
  const [error, setError] = useState<string | null>(null);
  const report = useApiError();

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost<{ redirect: string }>("/api/auth/change-password", {
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (res.error) {
      if (dialogErrors) report(res, () => onSubmit());
      else setError(res.error.message);
      return;
    }
    if (res.data?.redirect) window.location.assign(res.data.redirect);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField label="Current password" htmlFor="cur" error={formState.errors.currentPassword?.message}>
        <PasswordInput
          id="cur"
          autoComplete="current-password"
          aria-invalid={formState.errors.currentPassword ? true : undefined}
          {...register("currentPassword")}
        />
      </FormField>
      <FormField
        label="New password"
        htmlFor="new"
        hint="At least 12 characters, with a capital letter, a small letter, a number and a symbol."
        error={formState.errors.newPassword?.message}
      >
        <PasswordInput
          id="new"
          autoComplete="new-password"
          aria-invalid={formState.errors.newPassword ? true : undefined}
          {...register("newPassword")}
        />
      </FormField>
      <FormField label="Confirm new password" htmlFor="conf" error={formState.errors.confirm?.message}>
        <PasswordInput
          id="conf"
          autoComplete="new-password"
          aria-invalid={formState.errors.confirm ? true : undefined}
          {...register("confirm")}
        />
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
