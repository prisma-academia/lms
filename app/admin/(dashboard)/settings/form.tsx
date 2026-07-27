"use client";

import { useState } from "react";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import type { SelectOption } from "@/lib/geo/options";
import { MODULE_KEYS, type ModuleKey, type TenantSettings } from "@/lib/tenant/settings";
import { ThemePicker } from "./theme-picker";
import type { ThemePresetId } from "@/lib/theme/presets";

type Initial = {
  name: string;
  settings: TenantSettings;
  logoUrl: string | null;
  faviconUrl?: string | null;
  icon32Url?: string | null;
  apple180Url?: string | null;
  og1200Url?: string | null;
};

export function SettingsForm({
  initial,
  storageEnabled,
  timezoneOptions,
  localeOptions,
  currencyOptions,
}: {
  initial: Initial;
  storageEnabled: boolean;
  timezoneOptions: SelectOption[];
  localeOptions: SelectOption[];
  currencyOptions: SelectOption[];
}) {
  const [name, setName] = useState(initial.name);
  const [primaryColor, setPrimaryColor] = useState(initial.settings.primaryColor);
  const [themePreset, setThemePreset] = useState<ThemePresetId>(
    initial.settings.themePreset
  );
  const [themePrimaryOverride, setThemePrimaryOverride] = useState(
    initial.settings.themePrimaryOverride
  );
  const [timezone, setTimezone] = useState(initial.settings.timezone);
  const [locale, setLocale] = useState(initial.settings.locale);
  const [currency, setCurrency] = useState(initial.settings.currency);
  const [metaTitle, setMetaTitle] = useState(initial.settings.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(
    initial.settings.metaDescription ?? ""
  );
  const [enabled, setEnabled] = useState<ModuleKey[]>(initial.settings.enabledModules);
  const [logoKey, setLogoKey] = useState<string | undefined>(initial.settings.logoKey);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(
    initial.faviconUrl ?? initial.icon32Url ?? null
  );
  const [icon32Url, setIcon32Url] = useState<string | null>(initial.icon32Url ?? null);
  const [apple180Url, setApple180Url] = useState<string | null>(initial.apple180Url ?? null);
  const [og1200Url, setOg1200Url] = useState<string | null>(initial.og1200Url ?? null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  function toggleModule(key: ModuleKey) {
    setEnabled((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function applyBrandingUrls(data: {
    logoKey?: string;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    icon32Url?: string | null;
    apple180Url?: string | null;
    og1200Url?: string | null;
  }) {
    if (data.logoKey) setLogoKey(data.logoKey);
    if (data.logoUrl !== undefined) setLogoUrl(data.logoUrl);
    if (data.faviconUrl !== undefined) setFaviconUrl(data.faviconUrl);
    if (data.icon32Url !== undefined) setIcon32Url(data.icon32Url);
    if (data.apple180Url !== undefined) setApple180Url(data.apple180Url);
    if (data.og1200Url !== undefined) setOg1200Url(data.og1200Url);
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setInfo(null);
    setUploading(true);
    try {
      const res = await apiPost<{ url: string; key: string; publicUrl: string }>(
        "/api/tenant/settings/logo",
        { contentType: file.type, contentLength: file.size }
      );
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Upload could not be started.");
        return;
      }
      const put = await fetch(res.data.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setError("Upload failed.");
        return;
      }
      const fin = await apiPost<{
        settings: {
          logoKey?: string;
          logoUrl?: string | null;
          faviconUrl?: string | null;
          icon32Url?: string | null;
          apple180Url?: string | null;
          og1200Url?: string | null;
        };
      }>("/api/tenant/settings/logo/finalize", { key: res.data.key });
      if (fin.error || !fin.data?.settings) {
        setError(fin.error?.message ?? "Logo validation failed.");
        return;
      }
      applyBrandingUrls(fin.data.settings);
      setInfo("Logo saved. Favicon and social images were generated.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function onFaviconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setInfo(null);
    setUploading(true);
    try {
      const res = await apiPost<{ url: string; key: string; publicUrl: string }>(
        "/api/tenant/settings/favicon",
        { contentType: file.type, contentLength: file.size }
      );
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Upload could not be started.");
        return;
      }
      const put = await fetch(res.data.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setError("Upload failed.");
        return;
      }
      const fin = await apiPost<{
        settings: {
          faviconUrl?: string | null;
          icon32Url?: string | null;
          apple180Url?: string | null;
        };
      }>("/api/tenant/settings/favicon", { key: res.data.key });
      if (fin.error || !fin.data?.settings) {
        setError(fin.error?.message ?? "Favicon validation failed.");
        return;
      }
      applyBrandingUrls(fin.data.settings);
      setInfo("Custom favicon saved.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function clearFavicon() {
    setError(null);
    setUploading(true);
    const res = await apiDelete<{
      settings: {
        faviconUrl?: string | null;
        icon32Url?: string | null;
        apple180Url?: string | null;
      };
    }>("/api/tenant/settings/favicon");
    setUploading(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.settings) applyBrandingUrls(res.data.settings);
    setInfo("Favicon override cleared — using generated icons.");
  }

  async function submit() {
    setError(null);
    setInfo(null);
    setPending(true);
    const res = await apiPatch("/api/tenant/settings", {
      name,
      settings: {
        primaryColor,
        themePreset,
        themePrimaryOverride,
        timezone,
        locale,
        currency,
        enabledModules: enabled,
        ...(logoKey ? { logoKey } : {}),
        ...(metaTitle.trim() ? { metaTitle: metaTitle.trim() } : { metaTitle: undefined }),
        ...(metaDescription.trim()
          ? { metaDescription: metaDescription.trim() }
          : { metaDescription: undefined }),
      },
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setInfo("Saved.");
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <FormField label="Tenant name" htmlFor="name">
        <TextInput id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>

      <FormField
        label="Theme"
        htmlFor="themePreset"
        hint="Applies to your admin console, learner portal, and public page. Each theme ships a light and a dark version; people choose which they prefer."
      >
        <div id="themePreset">
          <ThemePicker
            value={themePreset}
            onChange={setThemePreset}
            previewDark={false}
          />
        </div>
      </FormField>

      <FormField
        label="Brand color"
        htmlFor="themePrimaryOverride"
        hint="Off by default — the theme supplies its own accent. Turn this on only if you need to match an exact brand color; it replaces the theme's primary everywhere."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              id="themePrimaryOverride"
              type="checkbox"
              checked={themePrimaryOverride}
              onChange={(e) => setThemePrimaryOverride(e.target.checked)}
              className="size-4"
            />
            Override the theme accent
          </label>
          <input
            aria-label="Brand color"
            type="color"
            value={primaryColor}
            disabled={!themePrimaryOverride}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="h-9 w-16 rounded-[8px] border-2 border-border bg-card disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </FormField>

      <FormField label="Timezone" htmlFor="timezone">
        <SelectInput
          id="timezone"
          allowEmpty={false}
          options={timezoneOptions}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </FormField>

      <FormField label="Locale" htmlFor="locale">
        <SelectInput
          id="locale"
          allowEmpty={false}
          options={localeOptions}
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
        />
      </FormField>

      <FormField label="Default currency" htmlFor="currency">
        <SelectInput
          id="currency"
          allowEmpty={false}
          options={currencyOptions}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
      </FormField>

      <FormField
        label="Default SEO title"
        htmlFor="metaTitle"
        hint="Used on public pages when a page has no custom SEO title."
      >
        <TextInput
          id="metaTitle"
          value={metaTitle}
          onChange={(e) => setMetaTitle(e.target.value)}
          placeholder={name}
        />
      </FormField>

      <FormField label="Default SEO description" htmlFor="metaDescription">
        <TextInput
          id="metaDescription"
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
        />
      </FormField>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-stone-700">Enabled modules</span>
        <div className="flex flex-wrap gap-3">
          {MODULE_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 capitalize">
              <input
                type="checkbox"
                checked={enabled.includes(key)}
                onChange={() => toggleModule(key)}
              />
              {key}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-stone-700">Site logo</span>
        <p className="text-xs text-stone-500">
          PNG, JPEG, or WebP. Min 256×256, aspect between 1:3 and 3:1. Favicons
          and social preview images are generated automatically.
        </p>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Tenant logo" className="h-12 w-auto" />
        ) : null}
        {storageEnabled ? (
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={onLogoChange}
          />
        ) : (
          <span className="text-xs text-stone-500">
            Object storage is not configured.
          </span>
        )}
        {(icon32Url || apple180Url || og1200Url) && (
          <div className="mt-2 flex flex-wrap items-end gap-4">
            {icon32Url ? (
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={icon32Url} alt="" className="size-8" />
                <span className="text-[10px] text-stone-500">Favicon</span>
              </div>
            ) : null}
            {apple180Url ? (
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={apple180Url} alt="" className="size-12 rounded-lg" />
                <span className="text-[10px] text-stone-500">Apple</span>
              </div>
            ) : null}
            {og1200Url ? (
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={og1200Url} alt="" className="h-12 w-auto max-w-[120px] rounded border" />
                <span className="text-[10px] text-stone-500">OG</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <span className="text-stone-700">Custom favicon (optional)</span>
        <p className="text-xs text-stone-500">
          Roughly square PNG/JPEG/WebP, max 512 KB. Overrides generated favicons.
        </p>
        {faviconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={faviconUrl} alt="Favicon" className="size-8" />
        ) : null}
        {storageEnabled ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={onFaviconChange}
            />
            {initial.settings.faviconKey || faviconUrl ? (
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={clearFavicon}>
                Clear override
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {info ? <p className="text-sm text-green-700">{info}</p> : null}
      <div>
        <Button onClick={submit} disabled={pending || uploading}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
