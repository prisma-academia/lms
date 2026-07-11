import Link from "next/link";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { prisma } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Decor } from "@/components/marketing/decor";

export default async function TenantLandingPage() {
  const page = await requireExistingTenant();
  const tenant = page.tenant!;

  const row = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { settingsJson: true },
  });
  const settings = parseTenantSettings(row?.settingsJson);
  const accent = settings.primaryColor;

  return (
    <main className="relative flex min-h-[100dvh] flex-1 flex-col items-center justify-center overflow-hidden p-5">
      <Decor preset="tenant" />
      <div className="relative w-full max-w-lg rounded-[14px] border-2 border-ink bg-card p-8 text-center shadow-brutal">
        <div
          className="mx-auto mb-4 flex size-16 -rotate-3 items-center justify-center rounded-[14px] border-2 border-ink font-heading text-2xl text-ink shadow-brutal-sm"
          style={{ background: accent }}
        >
          {tenant.name.charAt(0).toUpperCase()}
        </div>
        <h1 className="font-heading text-3xl leading-tight">{tenant.name}</h1>
        <p className="mt-2 text-sm font-medium text-ink/60">
          Welcome to your workspace. Sign in as a learner or administrator.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/auth/login">Learner sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/auth/login">Admin sign in</Link>
          </Button>
        </div>
        <p className="mt-6 text-[13px] font-medium text-ink/60">
          New learner?{" "}
          <Link
            href="/auth/register"
            className="font-bold underline decoration-pink decoration-2 underline-offset-2 hover:text-ink"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
