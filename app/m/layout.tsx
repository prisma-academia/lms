import type { Metadata } from "next";
import { MarketingShell } from "./marketing-shell";
import { requireApexHost } from "@/lib/auth/host-page";
import { env } from "@/lib/env";
import {
  MARKETING_DESCRIPTION,
  MARKETING_KEYWORDS,
  buildPlatformMetadata,
  requestOrigin,
} from "@/lib/site/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await requestOrigin();
  const base = buildPlatformMetadata(origin);
  const title = `${env.PRODUCT_NAME} — Courses, CBT exams and payments for academies`;
  return {
    ...base,
    // `absolute`, or the root layout's "%s · Product" template wraps this
    // title and the product name appears twice.
    title: {
      absolute: title,
      template: `%s · ${env.PRODUCT_NAME}`,
    },
    description: MARKETING_DESCRIPTION,
    keywords: MARKETING_KEYWORDS,
    openGraph: {
      ...base.openGraph,
      title,
      description: MARKETING_DESCRIPTION,
    },
    twitter: {
      ...base.twitter,
      title,
      description: MARKETING_DESCRIPTION,
    },
    // Each page sets its own canonical; a layout-level one would point
    // /register at the home page.
    alternates: undefined,
  };
}

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await requireApexHost();
  return <MarketingShell>{children}</MarketingShell>;
}
