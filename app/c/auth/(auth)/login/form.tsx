"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { useApiError } from "@/components/use-api-error";
import { authHref } from "@/lib/auth/next-path";

const Schema = z.object({
  email: z.email("Enter your email address, like name@example.com."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof Schema>;

const TEXT_LINK =
  "inline-flex min-h-9 items-center rounded-[6px] font-bold underline decoration-primary decoration-2 underline-offset-2 outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ClientLoginForm({
  next,
}: {
  /** Where to go after signing in — already validated by the page. */
  next?: string | null;
}) {
  // react-hook-form moves focus to the first field with an error on submit.
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
  });
  const report = useApiError();

  const onSubmit = handleSubmit(async (values) => {
    const res = await apiPost<{ redirect: string }>("/api/auth/login", {
      email: values.email,
      password: values.password,
      surface: "tenant_client",
      // The server decides the destination; this is only a request.
      ...(next ? { next } : {}),
    });
    if (!report(res, () => onSubmit())) return;
    if (res.data?.redirect) window.location.assign(res.data.redirect);
  });

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
      <FormField label="Password" htmlFor="password" error={formState.errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          aria-invalid={formState.errors.password ? true : undefined}
          {...register("password")}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px] font-medium text-muted-foreground">
        {/* Keeps the destination through "I don't have an account yet". */}
        <Link href={authHref("register", next)} className={TEXT_LINK}>
          Create an account
        </Link>
        <Link href="/auth/forgot-password" className={TEXT_LINK}>
          Forgot your password?
        </Link>
      </div>
    </form>
  );
}
