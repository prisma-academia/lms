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

const Schema = z.object({ email: z.email("Enter your email address, like name@example.com.") });
type Values = z.infer<typeof Schema>;

const TEXT_LINK =
  "inline-flex min-h-9 items-center rounded-[6px] font-bold underline decoration-primary decoration-2 underline-offset-2 outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

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
        {/* Deliberately does not say whether the address has an account. */}
        <p role="status" className="text-sm font-medium text-foreground">
          If there&rsquo;s an account for that email, a reset link is on its way. Check your inbox
          and your spam folder. The link works for a limited time.
        </p>
        <p className="text-center text-[13px] font-medium text-muted-foreground">
          <Link href={backHref} className={TEXT_LINK}>
            {backLabel}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField label="Email" htmlFor="email" error={formState.errors.email?.message}>
        <TextInput
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={formState.errors.email ? true : undefined}
          {...register("email")}
        />
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-[13px] font-medium text-muted-foreground">
        <Link href={backHref} className={TEXT_LINK}>
          {backLabel}
        </Link>
      </p>
    </form>
  );
}
