import { env } from "@/lib/env";
import { appScheme } from "@/lib/url/scheme";

export function apexHttpOrigin(): string {
  return `${appScheme()}://${env.APP_DOMAIN}`;
}
