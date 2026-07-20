"use client";

import { useState } from "react";
import { apiPatch, apiPost } from "@/lib/client/api";
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
  const [enabled, setEnabled] = useState<ModuleKey[]>(initial.settings.enabledModules);
  const [logoKey, setLogoKey] = useState<string | undefined>(initial.settings.logoKey);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  function toggleModule(key: ModuleKey) {
    setEnabled((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const res = await apiPost<{ url: string; key: string; publicUrl: string }>(
        "/api/tenant/settings/logo",
        { contentType: file.type }
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
      setLogoKey(res.data.key);
      setLogoUrl(res.data.publicUrl);
      setInfo("Logo uploaded. Remember to Save.");
    } finally {
      setUploading(false);
    }
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
        <span className="text-stone-700">Logo</span>
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
