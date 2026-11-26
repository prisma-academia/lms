"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { OtpInput } from "@/components/ui/otp-input";
import { useApiError } from "@/components/use-api-error";
import { authHref } from "@/lib/auth/next-path";

const DetailsSchema = z
  .object({
    email: z.email("Enter your email address, like name@example.com."),
    password: z.string().min(12, "Use at least 12 characters."),
    confirm: z.string().min(1, "Type the password again."),
    displayName: z.string().min(1, "Enter the name you'd like us to use."),
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    otherName: z.string().max(100).optional(),
    phone: z.string().max(40).optional(),
    // Loose on purpose. A code that does not exist is ignored by the server
    // rather than refused: this field is often pre-filled from a link, and an
    // old link must never be the reason someone cannot create an account.
    referralCode: z.string().max(32).optional(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "The two passwords don't match.",
  });

const TEXT_LINK =
  "inline-flex min-h-9 items-center rounded-[6px] font-bold underline decoration-primary decoration-2 underline-offset-2 outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

const OtpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

type DetailsValues = z.infer<typeof DetailsSchema>;
type OtpValues = z.infer<typeof OtpSchema>;

export function ClientRegisterForm({
  next,
  defaultReferralCode,
}: {
  /** Where to go once the account exists — already validated by the page. */
  next?: string | null;
  /** The code from the link that brought this visitor here, if there was one. */
  defaultReferralCode?: string | null;
}) {
  const [step, setStep] = useState<"details" | "otp">("details");
  const [email, setEmail] = useState("");
  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  const report = useApiError();

  const detailsForm = useForm<DetailsValues>({
    resolver: zodResolver(DetailsSchema),
    defaultValues: { referralCode: defaultReferralCode ?? "" },
  });

  const otpForm = useForm<OtpValues>({
    resolver: zodResolver(OtpSchema),
  });

  const onDetails = detailsForm.handleSubmit(async (values) => {
    const res = await apiPost<{ step?: string }>("/api/auth/register/client/start", {
      email: values.email,
      password: values.password,
      confirm: values.confirm,
      displayName: values.displayName,
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
      otherName: values.otherName || undefined,
      phone: values.phone || undefined,
      // Always sent, even when empty: an empty value tells the server the code
      // was cleared on purpose, so it must not fall back to the link's cookie.
      referralCode: values.referralCode?.trim() ?? "",
    });
    if (!report(res, () => onDetails())) return;
    setEmail(values.email.toLowerCase());
    setStep("otp");
    setOtpInfo("We've sent a 6-digit code to your email. It can take a minute to arrive.");
  });

  const onOtp = otpForm.handleSubmit(async (values) => {
    setOtpInfo(null);
    const res = await apiPost<{ redirect: string }>("/api/auth/register/client/complete", {
      email,
      code: values.code,
      // The server decides the destination; this is only a request.
      ...(next ? { next } : {}),
    });
    if (!report(res, () => onOtp())) return;
    if (res.data?.redirect) window.location.assign(res.data.redirect);
  });

  async function resend() {
    setOtpInfo(null);
    const res = await apiPost("/api/auth/register/client/resend-otp", { email });
    if (!report(res, () => resend())) return;
    setOtpInfo("We've sent a new code. If it doesn't arrive, check your spam folder.");
  }

  if (step === "otp") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">
          Step 2 of 2. Enter the verification code we sent to{" "}
          <span className="break-all font-bold text-foreground">{email}</span>.
        </p>
        <form onSubmit={onOtp} noValidate className="flex flex-col gap-4">
          <FormField label="Verification code" htmlFor="code" error={otpForm.formState.errors.code?.message}>
            <OtpInput
              id="code"
              autoFocus
              value={otpForm.watch("code") ?? ""}
              onChange={(v) =>
                otpForm.setValue("code", v, {
                  shouldValidate: otpForm.formState.isSubmitted,
                })
              }
              aria-invalid={Boolean(otpForm.formState.errors.code)}
            />
          </FormField>
          {/* Always in the page so the message is announced when it appears. */}
          <p role="status" className="min-h-5 text-sm font-medium text-muted-foreground">
            {otpInfo}
          </p>
          <Button type="submit" size="lg" disabled={otpForm.formState.isSubmitting}>
            {otpForm.formState.isSubmitting ? "Creating your account…" : "Create account"}
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] font-medium text-muted-foreground">
          <button type="button" className={TEXT_LINK} onClick={resend}>
            Send a new code
          </button>
          <button type="button" className={TEXT_LINK} onClick={() => setStep("details")}>
            Change my details
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onDetails} noValidate className="grid gap-4 sm:grid-cols-2">
      <FormField
        className="sm:col-span-2"
        label="Email"
        htmlFor="email"
        hint="We'll send a code here to confirm it's yours."
        error={detailsForm.formState.errors.email?.message}
      >
        <TextInput
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={detailsForm.formState.errors.email ? true : undefined}
          {...detailsForm.register("email")}
        />
      </FormField>
      <FormField
        className="sm:col-span-2"
        label="Display name"
        htmlFor="displayName"
        hint="What we should call you."
        error={detailsForm.formState.errors.displayName?.message}
      >
        <TextInput
          id="displayName"
          autoComplete="name"
          aria-invalid={detailsForm.formState.errors.displayName ? true : undefined}
          {...detailsForm.register("displayName")}
        />
      </FormField>
      <FormField
        label="First name (optional)"
        htmlFor="firstName"
        hint="Your first and last name are printed on certificates."
        error={detailsForm.formState.errors.firstName?.message}
      >
        <TextInput id="firstName" autoComplete="given-name" {...detailsForm.register("firstName")} />
      </FormField>
      <FormField label="Last name (optional)" htmlFor="lastName" error={detailsForm.formState.errors.lastName?.message}>
        <TextInput id="lastName" autoComplete="family-name" {...detailsForm.register("lastName")} />
      </FormField>
      <FormField label="Other name (optional)" htmlFor="otherName" error={detailsForm.formState.errors.otherName?.message}>
        <TextInput id="otherName" autoComplete="additional-name" {...detailsForm.register("otherName")} />
      </FormField>
      <FormField label="Phone (optional)" htmlFor="phone" error={detailsForm.formState.errors.phone?.message}>
        <TextInput id="phone" type="tel" inputMode="tel" autoComplete="tel" {...detailsForm.register("phone")} />
      </FormField>
      <FormField
        label="Password"
        htmlFor="password"
        hint="At least 12 characters, with a capital letter, a small letter, a number and a symbol."
        error={detailsForm.formState.errors.password?.message}
      >
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={detailsForm.formState.errors.password ? true : undefined}
          {...detailsForm.register("password")}
        />
      </FormField>
      <FormField label="Confirm password" htmlFor="confirm" error={detailsForm.formState.errors.confirm?.message}>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          aria-invalid={detailsForm.formState.errors.confirm ? true : undefined}
          {...detailsForm.register("confirm")}
        />
      </FormField>
      <FormField
        className="sm:col-span-2"
        label="Referral code (optional)"
        htmlFor="referralCode"
        hint={
          defaultReferralCode
            ? "Filled in from the link you followed. Leave it as it is, or clear it."
            : "If someone at the academy gave you a code, enter it here."
        }
        error={detailsForm.formState.errors.referralCode?.message}
      >
        <TextInput
          id="referralCode"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          className="max-w-xs font-mono uppercase tracking-wider"
          // Also as a plain attribute, so the code is in the page as it is
          // sent — visible before the form's script has loaded.
          defaultValue={defaultReferralCode ?? ""}
          {...detailsForm.register("referralCode")}
        />
      </FormField>
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" className="w-full" disabled={detailsForm.formState.isSubmitting}>
          {detailsForm.formState.isSubmitting ? "Sending your code…" : "Continue to email verification"}
        </Button>
      </div>
      <p className="text-center text-[13px] font-medium text-muted-foreground sm:col-span-2">
        Already have an account?{" "}
        <Link href={authHref("login", next)} className={TEXT_LINK}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
