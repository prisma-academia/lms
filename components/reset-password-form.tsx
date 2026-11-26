"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { useApiError } from "@/components/use-api-error";

const Schema = z
  .object({
    password: z.string().min(12, "Use at least 12 characters."),
    confirm: z.string().min(1, "Type the password again."),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "The two passwords don't match.",
  });

type Values = z.infer<typeof Schema>;

const TEXT_LINK =
  "inline-flex min-h-9 items-center rounded-[6px] font-bold underline decoration-primary decoration-2 underline-offset-2 outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

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
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        label="New password"
        htmlFor="pw"
        hint="At least 12 characters, with a capital letter, a small letter, a number and a symbol."
        error={formState.errors.password?.message}
      >
        <PasswordInput
          id="pw"
          autoComplete="new-password"
          aria-invalid={formState.errors.password ? true : undefined}
          {...register("password")}
        />
      </FormField>
      <FormField label="Confirm new password" htmlFor="cf" error={formState.errors.confirm?.message}>
        <PasswordInput
          id="cf"
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
      <p className="text-center text-[13px] font-medium text-muted-foreground">
        <Link href={backHref} className={TEXT_LINK}>
          {backLabel}
        </Link>
      </p>
    </form>
  );
}
