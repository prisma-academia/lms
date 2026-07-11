import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveHost } from "@/lib/auth/context";

async function hostMode() {
  const h = await headers();
  return resolveHost(h.get("host")).mode;
}

/** Only allow rendering on the apex (marketing) host. */
export async function requireApexHost(): Promise<void> {
  if ((await hostMode()) !== "apex") notFound();
}

/** Only allow rendering on the platform admin subdomain. */
export async function requirePlatformHost(): Promise<void> {
  if ((await hostMode()) !== "platform") notFound();
}
