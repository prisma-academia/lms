"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { apiPatch, apiPost, type ApiResponse } from "@/lib/client/api";
import { LOGO_RULES, precheckImage, putFileToStorage } from "@/lib/client/image-upload";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { TenantMark } from "@/components/tenant-mark";
import {
  SettlementBankFields,
  type VerificationState,
} from "@/components/billing/settlement-bank-fields";
import { ThemePicker } from "@/app/admin/(dashboard)/settings/theme-picker";
import { getThemePreset, type ThemePresetId } from "@/lib/theme/presets";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@/lib/tenant/onboarding";
import type { SelectOption } from "@/lib/geo/options";
import { cn } from "@/lib/utils";

type Props = {
  initial: {
    me: { email: string; firstName: string; lastName: string; phone: string };
    academy: {
      slug: string;
      name: string;
      tagline: string;
      companyEmail: string;
      companyPhone: string;
      website: string;
      addressLine1: string;
      city: string;
      region: string;
      country: string;
    };
    region: { timezone: string; locale: string; currency: string };
    brand: {
      primaryColor: string;
      themePreset: ThemePresetId;
      themePrimaryOverride: boolean;
      logoUrl: string | null;
    };
    completedSteps: string[];
    courseCount: number;
    subaccount: {
      businessName: string;
      settlementBankCode: string;
      settlementAccountNumber: string;
    } | null;
  };
  options: {
    timezones: SelectOption[];
    locales: SelectOption[];
    currencies: SelectOption[];
    countries: SelectOption[];
  };
  storageEnabled: boolean;
  canWriteBilling: boolean;
  canWriteCourses: boolean;
};

type Errors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\d][\d\s().-]{5,38}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Brand colours that hold up as a button background with readable text. */
const COLOUR_PRESETS: { value: string; label: string }[] = [
  { value: "#2563eb", label: "Blue" },
  { value: "#0f766e", label: "Teal" },
  { value: "#15803d", label: "Green" },
  { value: "#b45309", label: "Amber" },
  { value: "#b91c1c", label: "Red" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#be185d", label: "Pink" },
  { value: "#0f172a", label: "Ink" },
];

/** Black or white, whichever reads better on `hex`. */
function readableOn(hex: string): string {
  if (!HEX.test(hex)) return "#ffffff";
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#111111" : "#ffffff";
}

/** "example.com" → "https://example.com"; blank stays blank. */
function normaliseWebsite(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function websiteLooksValid(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** The browser's own time zone, or null where it cannot be read. */
function readBrowserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** The browser's zone does not change while the page is open. */
function subscribeToNothing(): () => void {
  return () => {};
}

function labelOf(options: SelectOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** The message to show for a failed request: the server's own words. */
function messageOf(res: ApiResponse<unknown>, fallback: string): string {
  return res.error?.message?.trim() || fallback;
}

export function OnboardingWizard({
  initial,
  options,
  storageEnabled,
  canWriteBilling,
  canWriteCourses,
}: Props) {
  const steps = useMemo(
    () =>
      ONBOARDING_STEPS.filter((s) => {
        if (s.key === "course") return canWriteCourses;
        if (s.key === "payout") return canWriteBilling;
        return true;
      }),
    [canWriteBilling, canWriteCourses]
  );

  const [done, setDone] = useState<string[]>(() =>
    initial.completedSteps.filter((k) => ONBOARDING_STEPS.some((s) => s.key === k))
  );
  // Resume at the first step not yet dealt with.
  const [step, setStep] = useState<OnboardingStepKey>(() => {
    const dealtWith = new Set(initial.completedSteps);
    return (steps.find((s) => s.key !== "review" && !dealtWith.has(s.key)) ?? steps[steps.length - 1]).key;
  });
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Set when a step was opened from the review's Edit button: saving it goes
  // back to the review instead of walking the remaining steps again.
  const [fromReview, setFromReview] = useState(false);

  // Your details
  const [firstName, setFirstName] = useState(initial.me.firstName);
  const [lastName, setLastName] = useState(initial.me.lastName);
  const [phone, setPhone] = useState(initial.me.phone);

  // Academy details
  const [name, setName] = useState(initial.academy.name);
  const [tagline, setTagline] = useState(initial.academy.tagline);
  const [companyEmail, setCompanyEmail] = useState(initial.academy.companyEmail || initial.me.email);
  const [companyPhone, setCompanyPhone] = useState(initial.academy.companyPhone);
  const [website, setWebsite] = useState(initial.academy.website);
  const [addressLine1, setAddressLine1] = useState(initial.academy.addressLine1);
  const [city, setCity] = useState(initial.academy.city);
  const [region, setRegion] = useState(initial.academy.region);
  const [country, setCountry] = useState(initial.academy.country);

  // Region
  // A brand-new academy carries the schema's "UTC". Until the person chooses,
  // offer the zone this browser is in instead — but only before the step has
  // been answered, so a deliberate "UTC" is never overwritten. Read through
  // `useSyncExternalStore` so the server render and the first client render
  // agree (both see no browser zone) and the suggestion arrives after.
  const browserZone = useSyncExternalStore(subscribeToNothing, readBrowserZone, () => null);
  const [timezoneChoice, setTimezone] = useState<string | null>(null);
  const suggestZone =
    !initial.completedSteps.includes("region") &&
    initial.region.timezone === "UTC" &&
    browserZone !== null &&
    options.timezones.some((o) => o.value === browserZone);
  const timezone = timezoneChoice ?? (suggestZone && browserZone ? browserZone : initial.region.timezone);
  const [locale, setLocale] = useState(initial.region.locale);
  const [currency, setCurrency] = useState(initial.region.currency);

  // Look and feel
  const [themePreset, setThemePreset] = useState<ThemePresetId>(initial.brand.themePreset);
  const [ownColour, setOwnColour] = useState(initial.brand.themePrimaryOverride);
  const [primaryColor, setPrimaryColor] = useState(initial.brand.primaryColor);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.brand.logoUrl);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoInfo, setLogoInfo] = useState<string | null>(null);

  // First course
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCreated, setCourseCreated] = useState<string | null>(null);

  // Getting paid
  const [businessName, setBusinessName] = useState(initial.subaccount?.businessName ?? initial.academy.name);
  const [bankCode, setBankCode] = useState(initial.subaccount?.settlementBankCode ?? "");
  const [accountNumber, setAccountNumber] = useState(initial.subaccount?.settlementAccountNumber ?? "");
  const [verification, setVerification] = useState<VerificationState>({ verified: false, accountName: null });
  const [payoutSaved, setPayoutSaved] = useState(Boolean(initial.subaccount));

  // Move focus to the step's heading when the step changes, so keyboard and
  // screen-reader users start at the top of the new step rather than at the
  // button they just pressed (which may no longer exist).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  const index = steps.findIndex((s) => s.key === step);
  const current = steps[index];
  const isLast = index === steps.length - 1;

  function goTo(key: OnboardingStepKey) {
    setErrors({});
    setFormError(null);
    setStep(key);
  }

  function withStep(key: OnboardingStepKey): string[] {
    return done.includes(key) ? done : [...done, key];
  }

  function advance(key: OnboardingStepKey, completed: string[]) {
    setDone(completed);
    if (fromReview) {
      setFromReview(false);
      goTo("review");
      return;
    }
    const at = steps.findIndex((s) => s.key === key);
    goTo(steps[Math.min(at + 1, steps.length - 1)].key);
  }

  function editFromReview(key: OnboardingStepKey) {
    setFromReview(true);
    goTo(key);
  }

  /** Records that a step has been dealt with. Returns whether it was saved. */
  async function saveProgress(completed: string[]): Promise<boolean> {
    const res = await apiPatch("/api/tenant/settings", {
      settings: { onboarding: { completedSteps: completed } },
    });
    if (res.error) {
      setFormError(messageOf(res, "Your progress could not be saved. Try again."));
      return false;
    }
    return true;
  }

  async function submitYou() {
    const next: Errors = {};
    if (!firstName.trim()) next.firstName = "Enter your first name.";
    if (!lastName.trim()) next.lastName = "Enter your last name.";
    if (!phone.trim()) next.phone = "Enter a phone number people at the platform can reach you on.";
    else if (!PHONE.test(phone.trim())) next.phone = "Enter a phone number, for example +234 801 234 5678.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const res = await apiPatch("/api/tenant/account", {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
    });
    if (res.error) {
      setFormError(messageOf(res, "Your details could not be saved. Try again."));
      return;
    }
    const completed = withStep("you");
    if (await saveProgress(completed)) advance("you", completed);
  }

  async function submitAcademy() {
    const site = normaliseWebsite(website);
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter the academy's name.";
    if (!companyEmail.trim()) next.companyEmail = "Enter an email address learners can contact.";
    else if (!EMAIL.test(companyEmail.trim())) next.companyEmail = "Enter a full email address, for example hello@academy.com.";
    if (companyPhone.trim() && !PHONE.test(companyPhone.trim())) next.companyPhone = "Enter a phone number, for example +234 801 234 5678.";
    if (site && !websiteLooksValid(site)) next.website = "Enter a web address, for example academy.com.";
    if (!country) next.country = "Choose the country the academy is based in.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const completed = withStep("academy");
    const res = await apiPatch("/api/tenant/settings", {
      name: name.trim(),
      companyEmail: companyEmail.trim(),
      companyPhone: companyPhone.trim() || null,
      website: site || null,
      addressLine1: addressLine1.trim() || null,
      city: city.trim() || null,
      region: region.trim() || null,
      country,
      settings: {
        tagline: tagline.trim() || null,
        onboarding: { completedSteps: completed },
      },
    });
    if (res.error) {
      setFormError(messageOf(res, "The academy details could not be saved. Try again."));
      return;
    }
    setWebsite(site);
    advance("academy", completed);
  }

  async function submitRegion() {
    const next: Errors = {};
    if (!timezone) next.timezone = "Choose a time zone.";
    if (!locale) next.locale = "Choose a language.";
    if (!currency) next.currency = "Choose a currency.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const completed = withStep("region");
    const res = await apiPatch("/api/tenant/settings", {
      settings: { timezone, locale, currency, onboarding: { completedSteps: completed } },
    });
    if (res.error) {
      setFormError(messageOf(res, "The region settings could not be saved. Try again."));
      return;
    }
    advance("region", completed);
  }

  async function submitBrand() {
    if (ownColour && !HEX.test(primaryColor)) {
      setErrors({ primaryColor: "Enter a colour as six hex digits, for example #2563eb." });
      return;
    }
    setErrors({});
    const completed = withStep("brand");
    const res = await apiPatch("/api/tenant/settings", {
      settings: {
        themePreset,
        themePrimaryOverride: ownColour,
        ...(ownColour ? { primaryColor } : {}),
        onboarding: { completedSteps: completed },
      },
    });
    if (res.error) {
      setFormError(messageOf(res, "The look and feel could not be saved. Try again."));
      return;
    }
    advance("brand", completed);
  }

  async function submitCourse(skip: boolean) {
    setErrors({});
    const title = courseTitle.trim();
    if (!skip) {
      if (!title) {
        setErrors({ courseTitle: "Enter a title, or choose “Do this later”." });
        return;
      }
      const slug = slugify(title);
      if (!slug) {
        setErrors({ courseTitle: "Use at least one letter or number in the title." });
        return;
      }
      const res = await apiPost("/api/tenant/courses", { title, slug });
      if (res.error) {
        setErrors({ courseTitle: messageOf(res, "The course could not be created. Try a different title.") });
        return;
      }
      setCourseCreated(title);
      setCourseTitle("");
    }
    const completed = withStep("course");
    if (await saveProgress(completed)) advance("course", completed);
  }

  async function submitPayout(skip: boolean) {
    setErrors({});
    if (!skip) {
      const next: Errors = {};
      if (!businessName.trim()) next.businessName = "Enter the name the account is held in.";
      if (!bankCode.trim() || accountNumber.replace(/\D/g, "").length !== 10) {
        next.bank = "Choose a bank and enter the 10-digit account number, or choose “Do this later”.";
      } else if (!verification.verified) {
        next.bank = "Check the account first: the name it is held in has to be confirmed.";
      }
      setErrors(next);
      if (Object.keys(next).length > 0) return;

      const res = await apiPost("/api/tenant/billing/subaccount", {
        businessName: businessName.trim(),
        settlementBankCode: bankCode,
        settlementAccountNumber: accountNumber.replace(/\D/g, ""),
        businessEmail: companyEmail.trim() || undefined,
      });
      if (res.error) {
        setFormError(messageOf(res, "The bank account could not be saved. You can add it later from Billing."));
        return;
      }
      setPayoutSaved(true);
    }
    const completed = withStep("payout");
    if (await saveProgress(completed)) advance("payout", completed);
  }

  async function finish() {
    const completed = [...new Set([...done, "review"])];
    const res = await apiPatch("/api/tenant/settings", {
      settings: { onboarding: { completedAt: new Date().toISOString(), completedSteps: completed } },
    });
    if (res.error) {
      setFormError(messageOf(res, "Set-up could not be finished. Check the steps above and try again."));
      return;
    }
    // A full navigation, not a client transition: the dashboard shell reads the
    // academy's name, logo and theme on the server, and all three may be new.
    window.location.assign("/admin/dashboard");
  }

  async function run(action: () => Promise<void>) {
    if (pending) return;
    setFormError(null);
    setPending(true);
    try {
      await action();
    } catch (err) {
      console.error("[onboarding]", err);
      setFormError("The request did not complete. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function onContinue() {
    if (step === "you") return run(submitYou);
    if (step === "academy") return run(submitAcademy);
    if (step === "region") return run(submitRegion);
    if (step === "brand") return run(submitBrand);
    if (step === "course") return run(() => submitCourse(false));
    if (step === "payout") return run(() => submitPayout(false));
    return run(finish);
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setLogoError(null);
    setLogoInfo(null);
    setLogoBusy(true);
    try {
      const invalid = await precheckImage(file, LOGO_RULES);
      if (invalid) {
        setLogoError(invalid);
        return;
      }
      const presign = await apiPost<{ url: string; key: string }>("/api/tenant/settings/logo", {
        contentType: file.type,
        contentLength: file.size,
      });
      if (presign.error || !presign.data) {
        setLogoError(messageOf(presign, "The server did not return an upload link. Reload the page and try again."));
        return;
      }
      const put = await putFileToStorage({ url: presign.data.url, file, contentType: file.type });
      if (!put.ok) {
        setLogoError(put.message);
        return;
      }
      const fin = await apiPost<{ settings: { logoUrl?: string | null } }>(
        "/api/tenant/settings/logo/finalize",
        { key: presign.data.key }
      );
      if (fin.error || !fin.data?.settings) {
        setLogoError(messageOf(fin, "The logo uploaded but could not be processed. Try a different image."));
        return;
      }
      if (fin.data.settings.logoUrl) setLogoUrl(fin.data.settings.logoUrl);
      setLogoInfo("Logo saved. Your browser-tab icon was made from it.");
    } catch (err) {
      console.error("[onboarding] logo upload failed", err);
      setLogoError("The logo upload stopped unexpectedly. Check your connection and try again.");
    } finally {
      setLogoBusy(false);
      input.value = "";
    }
  }

  const preset = getThemePreset(themePreset);
  const accent = ownColour && HEX.test(primaryColor) ? primaryColor : preset.swatch.light[1];
  const percent = Math.round(((index + (step === "review" ? 1 : 0)) / steps.length) * 100);

  return (
    <div className="flex flex-col gap-5">
      <Stepper
        steps={steps}
        current={step}
        done={done}
        onSelect={(key) => {
          setFromReview(false);
          goTo(key);
        }}
        percent={percent}
        disabled={pending}
      />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onContinue();
        }}
        className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md sm:p-6"
      >
        <div className="mb-5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
            Step {index + 1} of {steps.length}
            {current.optional ? " · Optional" : ""}
          </p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-heading text-xl leading-tight outline-none">
            {current.label}
          </h2>
        </div>

        {step === "you" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="text-sm font-medium text-muted-foreground sm:col-span-2">
              You are the owner of this academy. This is how your name appears to your team and to learners
              you message. You sign in as <strong className="text-foreground">{initial.me.email}</strong>.
            </p>
            <FormField label="First name" htmlFor="ob-first" required error={errors.firstName}>
              <TextInput id="ob-first" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={100} />
            </FormField>
            <FormField label="Last name" htmlFor="ob-last" required error={errors.lastName}>
              <TextInput id="ob-last" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={100} />
            </FormField>
            <FormField
              label="Phone"
              htmlFor="ob-phone"
              required
              error={errors.phone}
              hint="Used if we need to reach you about the academy. Not shown to learners."
              className="sm:col-span-2"
            >
              <TextInput id="ob-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
            </FormField>
          </div>
        )}

        {step === "academy" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Academy name" htmlFor="ob-name" required error={errors.name} className="sm:col-span-2">
              <TextInput id="ob-name" autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </FormField>
            <FormField
              label="Tagline"
              htmlFor="ob-tagline"
              hint="One line saying what you teach, for example “Practical design courses for working professionals”."
              className="sm:col-span-2"
            >
              <TextInput id="ob-tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={160} />
            </FormField>
            <FormField
              label="Contact email"
              htmlFor="ob-email"
              required
              error={errors.companyEmail}
              hint="Shown to learners, and used as the reply address on your emails."
            >
              <TextInput id="ob-email" type="email" inputMode="email" autoComplete="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
            </FormField>
            <FormField label="Contact phone" htmlFor="ob-cphone" error={errors.companyPhone}>
              <TextInput id="ob-cphone" type="tel" inputMode="tel" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} maxLength={40} />
            </FormField>
            <FormField label="Website" htmlFor="ob-web" error={errors.website} hint="If you already have one." className="sm:col-span-2">
              <TextInput id="ob-web" type="url" inputMode="url" placeholder="academy.com" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} />
            </FormField>
            <FormField label="Address" htmlFor="ob-addr" className="sm:col-span-2">
              <TextInput id="ob-addr" autoComplete="address-line1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} maxLength={200} />
            </FormField>
            <FormField label="City" htmlFor="ob-city">
              <TextInput id="ob-city" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} />
            </FormField>
            <FormField label="State or region" htmlFor="ob-region">
              <TextInput id="ob-region" autoComplete="address-level1" value={region} onChange={(e) => setRegion(e.target.value)} maxLength={100} />
            </FormField>
            <FormField label="Country" htmlFor="ob-country" required error={errors.country} className="sm:col-span-2">
              <SelectInput
                id="ob-country"
                autoComplete="country"
                options={options.countries}
                placeholder="Choose a country…"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </FormField>
          </div>
        )}

        {step === "region" && (
          <div className="grid gap-4">
            <p className="text-sm font-medium text-muted-foreground">
              These decide how dates, times and prices are shown across your academy. You can change them
              later in Settings.
            </p>
            <FormField
              label="Time zone"
              htmlFor="ob-tz"
              required
              error={errors.timezone}
              hint="Deadlines, live sessions and reports use this time zone."
            >
              <SelectInput id="ob-tz" options={options.timezones} allowEmpty={false} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </FormField>
            <FormField label="Language" htmlFor="ob-locale" required error={errors.locale}>
              <SelectInput id="ob-locale" options={options.locales} allowEmpty={false} value={locale} onChange={(e) => setLocale(e.target.value)} />
            </FormField>
            <FormField
              label="Currency"
              htmlFor="ob-currency"
              required
              error={errors.currency}
              hint="The currency your course prices are set in."
            >
              <SelectInput id="ob-currency" options={options.currencies} allowEmpty={false} value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </FormField>
          </div>
        )}

        {step === "brand" && (
          <div className="grid gap-6">
            <section aria-labelledby="ob-logo-h" className="grid gap-3">
              <h3 id="ob-logo-h" className="text-[13px] font-bold text-foreground">
                Logo <span className="font-medium text-muted-foreground">(optional)</span>
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                <TenantMark logoUrl={logoUrl} name={name} accent={accent} className="size-16 text-2xl" alt={logoUrl ? `${name} logo` : ""} />
                {storageEnabled ? (
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="ob-logo"
                      className={cn(
                        "inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-[10px] border-2 border-border bg-card px-4 text-sm font-bold text-card-foreground shadow-sm focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-ring",
                        logoBusy && "pointer-events-none opacity-60"
                      )}
                    >
                      <Icon name="upload" className="size-4" />
                      {logoBusy ? "Uploading…" : logoUrl ? "Replace logo" : "Upload a logo"}
                      <input
                        id="ob-logo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        disabled={logoBusy}
                        onChange={onLogoChange}
                      />
                    </label>
                    <p className="text-xs font-medium text-muted-foreground">
                      PNG, JPEG or WebP, at least 256px on its shorter side, up to 2 MB.
                    </p>
                  </div>
                ) : (
                  <p className="max-w-prose text-sm font-medium text-muted-foreground">
                    File storage is not switched on for this platform yet, so a logo cannot be uploaded right
                    now. Carry on — your academy shows its initial until you add one from Settings.
                  </p>
                )}
              </div>
              {logoError ? (
                <p role="alert" className="text-sm font-bold text-destructive">
                  {logoError}
                </p>
              ) : logoInfo ? (
                <p role="status" className="text-sm font-bold text-foreground">
                  {logoInfo}
                </p>
              ) : null}
            </section>

            <section aria-labelledby="ob-theme-h" className="grid gap-3">
              <h3 id="ob-theme-h" className="text-[13px] font-bold text-foreground">
                Theme
              </h3>
              <p className="text-xs font-medium text-muted-foreground">
                The overall look of your admin area, learner app and public site.
              </p>
              <ThemePicker value={themePreset} onChange={setThemePreset} previewDark={false} />
            </section>

            <section aria-labelledby="ob-colour-h" className="grid gap-3">
              <h3 id="ob-colour-h" className="text-[13px] font-bold text-foreground">
                Brand colour
              </h3>
              <div role="radiogroup" aria-labelledby="ob-colour-h" className="flex flex-wrap gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!ownColour}
                  onClick={() => setOwnColour(false)}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-[10px] border-2 px-3 text-[13px] font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
                    !ownColour ? "border-foreground bg-accent shadow-sm" : "border-border bg-card"
                  )}
                >
                  <span aria-hidden className="size-5 rounded-full border-2 border-border" style={{ background: preset.swatch.light[1] }} />
                  Theme’s own
                  {!ownColour ? <span aria-hidden>✓</span> : null}
                </button>
                {COLOUR_PRESETS.map((c) => {
                  const active = ownColour && primaryColor.toLowerCase() === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setOwnColour(true);
                        setPrimaryColor(c.value);
                      }}
                      className={cn(
                        "inline-flex min-h-10 items-center gap-2 rounded-[10px] border-2 px-3 text-[13px] font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
                        active ? "border-foreground bg-accent shadow-sm" : "border-border bg-card"
                      )}
                    >
                      <span aria-hidden className="size-5 rounded-full border-2 border-border" style={{ background: c.value }} />
                      {c.label}
                      {active ? <span aria-hidden>✓</span> : null}
                    </button>
                  );
                })}
              </div>
              <FormField
                label="Or your own colour"
                htmlFor="ob-colour"
                error={errors.primaryColor}
                hint="Pick with the swatch or type a hex code such as #2563eb."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick a brand colour"
                    value={HEX.test(primaryColor) ? primaryColor : "#2563eb"}
                    onChange={(e) => {
                      setOwnColour(true);
                      setPrimaryColor(e.target.value);
                    }}
                    className="h-11 w-14 shrink-0 cursor-pointer rounded-[10px] border-2 border-border bg-card p-1"
                  />
                  <TextInput
                    id="ob-colour"
                    value={primaryColor}
                    onChange={(e) => {
                      setOwnColour(true);
                      setPrimaryColor(e.target.value.trim());
                    }}
                    maxLength={7}
                    spellCheck={false}
                    className="max-w-40 font-mono"
                  />
                </div>
              </FormField>
            </section>

            <section aria-labelledby="ob-preview-h" className="grid gap-2">
              <h3 id="ob-preview-h" className="text-[13px] font-bold text-foreground">
                Preview
              </h3>
              <div className="overflow-hidden rounded-[12px] border-2 border-border" style={{ background: preset.swatch.light[0] }}>
                <div className="flex items-center justify-between gap-3 border-b-2 border-border bg-white px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TenantMark logoUrl={logoUrl} name={name} accent={accent} className="size-8 text-sm" />
                    <span className="truncate font-heading text-[14px] leading-tight text-black">{name || "Your academy"}</span>
                  </div>
                  <span
                    className="shrink-0 rounded-[8px] border-2 border-black px-2.5 py-1 text-[12px] font-bold"
                    style={{ background: accent, color: readableOn(accent) }}
                  >
                    Sign in
                  </span>
                </div>
                <div className="grid gap-2 p-4">
                  <span className="font-heading text-[17px] leading-tight text-black">{tagline || "Learn something new today"}</span>
                  <span
                    className="w-fit rounded-[10px] border-2 border-black px-3.5 py-2 text-[13px] font-bold shadow-sm"
                    style={{ background: accent, color: readableOn(accent) }}
                  >
                    Browse courses
                  </span>
                </div>
              </div>
            </section>
          </div>
        )}

        {step === "course" && (
          <div className="grid gap-4">
            <p className="text-sm font-medium text-muted-foreground">
              {initial.courseCount > 0 || courseCreated
                ? "Your academy already has a course. Add another now, or carry on."
                : "Give your first course a title to create a draft you can fill in afterwards. Nothing is published until you say so."}
            </p>
            {courseCreated ? (
              <p role="status" className="text-sm font-bold text-foreground">
                “{courseCreated}” was created as a draft.
              </p>
            ) : null}
            <FormField label="Course title" htmlFor="ob-course" error={errors.courseTitle}>
              <TextInput id="ob-course" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} placeholder="Introduction to…" maxLength={200} />
            </FormField>
          </div>
        )}

        {step === "payout" && (
          <div className="grid gap-4">
            <p className="text-sm font-medium text-muted-foreground">
              Add the bank account your course sales are paid into. You only need this to sell paid courses —
              free courses work without it.
            </p>
            {payoutSaved ? (
              <p role="status" className="text-sm font-bold text-foreground">
                A bank account is on file. Change it below, or carry on.
              </p>
            ) : null}
            <FormField label="Account holder or business name" htmlFor="ob-biz" error={errors.businessName}>
              <TextInput id="ob-biz" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={200} />
            </FormField>
            <SettlementBankFields
              bankCode={bankCode}
              accountNumber={accountNumber}
              onBankCodeChange={setBankCode}
              onAccountNumberChange={setAccountNumber}
              onVerificationChange={setVerification}
              bankFieldId="ob-bank"
              accountFieldId="ob-acct"
            />
            {errors.bank ? (
              <p role="alert" className="text-sm font-bold text-destructive">
                {errors.bank}
              </p>
            ) : null}
          </div>
        )}

        {step === "review" && (
          <div className="grid gap-4">
            <p className="text-sm font-medium text-muted-foreground">
              Check everything reads the way you want. All of it can be changed later in Settings.
            </p>
            <Summary title="Your details" onEdit={() => editFromReview("you")}>
              <Row label="Name" value={`${firstName} ${lastName}`.trim()} />
              <Row label="Phone" value={phone} />
              <Row label="Sign-in email" value={initial.me.email} />
            </Summary>
            <Summary title="Academy details" onEdit={() => editFromReview("academy")}>
              <Row label="Name" value={name} />
              <Row label="Tagline" value={tagline} />
              <Row label="Contact email" value={companyEmail} />
              <Row label="Contact phone" value={companyPhone} />
              <Row label="Website" value={website} />
              <Row label="Address" value={[addressLine1, city, region].filter((v) => v.trim()).join(", ")} />
              <Row label="Country" value={country ? labelOf(options.countries, country) : ""} />
            </Summary>
            <Summary title="Region" onEdit={() => editFromReview("region")}>
              <Row label="Time zone" value={timezone} />
              <Row label="Language" value={labelOf(options.locales, locale)} />
              <Row label="Currency" value={labelOf(options.currencies, currency)} />
            </Summary>
            <Summary title="Look and feel" onEdit={() => editFromReview("brand")}>
              <Row label="Logo" value={logoUrl ? "Uploaded" : "Not added — your academy shows its initial"} />
              <Row label="Theme" value={preset.label} />
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="shrink-0 text-[13px] font-bold text-muted-foreground">Brand colour</dt>
                <dd className="flex min-w-0 items-center gap-2 text-right text-[13px] font-bold text-foreground">
                  <span aria-hidden className="size-4 shrink-0 rounded-full border-2 border-border" style={{ background: accent }} />
                  {ownColour ? primaryColor : "The theme’s own"}
                </dd>
              </div>
            </Summary>
            {steps.some((s) => s.key === "course") ? (
              <Summary title="First course" onEdit={() => editFromReview("course")}>
                <Row
                  label="Course"
                  value={
                    courseCreated
                      ? `“${courseCreated}” (draft)`
                      : initial.courseCount > 0
                        ? "Already created"
                        : "Not yet — add one from Courses whenever you are ready"
                  }
                />
              </Summary>
            ) : null}
            {steps.some((s) => s.key === "payout") ? (
              <Summary title="Getting paid" onEdit={() => editFromReview("payout")}>
                <Row
                  label="Bank account"
                  value={payoutSaved ? "On file" : "Not yet — add it from Billing before selling a paid course"}
                />
              </Summary>
            ) : null}
          </div>
        )}

        {formError ? (
          <p role="alert" className="mt-5 rounded-[10px] border-2 border-destructive bg-card px-3 py-2.5 text-sm font-bold text-destructive">
            {formError}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t-2 border-dashed border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {index > 0 ? (
              <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => {
                  setFromReview(false);
                  goTo(steps[index - 1].key);
                }}
                className="w-full sm:w-auto"
              >
                <Icon name="arrow-left" className="size-4" />
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            {current.optional ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                disabled={pending}
                onClick={() => run(() => (step === "course" ? submitCourse(true) : submitPayout(true)))}
                className="w-full sm:w-auto"
              >
                Do this later
              </Button>
            ) : null}
            <Button type="submit" size="lg" disabled={pending || logoBusy} className="w-full sm:w-auto">
              {pending
                ? "Saving…"
                : isLast
                  ? "Finish and open my dashboard"
                  : fromReview
                    ? "Save and back to review"
                    : step === "course"
                    ? "Create course and continue"
                    : step === "payout"
                      ? "Save account and continue"
                      : "Save and continue"}
              {!pending && !isLast ? <Icon name="arrow-right" className="size-4" /> : null}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Stepper({
  steps,
  current,
  done,
  onSelect,
  percent,
  disabled,
}: {
  steps: readonly { key: OnboardingStepKey; label: string; optional: boolean }[];
  current: OnboardingStepKey;
  done: string[];
  onSelect: (key: OnboardingStepKey) => void;
  percent: number;
  disabled: boolean;
}) {
  const at = steps.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Set-up steps" className="grid gap-3">
      <ProgressBar value={percent} size="sm" label="Set-up progress" />
      <ol className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        {steps.map((s, i) => {
          const isCurrent = s.key === current;
          const isDone = done.includes(s.key) && !isCurrent;
          // A step can be opened once it has been dealt with, or if it is the
          // one straight after the furthest point reached.
          const reachable = isDone || isCurrent || i <= at;
          const state = isCurrent ? "current" : isDone ? "done" : "to do";
          return (
            <li key={s.key} className="shrink-0">
              <button
                type="button"
                disabled={disabled || !reachable || isCurrent}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onSelect(s.key)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-[12.5px] font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isCurrent
                    ? "border-foreground bg-card text-foreground shadow-sm"
                    : isDone
                      ? "border-border bg-card text-foreground hover:bg-accent"
                      : "border-border bg-muted text-muted-foreground",
                  !reachable && "cursor-not-allowed"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-full border-2 border-border text-[12px]",
                    isCurrent ? "bg-primary text-primary-foreground" : isDone ? "bg-success text-success-foreground" : "bg-card text-muted-foreground"
                  )}
                >
                  {isDone ? <Icon name="check" className="size-3.5" /> : i + 1}
                </span>
                <span className={cn(!isCurrent && "hidden sm:inline")}>{s.label}</span>
                <span className="sr-only">
                  {isCurrent ? "" : `${s.label}, `}
                  {state}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Summary({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="rounded-[12px] border-2 border-border bg-background p-3.5 sm:p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-heading text-[15px] leading-tight">{title}</h3>
        <Button type="button" variant="outline" size="sm" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
          Edit
        </Button>
      </div>
      <dl className="divide-y-2 divide-dashed divide-border">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const shown = value.trim();
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-[13px] font-bold text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words text-right text-[13px] font-bold", shown ? "text-foreground" : "text-muted-foreground")}>
        {shown || "Not given"}
      </dd>
    </div>
  );
}
