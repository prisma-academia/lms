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

const Schema = z.object({ email: z.email() });
type Values = z.infer<typeof Schema>;

export function ForgotPasswordForm({
  surface,
  backHref,
  backLabel,
  dialogErrors = false,
}: {
  surface: "platform" | "tenant_admin" | "tenant_client";
  backHref: string;
  backLabel: string;
  /** Route API errors to the global error dialog instead of inline text. */
  dialogErrors?: boolean;
}) {
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const report = useApiError();

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost("/api/auth/forgot-password", { email: values.email, surface });
    if (res.error) {
      if (dialogErrors) report(res, () => onSubmit());
      else setError(res.error.message);
      return;
    }
    setDone(true);
  });

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-stone-600">
          If an account exists for that email, we sent a reset link. Check your inbox (and spam).
        </p>
        <p className="text-center text-xs text-stone-500">
          <Link href={backHref} className="underline">
            {backLabel}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormField label="Email" htmlFor="email" error={formState.errors.email?.message}>
        <TextInput id="email" type="email" autoComplete="email" {...register("email")} />
      </FormField>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-xs text-stone-500">
        <Link href={backHref} className="underline">
          {backLabel}
        </Link>
      </p>
    </form>
  );
}
