"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/icon";
import { withReferralCode } from "@/lib/referrals/code-format";

/**
 * "Share this course" — a link to copy, the device's own share sheet where
 * there is one, and the handful of places people actually send links.
 *
 * Staff and learners share the same dialog but not the same link. A staff
 * member's link can carry their referral code, so sign-ups that come through it
 * are credited to them; that is theirs to switch on or off, and the dialog says
 * plainly when the code is in the link. A learner's link never carries one.
 *
 * The share targets are ordinary links to each service's public "share" URL:
 * no third-party script is loaded and nothing is sent anywhere until the person
 * presses one.
 */

export type ShareReferral = {
  /** The staff member's code, or null if they have not created one yet. */
  code: string | null;
  /** Whether the code is switched on. An inactive code is never added to a link. */
  active: boolean;
};

type Target = { label: string; icon: IconName; href: (url: string, text: string) => string };

const TARGETS: Target[] = [
  {
    label: "WhatsApp",
    icon: "external-link",
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    label: "X",
    icon: "external-link",
    href: (url, text) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    label: "LinkedIn",
    icon: "external-link",
    href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    label: "Facebook",
    icon: "external-link",
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    label: "Email",
    icon: "mail",
    href: (url, text) =>
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
  },
];

const noopSubscribe = () => () => {};

/** True only in a browser that has a share sheet; false on the server and during hydration. */
function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  );
}

async function copyText(text: string, fallbackField: HTMLInputElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or an insecure context — fall through to selection.
  }
  if (!fallbackField) return false;
  fallbackField.focus();
  fallbackField.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

export function ShareDialog({
  url,
  title,
  kind = "course",
  referral,
  notice,
  triggerLabel = "Share",
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  /** Absolute link to the thing being shared, without any referral code. */
  url: string;
  /** Its name; becomes the message text on services that take one. */
  title: string;
  /** What it is, for the dialog's wording. */
  kind?: "course" | "programme";
  /** Present for staff only. Leave it out and the link is never tagged. */
  referral?: ShareReferral;
  /** A caution shown above the link, e.g. that the course is not public yet. */
  notice?: string | null;
  triggerLabel?: string;
  triggerVariant?: "outline" | "default" | "ghost";
  triggerSize?: "sm" | "default" | "lg";
}) {
  const uid = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const canNativeShare = useCanNativeShare();

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(referral?.code ?? null);
  const [includeCode, setIncludeCode] = useState(true);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const codeUsable = Boolean(referral && code && referral.active);
  const link = codeUsable && includeCode ? withReferralCode(url, code) : url;

  // "Copied" is a moment, not a state: put the button back after a few seconds.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    const ok = await copyText(link, fieldRef.current);
    setCopied(ok);
    setStatus(
      ok
        ? "Link copied."
        : "Could not copy automatically. The link is selected — press Ctrl+C (or Cmd+C) to copy it."
    );
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text: title, url: link });
    } catch {
      // Dismissing the share sheet rejects the promise. Nothing went wrong.
    }
  }

  async function createCode() {
    setCreating(true);
    setStatus(null);
    const res = await apiPost<{ code: string }>("/api/tenant/referrals", {});
    setCreating(false);
    if (res.error || !res.data) {
      setStatus(res.error?.message ?? "Could not create your referral code. Try again.");
      return;
    }
    setCode(res.data.code);
    setIncludeCode(true);
    setStatus("Your referral code has been added to the link.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setStatus(null);
          setCopied(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize}>
          <Icon name="link" aria-hidden />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogTitle>Share this {kind}</DialogTitle>
        <DialogDescription className="pr-8">
          Anyone with the link can see what the {kind} covers. They sign in or create an account
          to enrol.
        </DialogDescription>

        <div className="mt-5 flex flex-col gap-4">
          {notice ? (
            <p
              role="note"
              className="rounded-[10px] border-2 border-warning bg-warning/15 px-3 py-2 text-[13px] font-medium text-foreground"
            >
              {notice}
            </p>
          ) : null}

          <div>
            <label htmlFor={`${uid}-link`} className="text-[13px] font-bold text-foreground">
              Link
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                id={`${uid}-link`}
                ref={fieldRef}
                type="text"
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-[10px] border-2 border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
              <Button type="button" onClick={copy} className="shrink-0">
                <Icon name={copied ? "check" : "link"} aria-hidden />
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </div>

          {referral ? (
            <div className="rounded-[10px] border-2 border-dashed border-border px-3 py-2.5">
              {code && referral.active ? (
                <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    checked={includeCode}
                    onChange={(e) => setIncludeCode(e.target.checked)}
                  />
                  <span>
                    Include my referral code <span className="num font-bold">{code}</span>
                    <span className="block text-xs text-muted-foreground">
                      People who sign up through this link are counted as yours on the Referrals
                      page.
                    </span>
                  </span>
                </label>
              ) : code ? (
                <p className="text-[13px] font-medium text-muted-foreground">
                  Your referral code <span className="num font-bold text-foreground">{code}</span>{" "}
                  is switched off, so it is not added to this link.
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 text-[13px] font-medium text-muted-foreground">
                    Add a referral code to see who signs up through the links you share.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={createCode}
                    disabled={creating}
                  >
                    {creating ? "Creating…" : "Add my code"}
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          <div>
            <p id={`${uid}-targets`} className="text-[13px] font-bold text-foreground">
              Send it with
            </p>
            <ul
              aria-labelledby={`${uid}-targets`}
              className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {canNativeShare ? (
                <li>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={nativeShare}
                  >
                    <Icon name="upload" aria-hidden />
                    This device…
                  </Button>
                </li>
              ) : null}
              {TARGETS.map((target) => {
                const external = !target.href("", "").startsWith("mailto:");
                return (
                  <li key={target.label}>
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a
                        href={target.href(link, title)}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                      >
                        <Icon name={target.icon} aria-hidden />
                        {target.label}
                        {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Always in the page, so a screen reader hears "Link copied" without
              focus having to move off the button that was pressed. */}
          <p aria-live="polite" className="min-h-5 text-[13px] font-bold text-muted-foreground">
            {status}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
