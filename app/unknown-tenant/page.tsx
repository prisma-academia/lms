import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Academy not found",
  robots: { index: false, follow: false },
};

/**
 * Shown, with a 404, for an address that is not an academy: a subdomain nobody
 * has registered, or a host the platform does not recognise at all. The proxy
 * sends requests here (see `handleTenant` and the "unknown" host mode in
 * proxy.ts); nothing links to it.
 *
 * It names no academy and offers no sign-in: there is nothing at this address
 * to sign in to, and the only useful thing to say is that the address is wrong.
 */
export default function UnknownTenant() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-2xl leading-tight">There is no academy at this address</h1>
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          The web address may have been mistyped, or the academy may have changed its name. Check
          the link you were given, or ask whoever sent it to you for the current one.
        </p>
      </div>
    </main>
  );
}
