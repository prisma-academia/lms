import type { Metadata } from "next";
import Link from "next/link";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { authHref, safeNextPath } from "@/lib/auth/next-path";
import { UNLISTED_METADATA } from "@/lib/site/public-metadata";
import { PublicFrame } from "@/components/public/public-frame";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

/**
 * What a signed-out visitor gets for a course or programme address with nothing
 * public behind it. The proxy rewrites here with a 404 status.
 *
 * "Nothing public" covers three different things — the item does not exist, it
 * is still a draft, or it is private — and this page is the single answer to
 * all three. It must not hint at which: a private course that answered "sign in
 * to see this" while a typo answered "not found" would confirm, to anyone who
 * tried a few addresses, which private courses an academy runs.
 *
 * It still has to be useful to the one person with a legitimate reason to be
 * here: a learner who has been given access to a private course and followed a
 * link while signed out. So it always offers sign-in, for every address alike,
 * and brings them back to the address they asked for.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = UNLISTED_METADATA;

type Props = { searchParams: Promise<{ from?: string | string[] }> };

export default async function UnavailablePage({ searchParams }: Props) {
  const page = await requireExistingTenant();
  const raw = (await searchParams).from;
  // `from` is set by the proxy, but it is still a query string: treat it as
  // untrusted and accept only a learner path on this site.
  const from = safeNextPath(Array.isArray(raw) ? raw[0] : raw);

  return (
    <PublicFrame tenantId={page.tenant!.id} next={from}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10 text-center">
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground"
        >
          <Icon name="search" className="size-6" />
        </span>
        <h1 className="font-heading text-2xl leading-tight sm:text-3xl">
          We couldn&rsquo;t find that page
        </h1>
        <p className="text-sm font-medium text-muted-foreground">
          There is nothing public at this address. The link may be mistyped, or it may be for
          something that is only open to people who have been given access.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/courses">
              Browse courses
              <Icon name="arrow-right" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={authHref("login", from)}>Sign in</Link>
          </Button>
        </div>
        <p className="text-[13px] font-medium text-muted-foreground">
          If you were given access, sign in and you&rsquo;ll be taken straight there.
        </p>
      </div>
    </PublicFrame>
  );
}
