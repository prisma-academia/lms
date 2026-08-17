"use client";

import { useState } from "react";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import {
  FAVICON_RULES,
  LOGO_RULES,
  precheckImage,
  putFileToStorage,
} from "@/lib/client/image-upload";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import { PreviewFrame } from "@/components/preview-frame";
import type { SelectOption } from "@/lib/geo/options";
import { MODULE_KEYS, type ModuleKey, type TenantSettings } from "@/lib/tenant/settings";
import { ThemePicker } from "./theme-picker";
import type { ThemePresetId } from "@/lib/theme/presets";

/**
 * Which section a message belongs to. Feedback is rendered next to the control
 * that produced it — a single shared line at the bottom of a long form both
 * scrolls out of view and gets silently overwritten by the next action.
 */
type Scope = "logo" | "favicon" | "form";
type Message = { scope: Scope; message: string };

/** Renders whichever of `error` / `info` belongs to this section. */
function Feedback({
  scope,
  error,
  info,
}: {
  scope: Scope;
  error: Message | null;
  info: Message | null;
}) {
  if (error?.scope === scope) {
    return (
      <p role="alert" className="text-sm font-medium text-red-600">
        {error.message}
      </p>
    );
  }
  if (info?.scope === scope) {
    return (
      <p role="status" className="text-sm font-medium text-green-700">
        {info.message}
      </p>
    );
  }
  return null;
}

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

  const [error, setError] = useState<Message | null>(null);
  const [info, setInfo] = useState<Message | null>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<Scope | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandVersion, setBrandVersion] = useState(0);

  function clearFeedback() {
    setError(null);
    setInfo(null);
  }

  function fail(scope: Scope, message: string) {
    setInfo(null);
    setError({ scope, message });
  }

  function succeed(scope: Scope, message: string) {
    setError(null);
    setInfo({ scope, message });
  }

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
    clearFeedback();
    setUploading("logo");
    try {
      // Catch the obvious problems here so the user is not made to wait for a
      // round trip (and an upload) to be told the file is the wrong shape.
      const invalid = await precheckImage(file, LOGO_RULES);
      if (invalid) {
        fail("logo", invalid);
        return;
      }

      const res = await apiPost<{ url: string; key: string; publicUrl: string }>(
        "/api/tenant/settings/logo",
        { contentType: file.type, contentLength: file.size }
      );
      if (res.error || !res.data) {
        fail(
          "logo",
          res.error?.message ??
            "The server did not return an upload link. Reload the page and try again."
        );
        return;
      }

      const put = await putFileToStorage({
        url: res.data.url,
        file,
        contentType: file.type,
      });
      if (!put.ok) {
        fail("logo", put.message);
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
        fail(
          "logo",
          fin.error?.message ??
            "The logo uploaded but could not be processed. Try a different image."
        );
        return;
      }

      applyBrandingUrls(fin.data.settings);
      succeed(
        "logo",
        "Logo saved. The favicon and social preview images were regenerated from it."
      );
    } catch (err) {
      console.error("[settings] logo upload failed", err);
      fail(
        "logo",
        "The logo upload stopped unexpectedly. Check your connection and try again."
      );
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  }

  async function onFaviconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    clearFeedback();
    setUploading("favicon");
    try {
      const invalid = await precheckImage(file, FAVICON_RULES);
      if (invalid) {
        fail("favicon", invalid);
        return;
      }

      const res = await apiPost<{ url: string; key: string; publicUrl: string }>(
        "/api/tenant/settings/favicon",
        { contentType: file.type, contentLength: file.size }
      );
      if (res.error || !res.data) {
        fail(
          "favicon",
          res.error?.message ??
            "The server did not return an upload link. Reload the page and try again."
        );
        return;
      }

      const put = await putFileToStorage({
        url: res.data.url,
        file,
        contentType: file.type,
      });
      if (!put.ok) {
        fail("favicon", put.message);
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
        fail(
          "favicon",
          fin.error?.message ??
            "The favicon uploaded but could not be processed. Try a different image."
        );
        return;
      }

      applyBrandingUrls(fin.data.settings);
      succeed("favicon", "Custom favicon saved.");
    } catch (err) {
      console.error("[settings] favicon upload failed", err);
      fail(
        "favicon",
        "The favicon upload stopped unexpectedly. Check your connection and try again."
      );
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  }

  async function clearFavicon() {
    clearFeedback();
    setUploading("favicon");
    const res = await apiDelete<{
      settings: {
        faviconUrl?: string | null;
        icon32Url?: string | null;
        apple180Url?: string | null;
      };
    }>("/api/tenant/settings/favicon");
    setUploading(null);
    if (res.error) {
      fail("favicon", res.error.message);
      return;
    }
    if (res.data?.settings) applyBrandingUrls(res.data.settings);
    succeed("favicon", "Favicon override cleared — using generated icons.");
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
      fail("form", res.error.message);
      return;
    }
    succeed("form", "Saved.");
    // The preview renders the SAVED theme server-side, so it is only truthful
    // after a save. Refreshing it here is what keeps it from quietly showing the
    // previous colour once the admin has changed one.
    setBrandVersion((v) => v + 1);
  }

  const busy = uploading !== null;

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
          Shown across your admin console, learner portal, sign-in screens, and
          public pages. PNG, JPEG, or WebP up to 2 MB. Min 256×256, aspect
          between 1:3 and 3:1. Favicons and social preview images are generated
          automatically.
        </p>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Tenant logo" className="h-12 w-auto" />
        ) : null}
        {storageEnabled ? (
          <>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={onLogoChange}
            />
            {uploading === "logo" ? (
              <p role="status" className="text-xs text-stone-500">
                Uploading and generating icons…
              </p>
            ) : null}
            <Feedback scope="logo" error={error} info={info} />
          </>
        ) : (
          <span className="text-xs text-stone-500">
            Object storage is not configured, so logo uploads are disabled. Ask
            your platform administrator to configure the S3 settings.
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
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={onFaviconChange}
              />
              {initial.settings.faviconKey || faviconUrl ? (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={clearFavicon}>
                  Clear override
                </Button>
              ) : null}
            </div>
            {uploading === "favicon" ? (
              <p role="status" className="text-xs text-stone-500">
                Uploading…
              </p>
            ) : null}
            <Feedback scope="favicon" error={error} info={info} />
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] border-2 border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-sm text-stone-700">Brand preview</span>
            <p className="text-xs text-stone-500">
              Your logo, theme and colours on the components the platform is built
              from. Reflects the last save.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setBrandOpen((o) => !o)}
            aria-expanded={brandOpen}
          >
            {brandOpen ? "Hide preview" : "Show preview"}
          </Button>
        </div>
        {brandOpen ? (
          <PreviewFrame
            src="/admin/preview/brand"
            title="Brand preview"
            refreshToken={brandVersion}
            height={560}
          />
        ) : null}
      </div>

      <Feedback scope="form" error={error} info={info} />
      <div>
        <Button onClick={submit} disabled={pending || busy}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
