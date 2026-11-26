"use client";

import { useState } from "react";
import { apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";

type ProfileTenant = {
  id: string;
  name: string;
  companyEmail: string | null;
  companyPhone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
};

export function TenantProfileForm({ tenant }: { tenant: ProfileTenant }) {
  const { toast } = useToast();
  const [name, setName] = useState(tenant.name);
  const [companyEmail, setCompanyEmail] = useState(tenant.companyEmail ?? "");
  const [companyPhone, setCompanyPhone] = useState(tenant.companyPhone ?? "");
  const [website, setWebsite] = useState(tenant.website ?? "");
  const [addressLine1, setAddressLine1] = useState(tenant.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(tenant.addressLine2 ?? "");
  const [city, setCity] = useState(tenant.city ?? "");
  const [region, setRegion] = useState(tenant.region ?? "");
  const [postalCode, setPostalCode] = useState(tenant.postalCode ?? "");
  const [country, setCountry] = useState(tenant.country ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await apiPatch(`/api/platform/tenants/${tenant.id}`, {
      name,
      companyEmail: companyEmail || null,
      companyPhone: companyPhone || null,
      website: website || null,
      addressLine1: addressLine1 || null,
      addressLine2: addressLine2 || null,
      city: city || null,
      region: region || null,
      postalCode: postalCode || null,
      country: country || null,
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Profile saved");
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <FormField label="Academy name" htmlFor="tenant-name">
        <TextInput
          id="tenant-name"
          name="name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </FormField>
      <FormField label="Email" htmlFor="tenant-email">
        <TextInput
          id="tenant-email"
          name="companyEmail"
          type="email"
          autoComplete="off"
          spellCheck={false}
          value={companyEmail}
          onChange={(e) => setCompanyEmail(e.target.value)}
        />
      </FormField>
      <FormField label="Phone" htmlFor="tenant-phone">
        <TextInput
          id="tenant-phone"
          name="companyPhone"
          type="tel"
          autoComplete="off"
          value={companyPhone}
          onChange={(e) => setCompanyPhone(e.target.value)}
        />
      </FormField>
      <FormField label="Website" htmlFor="tenant-website">
        <TextInput
          id="tenant-website"
          name="website"
          inputMode="url"
          autoComplete="off"
          placeholder="https://…"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </FormField>
      <FormField label="Address line 1" htmlFor="tenant-addr1">
        <TextInput
          id="tenant-addr1"
          name="addressLine1"
          autoComplete="off"
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
        />
      </FormField>
      <FormField label="Address line 2" htmlFor="tenant-addr2">
        <TextInput
          id="tenant-addr2"
          name="addressLine2"
          autoComplete="off"
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
        />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="City" htmlFor="tenant-city">
          <TextInput id="tenant-city" name="city" autoComplete="off" value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
        <FormField label="State or region" htmlFor="tenant-region">
          <TextInput id="tenant-region" name="region" autoComplete="off" value={region} onChange={(e) => setRegion(e.target.value)} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Postal code" htmlFor="tenant-postal">
          <TextInput
            id="tenant-postal"
            name="postalCode"
            autoComplete="off"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
          />
        </FormField>
        <FormField
          label="Country code"
          htmlFor="tenant-country"
          hint="Two letters, such as NG, GH or GB."
        >
          <TextInput
            id="tenant-country"
            name="country"
            autoComplete="off"
            spellCheck={false}
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
          />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
