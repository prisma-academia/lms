"use client";

/* eslint-disable react-hooks/incompatible-library */

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiPost, apiGet } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import { OtpInput } from "@/components/ui/otp-input";
import { getCountryOptions } from "@/lib/geo/countries";
import { invalidEmail, minLength, required } from "@/lib/validation/messages";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN = 60;

const AccountSchema = z
  .object({
    firstName: z.string().min(1, required("First name")).max(100),
    lastName: z.string().min(1, required("Last name")).max(100),
    otherName: z.string().max(100).optional().or(z.literal("")),
    phone: z.string().min(1, required("Phone")).max(40),
    email: z.email(invalidEmail),
    password: z.string().min(12, minLength("Password", 12)),
    confirmPassword: z.string().min(12, minLength("Confirm password", 12)),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

const CompanySchema = z.object({
  name: z.string().min(1, required("Company name")).max(200),
  slug: z.string().min(3, "Workspace URL must be at least 3 characters.").max(32).regex(/^[a-z0-9-]+$/, "Lowercase letters, digits, hyphens."),
  companyEmail: z.email(invalidEmail).optional().or(z.literal("")),
  companyPhone: z.string().max(40).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
  addressLine1: z.string().max(200).optional().or(z.literal("")),
  addressLine2: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  region: z.string().max(100).optional().or(z.literal("")),
  postalCode: z.string().max(40).optional().or(z.literal("")),
  country: z.string().max(2).optional().or(z.literal("")),
});

type AccountValues = z.infer<typeof AccountSchema>;
type CompanyValues = z.infer<typeof CompanySchema>;

const COUNTRY_OPTIONS = getCountryOptions();

type SlugResult = { available: boolean; message: string };

function slugAvailabilityMessage(available: boolean, reason?: string): string {
  if (available) return "This workspace URL is available.";
  switch (reason) {
    case "reserved":
      return "This workspace URL is reserved.";
    case "invalid":
      return "Use lowercase letters, digits, and hyphens only.";
    case "quarantined":
      return "This URL was recently used and is temporarily unavailable.";
    case "taken":
      return "This workspace URL is already taken.";
    default:
      return "This workspace URL is unavailable.";
  }
}

type Step = "account" | "company" | "otp";

export function RegisterWizard() {
  const [step, setStep] = useState<Step>("account");
  const [account, setAccount] = useState<AccountValues | null>(null);
  const [company, setCompany] = useState<CompanyValues | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  async function resendCode() {
    if (!account || !company || resendIn > 0 || resending) return;
    setError(null);
    setInfo(null);
    setResending(true);
    const res = await apiPost("/api/auth/register/start", { ...account, ...company });
    setResending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setCode("");
    setInfo("We sent a new 6-digit code to your email.");
    setResendIn(RESEND_COOLDOWN);
  }

  return (
    <div>
      <Steps current={step} />
      <div className="mt-6">
        {step === "account" ? (
          <AccountForm
            initial={account}
            onNext={(v) => {
              setAccount(v);
              setStep("company");
            }}
          />
        ) : null}
        {step === "company" ? (
          <CompanyForm
            initial={company}
            onBack={() => setStep("account")}
            onSubmit={async (v) => {
              if (!account) return;
              setError(null);
              setPending(true);
              const res = await apiPost("/api/auth/register/start", { ...account, ...v });
              setPending(false);
              if (res.error) {
                setError(res.error.message);
                return;
              }
              setCompany(v);
              setInfo("We emailed a 6-digit code. Enter it below.");
              setResendIn(RESEND_COOLDOWN);
              setStep("otp");
            }}
            pending={pending}
            error={error}
          />
        ) : null}
        {step === "otp" ? (
          <div className="flex flex-col gap-4">
            {info ? <p className="text-sm font-medium text-green-700">{info}</p> : null}
            <FormField label="Verification code" htmlFor="code">
              <OtpInput
                id="code"
                value={code}
                onChange={setCode}
                disabled={pending}
                autoFocus
                aria-invalid={!!error}
              />
            </FormField>
            {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Didn&apos;t get the code?</span>
              {resendIn > 0 ? (
                <span className="font-medium text-muted-foreground">Resend in {resendIn}s</span>
              ) : (
                <button
                  type="button"
                  className="font-bold text-foreground underline decoration-primary decoration-2 underline-offset-4 disabled:opacity-50"
                  onClick={resendCode}
                  disabled={resending || pending}
                >
                  {resending ? "Sending…" : "Resend code"}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setStep("company");
                }}
              >
                Back
              </Button>
              <Button
                disabled={pending || !/^\d{6}$/.test(code)}
                onClick={async () => {
                  if (!account || !company) return;
                  setError(null);
                  setPending(true);
                  const res = await apiPost<{ redirectUrl: string }>(
                    "/api/auth/register/verify",
                    { ...account, ...company, code }
                  );
                  setPending(false);
                  if (res.error) {
                    setError(res.error.message);
                    return;
                  }
                  if (res.data?.redirectUrl) window.location.assign(res.data.redirectUrl);
                }}
              >
                {pending ? "Verifying…" : "Create workspace"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Steps({ current }: { current: Step }) {
  const items: Array<{ key: Step; label: string }> = [
    { key: "account", label: "1. Your account" },
    { key: "company", label: "2. Your company" },
    { key: "otp", label: "3. Verify email" },
  ];
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {items.map((it) => (
        <div
          key={it.key}
          className={`rounded px-2 py-1 ${it.key === current ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"}`}
        >
          {it.label}
        </div>
      ))}
    </div>
  );
}

function AccountForm({
  initial,
  onNext,
}: {
  initial: AccountValues | null;
  onNext: (v: AccountValues) => void;
}) {
  const { register, handleSubmit, formState } = useForm<AccountValues>({
    resolver: zodResolver(AccountSchema),
    defaultValues: initial ?? undefined,
  });
  const onSubmit = handleSubmit((v) => onNext(v));
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField label="First name" htmlFor="first" error={formState.errors.firstName?.message}>
        <TextInput id="first" {...register("firstName")} />
      </FormField>
      <FormField label="Last name" htmlFor="last" error={formState.errors.lastName?.message}>
        <TextInput id="last" {...register("lastName")} />
      </FormField>
      <FormField label="Other name (optional)" htmlFor="other" error={formState.errors.otherName?.message}>
        <TextInput id="other" {...register("otherName")} />
      </FormField>
      <FormField label="Phone" htmlFor="phone" error={formState.errors.phone?.message}>
        <TextInput id="phone" type="tel" autoComplete="tel" {...register("phone")} />
      </FormField>
      <FormField label="Email" htmlFor="email" className="sm:col-span-2" error={formState.errors.email?.message}>
        <TextInput id="email" type="email" {...register("email")} />
      </FormField>
      <FormField label="Password" htmlFor="pw" error={formState.errors.password?.message}>
        <TextInput id="pw" type="password" autoComplete="new-password" {...register("password")} />
      </FormField>
      <FormField label="Confirm password" htmlFor="cpw" error={formState.errors.confirmPassword?.message}>
        <TextInput id="cpw" type="password" autoComplete="new-password" {...register("confirmPassword")} />
      </FormField>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
}

function CompanyForm({
  initial,
  onBack,
  onSubmit,
  pending,
  error,
}: {
  initial: CompanyValues | null;
  onBack: () => void;
  onSubmit: (v: CompanyValues) => void | Promise<void>;
  pending: boolean;
  error: string | null;
}) {
  const { register, handleSubmit, formState, watch, setError, clearErrors } = useForm<CompanyValues>({
    resolver: zodResolver(CompanySchema),
    defaultValues: initial ?? undefined,
  });
  const slug = watch("slug");
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugResult, setSlugResult] = useState<SlugResult | null>(null);

  async function checkSlug(value: string) {
    if (!value || value.length < 3) {
      setSlugChecking(false);
      setSlugResult(null);
      clearErrors("slug");
      return;
    }
    setSlugChecking(true);
    setSlugResult(null);
    const res = await apiGet<{ available: boolean; reason?: string }>(
      `/api/platform/slugs/check?slug=${encodeURIComponent(value)}`
    );
    setSlugChecking(false);
    if (!res.data) return;
    const message = slugAvailabilityMessage(res.data.available, res.data.reason);
    setSlugResult({ available: res.data.available, message });
    if (res.data.available) {
      clearErrors("slug");
    } else {
      setError("slug", { type: "manual", message });
    }
  }

  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugChecking(false);
      setSlugResult(null);
      return;
    }
    setSlugChecking(true);
    setSlugResult(null);
    const timer = setTimeout(() => {
      void checkSlug(slug);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce slug lookup only
  }, [slug]);

  const submit = handleSubmit((v) => onSubmit(v));

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField label="Company name" htmlFor="cname" error={formState.errors.name?.message}>
        <TextInput id="cname" {...register("name")} />
      </FormField>
      <FormField
        label="Slug (subdomain)"
        htmlFor="slug"
        error={!slugResult ? formState.errors.slug?.message : undefined}
      >
        <TextInput id="slug" placeholder="acme" {...register("slug")} />
        {slugChecking ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" role="status">
            <span className="size-3 animate-spin rounded-full border-2 border-border border-t-foreground" />
            Checking availability…
          </span>
        ) : slugResult ? (
          <span
            className={cn(
              "text-xs font-bold",
              slugResult.available ? "text-success" : "text-destructive"
            )}
            role="status"
          >
            {slugResult.message}
          </span>
        ) : null}
      </FormField>
      <FormField label="Company email" htmlFor="cemail" error={formState.errors.companyEmail?.message}>
        <TextInput id="cemail" type="email" {...register("companyEmail")} />
      </FormField>
      <FormField label="Company phone" htmlFor="cphone" error={formState.errors.companyPhone?.message}>
        <TextInput id="cphone" type="tel" {...register("companyPhone")} />
      </FormField>
      <FormField label="Website" htmlFor="web" className="sm:col-span-2" error={formState.errors.website?.message}>
        <TextInput id="web" {...register("website")} />
      </FormField>
      <FormField label="Address line 1" htmlFor="a1" error={formState.errors.addressLine1?.message}>
        <TextInput id="a1" {...register("addressLine1")} />
      </FormField>
      <FormField label="Address line 2" htmlFor="a2" error={formState.errors.addressLine2?.message}>
        <TextInput id="a2" {...register("addressLine2")} />
      </FormField>
      <FormField label="City" htmlFor="city" error={formState.errors.city?.message}>
        <TextInput id="city" {...register("city")} />
      </FormField>
      <FormField label="Region / State" htmlFor="reg" error={formState.errors.region?.message}>
        <TextInput id="reg" {...register("region")} />
      </FormField>
      <FormField label="Postal code" htmlFor="pc" error={formState.errors.postalCode?.message}>
        <TextInput id="pc" {...register("postalCode")} />
      </FormField>
      <FormField label="Country" htmlFor="ctry" error={formState.errors.country?.message}>
        <SelectInput id="ctry" options={COUNTRY_OPTIONS} {...register("country")} />
      </FormField>
      {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
      <div className="flex justify-between sm:col-span-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button type="submit" disabled={pending || slugChecking || slugResult?.available === false}>
          {pending ? "Sending code…" : "Send verification code"}
        </Button>
      </div>
    </form>
  );
}
