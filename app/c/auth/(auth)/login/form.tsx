"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { useApiError } from "@/components/use-api-error";

const Schema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
type Values = z.infer<typeof Schema>;

export function ClientLoginForm() {
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
  });
  const report = useApiError();

  const onSubmit = handleSubmit(async (values) => {
    const res = await apiPost<{ redirect: string }>("/api/auth/login", {
      email: values.email,
      password: values.password,
      surface: "tenant_client",
    });
    if (!report(res, () => onSubmit())) return;
    if (res.data?.redirect) window.location.assign(res.data.redirect);
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormField label="Email" htmlFor="email" error={formState.errors.email?.message}>
        <TextInput id="email" type="email" autoComplete="email" {...register("email")} />
      </FormField>
      <FormField label="Password" htmlFor="password" error={formState.errors.password?.message}>
        <TextInput id="password" type="password" autoComplete="current-password" {...register("password")} />
      </FormField>
      <Button type="submit" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-stone-500">
        <Link href="/auth/register" className="underline">
          Create an account
        </Link>
        {" · "}
        <Link href="/auth/forgot-password" className="underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}
