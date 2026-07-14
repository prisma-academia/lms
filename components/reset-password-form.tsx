"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { useApiError } from "@/components/use-api-error";

const Schema = z
  .object({
    password: z.string().min(12, "At least 12 characters."),
    confirm: z.string().min(12),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
  });

type Values = z.infer<typeof Schema>;

export function ResetPasswordForm({
  token,
  backHref,
  backLabel,
  dialogErrors = false,
}: {
  token: string;
  backHref: string;
  backLabel: string;
  /** Route API errors to the global error dialog instead of inline text. */
  dialogErrors?: boolean;
}) {
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
  });
  const [error, setError] = useState<string | null>(null);
  const report = useApiError();

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost<{ redirect: string }>("/api/auth/reset-password", {
      token,
      password: values.password,
    });
    if (res.error) {
      if (dialogErrors) report(res, () => onSubmit());
      else setError(res.error.message);
      return;
    }
    if (res.data?.redirect) window.location.assign(res.data.redirect);
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormField label="New password" htmlFor="pw" error={formState.errors.password?.message}>
        <TextInput id="pw" type="password" autoComplete="new-password" {...register("password")} />
      </FormField>
      <FormField label="Confirm password" htmlFor="cf" error={formState.errors.confirm?.message}>
        <TextInput id="cf" type="password" autoComplete="new-password" {...register("confirm")} />
      </FormField>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Saving…" : "Update password"}
      </Button>
      <p className="text-center text-xs text-stone-500">
        <Link href={backHref} className="underline">
          {backLabel}
        </Link>
      </p>
    </form>
  );
}
