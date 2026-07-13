import type { Metadata } from "next";
import { requirePlatformHost } from "@/lib/auth/host-page";
import { env } from "@/lib/env";
import { buildPlatformMetadata, requestOrigin } from "@/lib/site/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await requestOrigin();
  const base = buildPlatformMetadata(origin);
  return {
    ...base,
    title: {
      default: `Platform · ${env.PRODUCT_NAME}`,
      template: `%s · Platform · ${env.PRODUCT_NAME}`,
    },
    robots: { index: false, follow: false },
  };
}

export default async function PlatformRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformHost();
  return <>{children}</>;
}
