"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import {
  SettlementBankFields,
  type VerificationState,
} from "@/components/billing/settlement-bank-fields";

const STEPS = ["branding", "company", "course", "payout", "finish"] as const;
type Step = (typeof STEPS)[number];

type Props = {
  initial: {
    tenantName: string;
    companyEmail: string | null;
    companyPhone: string | null;
    website: string | null;
    addressLine1: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    settings: {
      primaryColor: string;
      timezone: string;
      locale: string;
      currency: string;
      logoKey?: string;
      logoUrl: string | null;
    };
    completedSteps: string[];
    subaccount: {
      businessName: string;
      settlementBankCode: string;
      settlementAccountNumber: string;
    } | null;
  };
  storageEnabled: boolean;
  supportedLocales: string[];
  canWriteBilling: boolean;
  canWriteCourses: boolean;
};

export function OnboardingWizard({ initial, canWriteBilling, canWriteCourses }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("branding");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial.tenantName);
  const [primaryColor, setPrimaryColor] = useState(initial.settings.primaryColor);
  const [companyEmail, setCompanyEmail] = useState(initial.companyEmail ?? "");
  const [companyPhone, setCompanyPhone] = useState(initial.companyPhone ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [addressLine1, setAddressLine1] = useState(initial.addressLine1 ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [courseTitle, setCourseTitle] = useState("");
  const [businessName, setBusinessName] = useState(initial.subaccount?.businessName ?? initial.tenantName);
  const [bankCode, setBankCode] = useState(initial.subaccount?.settlementBankCode ?? "");
  const [accountNumber, setAccountNumber] = useState(initial.subaccount?.settlementAccountNumber ?? "");
  const [verification, setVerification] = useState<VerificationState>({
    verified: false,
    accountName: null,
  });

  async function saveSettings(onboardingPatch: { completedAt?: string; completedSteps?: string[] }) {
    const completedSteps = onboardingPatch.completedSteps ?? initial.completedSteps;
    await apiPatch("/api/tenant/settings", {
      name,
      companyEmail: companyEmail || null,
      companyPhone: companyPhone || null,
      website: website || null,
      addressLine1: addressLine1 || null,
      city: city || null,
      settings: {
        primaryColor,
        onboarding: { ...onboardingPatch, completedSteps },
      },
    });
  }

  async function onNext() {
    setError(null);
    setPending(true);
    try {
      if (step === "branding") {
        await saveSettings({ completedSteps: ["branding"] });
        setStep("company");
      } else if (step === "company") {
        await saveSettings({ completedSteps: ["branding", "company"] });
        setStep("course");
      } else if (step === "course") {
        if (courseTitle.trim() && canWriteCourses) {
          const slug = courseTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          await apiPost("/api/tenant/courses", { title: courseTitle.trim(), slug: slug || "course-1" });
        }
        setStep("payout");
      } else if (step === "payout") {
        const hasPayoutInput = Boolean(bankCode.trim() || accountNumber.trim());
        if (hasPayoutInput) {
          if (!bankCode.trim() || !accountNumber.trim()) {
            setError("Select a bank and enter the full account number, or leave both empty to skip.");
            return;
          }
          if (!verification.verified) {
            setError("Verify the bank account before continuing.");
            return;
          }
        }
        if (bankCode && accountNumber && verification.verified && canWriteBilling) {
          await apiPost("/api/tenant/billing/subaccount", {
            businessName,
            settlementBankCode: bankCode,
            settlementAccountNumber: accountNumber,
            businessEmail: companyEmail || undefined,
          });
        }
        setStep("finish");
      } else {
        await saveSettings({
          completedAt: new Date().toISOString(),
          completedSteps: [...STEPS],
        });
        router.push("/admin/dashboard");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function onSkip() {
    await saveSettings({
      completedAt: new Date().toISOString(),
      completedSteps: ["skipped"],
    });
    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 text-xs text-stone-500">
        {STEPS.map((s) => (
          <span key={s} className={s === step ? "font-semibold text-stone-900" : ""}>
            {s}
          </span>
        ))}
      </div>

      {step === "branding" && (
        <div className="space-y-4">
          <FormField label="Academy name" htmlFor="onboard-name">
            <TextInput id="onboard-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Primary color" htmlFor="onboard-color">
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-16" />
          </FormField>
        </div>
      )}

      {step === "company" && (
        <div className="space-y-4">
          <FormField label="Company email" htmlFor="onboard-email">
            <TextInput id="onboard-email" type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
          </FormField>
          <FormField label="Phone" htmlFor="onboard-phone">
            <TextInput id="onboard-phone" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
          </FormField>
          <FormField label="Website" htmlFor="onboard-website">
            <TextInput id="onboard-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </FormField>
          <FormField label="Address" htmlFor="onboard-address">
            <TextInput id="onboard-address" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
          </FormField>
          <FormField label="City" htmlFor="onboard-city">
            <TextInput id="onboard-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </FormField>
        </div>
      )}

      {step === "course" && (
        <FormField label="First course title (optional)" htmlFor="onboard-course">
          <TextInput id="onboard-course" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} placeholder="Introduction to …" />
        </FormField>
      )}

      {step === "payout" && (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">Add bank details to sell paid courses. Payouts use platform sub-accounts — no API keys needed.</p>
          <FormField label="Business name" htmlFor="onboard-biz">
            <TextInput id="onboard-biz" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </FormField>
          <SettlementBankFields
            bankCode={bankCode}
            accountNumber={accountNumber}
            onBankCodeChange={setBankCode}
            onAccountNumberChange={setAccountNumber}
            onVerificationChange={setVerification}
            bankFieldId="onboard-bank"
            accountFieldId="onboard-acct"
          />
        </div>
      )}

      {step === "finish" && (
        <p className="text-sm text-stone-600">
          You&apos;re all set. Your academy is on a 90-day trial with 10 GB storage. Upgrade anytime from Billing.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={onNext} disabled={pending}>
          {step === "finish" ? "Go to dashboard" : "Continue"}
        </Button>
        <Button variant="outline" onClick={onSkip} disabled={pending}>
          Finish later
        </Button>
      </div>
    </div>
  );
}
