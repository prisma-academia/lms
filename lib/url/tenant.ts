import { env } from "@/lib/env";
import { appScheme } from "@/lib/url/scheme";

export function tenantHttpOrigin(slug: string): string {
  return `${appScheme()}://${slug}.${env.APP_DOMAIN}`;
}
