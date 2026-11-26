"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/shell";
import { CopyField } from "@/components/share/copy-field";
import { withReferralCode } from "@/lib/referrals/code-format";

/**
 * The signed-in staff member's own code and the links that carry it.
 *
 * Without a code this is a single button: a code is created only when someone
 * asks for one, never as a side effect of opening the page.
 */
export function MyCodeCard({
  code,
  active,
  origin,
}: {
  code: string | null;
  active: boolean;
  /** This academy's address, e.g. `https://demo.example.com`. */
  origin: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    const res = await apiPost<{ code: string }>("/api/tenant/referrals", {});
    setCreating(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    // The page reads the code on the server; ask it to render again with it.
    router.refresh();
  }

  if (!code) {
    return (
      <Card>
        <h2 className="font-heading text-lg leading-tight">Your referral code</h2>
        <p className="mt-1.5 max-w-prose text-sm font-medium text-muted-foreground">
          A referral code is a short tag you add to any link to this site. When someone follows
          your link and creates an account, their sign-up — and what they enrol in or buy
          afterwards — is counted here as yours. It is for tracking only: nothing is paid out
          and learners are not charged differently.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={create} disabled={creating}>
            {creating ? "Creating…" : "Create my referral code"}
          </Button>
          {error ? (
            <p role="alert" className="text-sm font-bold text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg leading-tight">Your referral code</h2>
        <Badge color={active ? "var(--success)" : "var(--muted)"}>
          {active ? "Active" : "Switched off"}
        </Badge>
      </div>

      {active ? null : (
        <p
          role="note"
          className="mt-3 rounded-[10px] border-2 border-warning bg-warning/15 px-3 py-2 text-[13px] font-medium text-foreground"
        >
          Your code has been switched off by an administrator. Links that carry it still open
          normally, but new sign-ups through them are not counted.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CopyField
          label="Code"
          value={code}
          copyLabel="Copy"
          hint="Learners can also type this into the sign-up form."
          className="lg:col-span-2 lg:max-w-sm"
        />
        <CopyField
          label="Link to the course catalogue"
          value={withReferralCode(`${origin}/courses`, code)}
          copyLabel="Copy link"
        />
        <CopyField
          label="Link straight to sign-up"
          value={withReferralCode(`${origin}/auth/register`, code)}
          copyLabel="Copy link"
        />
      </div>

      <p className="mt-4 max-w-prose text-[13px] font-medium text-muted-foreground">
        Any link to this site works: add <span className="num font-bold text-foreground">?ref={code}</span>{" "}
        to the end. On a course page, the Share button does it for you. The code is remembered for
        30 days after someone follows your link.
      </p>
    </Card>
  );
}
