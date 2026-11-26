"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OtpInput } from "@/components/ui/otp-input";

/**
 * The platform's half of a designed page.
 *
 * A site page cannot run script of its own, so a form on it is only a
 * declaration: `<form data-lms-form="login">` with fields named from the Site
 * API (lib/site/site-api.ts). This component is what makes that declaration
 * do something. It is first-party code, rendered by the page renderer only
 * when the page declares a form — the author never supplies any of it.
 *
 * What it decides, and the author cannot:
 *  - WHERE a form posts (always this platform's own endpoint, with CSRF);
 *  - WHAT is sent (only the catalogue's field names; anything else is ignored);
 *  - where the visitor goes next (the server's answer, never the page's).
 *
 * What it leaves alone: how the form looks. Errors are written, as text, into
 * the page's own `[data-lms-error]` element so the author can style them.
 */

type FormKind = "login" | "register" | "forgot-password";

const MIN_PASSWORD = 12;

function fieldValue(form: HTMLFormElement, name: string): string {
  const field = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  return field?.value.trim() ?? "";
}

/** The page's own message element, or one added at the end of the form. */
function messageElement(form: HTMLFormElement, attribute: "data-lms-error" | "data-lms-success"): HTMLElement {
  let el = form.querySelector<HTMLElement>(`[${attribute}]`);
  if (!el) {
    el = document.createElement("p");
    el.setAttribute(attribute, "");
    form.appendChild(el);
  }
  return el;
}

function show(form: HTMLFormElement, attribute: "data-lms-error" | "data-lms-success", message: string) {
  const el = messageElement(form, attribute);
  el.setAttribute("role", attribute === "data-lms-error" ? "alert" : "status");
  // Text, never markup: a server message can quote what the visitor typed.
  el.textContent = message;
  el.hidden = message.length === 0;
}

function clearMessages(form: HTMLFormElement) {
  for (const attribute of ["data-lms-error", "data-lms-success"] as const) {
    const el = form.querySelector<HTMLElement>(`[${attribute}]`);
    if (el) {
      el.textContent = "";
      el.hidden = true;
    }
  }
}

function setBusy(form: HTMLFormElement, busy: boolean) {
  form.setAttribute("aria-busy", busy ? "true" : "false");
  form.dataset.lmsBusy = busy ? "1" : "0";
  for (const button of form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')) {
    button.disabled = busy;
  }
}

export function SiteRuntime({
  next,
  referralCode = null,
}: {
  /** Where to return the visitor after signing in or registering. Already a safe same-site path. */
  next: string | null;
  /**
   * The referral code this visitor arrived with, read on the server (the
   * cookie is HttpOnly). Used when the designed form has no referral field of
   * its own, and offered as that field's starting value when it has.
   */
  referralCode?: string | null;
}) {
  // The email-code step of registration is the platform's, start to finish.
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);

  const submit = useCallback(
    async (form: HTMLFormElement, kind: FormKind) => {
      clearMessages(form);
      const email = fieldValue(form, "email");
      const password = form.querySelector<HTMLInputElement>('input[name="password"]')?.value ?? "";

      if (!email) return show(form, "data-lms-error", "Enter your email address.");

      setBusy(form, true);
      try {
        if (kind === "login") {
          if (!password) return show(form, "data-lms-error", "Enter your password.");
          const res = await apiPost<{ redirect: string }>("/api/auth/login", {
            email,
            password,
            surface: "tenant_client",
            ...(next ? { next } : {}),
          });
          if (res.error) return show(form, "data-lms-error", res.error.message);
          if (res.data?.redirect) window.location.assign(res.data.redirect);
          return;
        }

        if (kind === "forgot-password") {
          const res = await apiPost("/api/auth/forgot-password", { email, surface: "tenant_client" });
          if (res.error) return show(form, "data-lms-error", res.error.message);
          // The same words whether or not the address has an account: this
          // form must not tell a stranger who is registered here.
          return show(
            form,
            "data-lms-success",
            "If that email has an account, a link to choose a new password is on its way."
          );
        }

        // Register.
        if (password.length < MIN_PASSWORD) {
          return show(form, "data-lms-error", `Choose a password of at least ${MIN_PASSWORD} characters.`);
        }
        const firstName = fieldValue(form, "firstName");
        const lastName = fieldValue(form, "lastName");
        const phone = fieldValue(form, "phone");
        // A field the visitor can see wins, even when they cleared it.
        const hasReferralField = form.querySelector('input[name="referralCode"]') != null;
        const referral = hasReferralField ? fieldValue(form, "referralCode") : (referralCode ?? "");
        const res = await apiPost("/api/auth/register/client/start", {
          email,
          password,
          // A designed form has one password box; the standard screen's second
          // one exists to catch typos, which the email code step also does.
          confirm: password,
          displayName: [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0],
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(phone ? { phone } : {}),
          ...(referral ? { referralCode: referral } : {}),
        });
        if (res.error) return show(form, "data-lms-error", res.error.message);
        setCode("");
        setOtpError(null);
        setOtpInfo(null);
        setOtpEmail(email);
      } finally {
        setBusy(form, false);
      }
    },
    [next, referralCode]
  );

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-site-root]");
    if (!root) return;

    // Set as a property, not an attribute: nothing about what a visitor has
    // in a field is ever readable from the page's own stylesheet.
    if (referralCode) {
      for (const field of root.querySelectorAll<HTMLInputElement>('input[name="referralCode"]')) {
        if (!field.value) field.value = referralCode;
      }
    }

    // Message slots start empty; an empty styled box is noise.
    for (const el of root.querySelectorAll<HTMLElement>("[data-lms-error], [data-lms-success]")) {
      if (!el.textContent?.trim()) el.hidden = true;
    }

    const onSubmit = (event: Event) => {
      const form = (event.target as Element | null)?.closest?.("form[data-lms-form]");
      if (!(form instanceof HTMLFormElement) || !root.contains(form)) return;
      const kind = form.getAttribute("data-lms-form");
      // The search box is a plain GET to the catalogue; the browser does it.
      if (kind !== "login" && kind !== "register" && kind !== "forgot-password") return;
      event.preventDefault();
      if (form.dataset.lmsBusy === "1") return;
      void submit(form, kind);
    };

    root.addEventListener("submit", onSubmit);
    return () => root.removeEventListener("submit", onSubmit);
  }, [submit, referralCode]);

  async function verify() {
    if (!otpEmail || code.length !== 6) return;
    setOtpBusy(true);
    setOtpError(null);
    const res = await apiPost<{ redirect: string }>("/api/auth/register/client/complete", {
      email: otpEmail,
      code,
      ...(next ? { next } : {}),
    });
    setOtpBusy(false);
    if (res.error) return setOtpError(res.error.message);
    if (res.data?.redirect) window.location.assign(res.data.redirect);
  }

  async function resend() {
    if (!otpEmail) return;
    setOtpError(null);
    setOtpInfo(null);
    const res = await apiPost("/api/auth/register/client/resend-otp", { email: otpEmail });
    if (res.error) return setOtpError(res.error.message);
    setOtpInfo("A new code was sent if your registration is still in progress.");
  }

  return (
    <Dialog open={otpEmail != null} onOpenChange={(open) => (open ? undefined : setOtpEmail(null))}>
      {otpEmail ? (
        <DialogContent className="max-w-md">
          <DialogTitle>Check your email</DialogTitle>
          <DialogDescription>
            We sent a 6-digit code to <span className="font-bold text-foreground">{otpEmail}</span>. Enter
            it to finish creating your account.
          </DialogDescription>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <label htmlFor="site-otp" className="text-[13px] font-bold text-foreground">
              Verification code
            </label>
            <OtpInput
              id="site-otp"
              value={code}
              onChange={setCode}
              disabled={otpBusy}
              autoFocus
              aria-invalid={otpError ? true : undefined}
            />
            {otpError ? (
              <p role="alert" className="text-sm font-bold text-destructive">
                {otpError}
              </p>
            ) : null}
            {otpInfo ? (
              <p role="status" className="text-sm font-medium text-muted-foreground">
                {otpInfo}
              </p>
            ) : null}
            <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" onClick={() => void resend()} disabled={otpBusy}>
                Send a new code
              </Button>
              <Button type="submit" disabled={otpBusy || code.length !== 6}>
                {otpBusy ? "Checking…" : "Verify and continue"}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
