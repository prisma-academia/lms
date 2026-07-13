import type { Metadata } from "next";
import { MarketingShell } from "./marketing-shell";
import { requireApexHost } from "@/lib/auth/host-page";
import { env } from "@/lib/env";
import { buildPlatformMetadata, productDescription, requestOrigin } from "@/lib/site/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await requestOrigin();
  const base = buildPlatformMetadata(origin);
  return {
    ...base,
    title: {
      default: `${env.PRODUCT_NAME} — Learning platform for organizations`,
      template: `%s · ${env.PRODUCT_NAME}`,
    },
    description: productDescription(),
    alternates: {
      canonical: origin,
    },
  };
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await requireApexHost();
  return <MarketingShell>{children}</MarketingShell>;
}
