import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { resolveHost } from "@/lib/auth/context";
import { SETUP_PATH, describeSetupToken } from "@/lib/auth/account-setup";
import type { SessionUserType } from "@/lib/generated/prisma/client";

/**
 * The page behind the button in an invitation or reset email.
 *
 * The link's token already says whose account this is, so the page shows that
 * — name, email, academy — and asks for one thing: a new password, typed
 * twice. Saving it signs the person in (see `app/api/auth/reset-password`).
 *
 * Shared by the three sign-ins (platform console, academy staff, learners);
 * each has its own thin page so the link lands in the right place.
 */

export type SetPasswordSurface = "platform" | "tenant_admin" | "tenant_client";

const USER_TYPE: Record<SetPasswordSurface, SessionUserType> = {
  platform: "PLATFORM",
  tenant_admin: "TENANT",
  tenant_client: "CLIENT",
};

const PATHS: Record<SetPasswordSurface, { login: string; forgot: string; loginLabel: string }> = {
  platform: { login: "/auth/login", forgot: "/auth/forgot-password", loginLabel: "Go to sign in" },
  tenant_admin: { login: "/admin/auth/login", forgot: "/admin/auth/forgot-password", loginLabel: "Go to staff sign in" },
  tenant_client: { login: "/auth/login", forgot: "/auth/forgot-password", loginLabel: "Go to sign in" },
};

const LINK =
  "inline-flex min-h-9 items-center rounded-[6px] font-bold underline decoration-primary decoration-2 underline-offset-2 outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

const PROBLEMS = {
  missing: {
    title: "This link is incomplete",
    text: "Part of the link is missing. Open it again from the email, or copy the whole address if you pasted it.",
  },
  invalid: {
    title: "This link doesn't work",
    text: "It may have been replaced by a newer email. Use the most recent one we sent you, or ask for a new link.",
  },
  expired: {
    title: "This link has expired",
    text: "For your security, links only work for a limited time. Ask for a new one and it will arrive in a minute.",
  },
  used: {
    title: "This link has already been used",
    text: "Your password is set. Sign in with it, or ask for a new link if you have forgotten it.",
  },
  wrong_address: {
    title: "This link belongs to a different address",
    text: "Open it exactly as it appears in the email. If you copied it by hand, check the start of the address.",
  },
} as const;

export async function SetPasswordScreen({
  token,
  surface,
}: {
  token: string | undefined;
  surface: SetPasswordSurface;
}) {
  const ctx = resolveHost((await headers()).get("host"));
  const host =
    ctx.mode === "platform"
      ? ({ mode: "platform" } as const)
      : ctx.mode === "tenant"
        ? ({ mode: "tenant", slug: ctx.slug } as const)
        : null;
  const info = host ? await describeSetupToken(token, host) : ({ ok: false, reason: "wrong_address" } as const);
  const paths = PATHS[surface];

  if (!info.ok) {
    const problem = PROBLEMS[info.reason];
    return (
      <AuthCard title={problem.title}>
        <p className="text-sm font-medium text-muted-foreground">{problem.text}</p>
        <div className="mt-5 flex flex-col gap-1 text-sm">
          {info.reason === "used" ? (
            <Link href={paths.login} className={LINK}>
              {paths.loginLabel}
            </Link>
          ) : null}
          <Link href={paths.forgot} className={LINK}>
            Email me a new link
          </Link>
          {info.reason === "used" ? null : (
            <Link href={paths.login} className={LINK}>
              {paths.loginLabel}
            </Link>
          )}
        </div>
      </AuthCard>
    );
  }

  // A staff link opened on the learner page (or the other way round): same
  // address, different sign-in. Send it where it belongs.
  if (info.userType !== USER_TYPE[surface]) {
    redirect(`${SETUP_PATH[info.userType]}?token=${encodeURIComponent(token ?? "")}`);
  }

  const title = info.firstTime
    ? info.firstName
      ? `Welcome, ${info.firstName}`
      : "Welcome"
    : "Choose a new password";
  const subtitle = info.firstTime
    ? info.isOwner && info.academyName
      ? `Choose a password to open ${info.academyName}. You will set up the academy next.`
      : `Choose a password to finish creating your account${info.academyName ? ` at ${info.academyName}` : ""}.`
    : "Choose a new password to get back in to your account.";

  const rows: Array<[string, string]> = [];
  if (info.fullName) rows.push(["Name", info.fullName]);
  rows.push(["Email", info.email]);
  if (info.academyName) rows.push(["Academy", info.academyName]);
  if (info.isOwner) rows.push(["Role", "Owner"]);

  return (
    <AuthCard title={title} subtitle={subtitle}>
      <dl className="mb-5 divide-y-2 divide-border/40 rounded-[10px] border-2 border-border bg-muted/40 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words text-right font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <ResetPasswordForm
        token={token ?? ""}
        submitLabel={info.firstTime ? (info.isOwner ? "Save and set up my academy" : "Save and continue") : "Save new password"}
        dialogErrors={surface === "tenant_client"}
      />
    </AuthCard>
  );
}
