export type TenantAddressFields = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

/** Short location line for hero, e.g. "Lagos, Nigeria". */
export function formatTenantLocation(
  city: string | null | undefined,
  country: string | null | undefined,
  locale = "en"
): string | null {
  const parts: string[] = [];
  if (city?.trim()) parts.push(city.trim());
  if (country?.trim()) {
    const code = country.trim().toUpperCase();
    const names = new Intl.DisplayNames([locale], { type: "region" });
    parts.push(names.of(code) ?? code);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Multi-line postal address from tenant company fields. */
export function formatTenantAddress(
  fields: TenantAddressFields,
  locale = "en"
): string[] {
  const lines: string[] = [];
  if (fields.addressLine1?.trim()) lines.push(fields.addressLine1.trim());
  if (fields.addressLine2?.trim()) lines.push(fields.addressLine2.trim());

  const locality: string[] = [];
  if (fields.city?.trim()) locality.push(fields.city.trim());
  if (fields.region?.trim()) locality.push(fields.region.trim());
  if (fields.postalCode?.trim()) locality.push(fields.postalCode.trim());
  if (locality.length > 0) lines.push(locality.join(", "));

  if (fields.country?.trim()) {
    const code = fields.country.trim().toUpperCase();
    const names = new Intl.DisplayNames([locale], { type: "region" });
    lines.push(names.of(code) ?? code);
  }

  return lines;
}

export function excerpt(text: string | null | undefined, maxLen = 120): string | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen).trimEnd()}…`;
}

export function formatCoursePrice(cents: number | null, currency: string): string {
  if (cents == null || cents === 0) return "Free";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}
