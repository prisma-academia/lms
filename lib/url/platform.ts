import { env } from "@/lib/env";

export function platformHttpOrigin(): string {
  return `http://${env.PLATFORM_SUBDOMAIN}.${env.APP_DOMAIN}`;
}
