"use client";

import { useState } from "react";
import { apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";

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
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
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
    setInfo("Profile saved.");
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <FormField label="Academy name" htmlFor="tenant-name">
        <TextInput id="tenant-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </FormField>
      <FormField label="Company email" htmlFor="tenant-email">
        <TextInput
          id="tenant-email"
          type="email"
          value={companyEmail}
          onChange={(e) => setCompanyEmail(e.target.value)}
        />
      </FormField>
      <FormField label="Company phone" htmlFor="tenant-phone">
        <TextInput id="tenant-phone" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
      </FormField>
      <FormField label="Website" htmlFor="tenant-website">
        <TextInput id="tenant-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </FormField>
      <FormField label="Address line 1" htmlFor="tenant-addr1">
        <TextInput id="tenant-addr1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
      </FormField>
      <FormField label="Address line 2" htmlFor="tenant-addr2">
        <TextInput id="tenant-addr2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="City" htmlFor="tenant-city">
          <TextInput id="tenant-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
        <FormField label="Region" htmlFor="tenant-region">
          <TextInput id="tenant-region" value={region} onChange={(e) => setRegion(e.target.value)} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Postal code" htmlFor="tenant-postal">
          <TextInput id="tenant-postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </FormField>
        <FormField label="Country (ISO)" htmlFor="tenant-country">
          <TextInput
            id="tenant-country"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
          />
        </FormField>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {info ? <p className="text-sm text-green-700">{info}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
