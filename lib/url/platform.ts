import { env } from "@/lib/env";
import { appScheme } from "@/lib/url/scheme";

export function platformHttpOrigin(): string {
  return `${appScheme()}://${env.PLATFORM_SUBDOMAIN}.${env.APP_DOMAIN}`;
}
