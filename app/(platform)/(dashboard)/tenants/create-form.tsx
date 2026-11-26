"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import { getCountryOptions } from "@/lib/geo/countries";

const Schema = z.object({
  name: z.string().min(1, "Enter the academy's name.").max(200),
  slug: z
    .string()
    .min(3, "Use at least 3 characters.")
    .max(32)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only."),
  ownerEmail: z.email("Enter a valid email address."),
  ownerFirstName: z.string().min(1, "Enter the owner's first name.").max(100),
  ownerLastName: z.string().min(1, "Enter the owner's last name.").max(100),
  ownerOtherName: z.string().max(100).optional().or(z.literal("")),
  ownerPhone: z.string().max(40).optional().or(z.literal("")),
  companyEmail: z.email("Enter a valid email address.").optional().or(z.literal("")),
  companyPhone: z.string().max(40).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
  addressLine1: z.string().max(200).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  region: z.string().max(100).optional().or(z.literal("")),
  postalCode: z.string().max(40).optional().or(z.literal("")),
  country: z.string().max(2).optional().or(z.literal("")),
});
type Values = z.infer<typeof Schema>;

const COUNTRY_OPTIONS = getCountryOptions();

export function CreateTenantForm() {
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(Schema),
  });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const res = await apiPost<{ tenant: { id: string } }>("/api/platform/tenants", values);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.tenant.id) router.push(`/tenants/${res.data.tenant.id}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-heading text-base leading-tight">The academy</legend>
        <FormField label="Name" htmlFor="name" error={formState.errors.name?.message}>
          <TextInput id="name" autoComplete="organization" {...register("name")} />
        </FormField>
        <FormField
          label="Web address"
          htmlFor="slug"
          hint="The first part of the academy's address, as in acme.example.com. It cannot be changed later."
          error={formState.errors.slug?.message}
        >
          <TextInput
            id="slug"
            placeholder="acme"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            {...register("slug")}
          />
        </FormField>
        <FormField label="Email (optional)" htmlFor="cemail" error={formState.errors.companyEmail?.message}>
          <TextInput id="cemail" type="email" autoComplete="off" spellCheck={false} {...register("companyEmail")} />
        </FormField>
        <FormField label="Phone (optional)" htmlFor="cphone" error={formState.errors.companyPhone?.message}>
          <TextInput id="cphone" type="tel" autoComplete="off" {...register("companyPhone")} />
        </FormField>
        <FormField
          label="Website (optional)"
          htmlFor="web"
          error={formState.errors.website?.message}
          className="sm:col-span-2"
        >
          <TextInput id="web" type="url" inputMode="url" autoComplete="off" placeholder="https://…" {...register("website")} />
        </FormField>
        <FormField label="Address (optional)" htmlFor="a1" error={formState.errors.addressLine1?.message}>
          <TextInput id="a1" autoComplete="off" {...register("addressLine1")} />
        </FormField>
        <FormField label="City (optional)" htmlFor="city" error={formState.errors.city?.message}>
          <TextInput id="city" autoComplete="off" {...register("city")} />
        </FormField>
        <FormField label="State or region (optional)" htmlFor="reg" error={formState.errors.region?.message}>
          <TextInput id="reg" autoComplete="off" {...register("region")} />
        </FormField>
        <FormField label="Postal code (optional)" htmlFor="pc" error={formState.errors.postalCode?.message}>
          <TextInput id="pc" autoComplete="off" {...register("postalCode")} />
        </FormField>
        <FormField label="Country (optional)" htmlFor="ctry" error={formState.errors.country?.message}>
          <SelectInput id="ctry" options={COUNTRY_OPTIONS} {...register("country")} />
        </FormField>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-1 font-heading text-base leading-tight">The owner</legend>
        <p className="text-[13px] font-medium text-muted-foreground sm:col-span-2">
          This person gets full access to the academy and an email inviting them to sign in.
        </p>
        <FormField label="First name" htmlFor="of" error={formState.errors.ownerFirstName?.message}>
          <TextInput id="of" autoComplete="off" {...register("ownerFirstName")} />
        </FormField>
        <FormField label="Last name" htmlFor="ol" error={formState.errors.ownerLastName?.message}>
          <TextInput id="ol" autoComplete="off" {...register("ownerLastName")} />
        </FormField>
        <FormField label="Other name (optional)" htmlFor="oo" error={formState.errors.ownerOtherName?.message}>
          <TextInput id="oo" autoComplete="off" {...register("ownerOtherName")} />
        </FormField>
        <FormField label="Phone (optional)" htmlFor="op" error={formState.errors.ownerPhone?.message}>
          <TextInput id="op" type="tel" autoComplete="off" {...register("ownerPhone")} />
        </FormField>
        <FormField label="Email" htmlFor="oe" error={formState.errors.ownerEmail?.message} className="sm:col-span-2">
          <TextInput id="oe" type="email" autoComplete="off" spellCheck={false} {...register("ownerEmail")} />
        </FormField>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Creating…" : "Create academy"}
        </Button>
      </div>
    </form>
  );
}
