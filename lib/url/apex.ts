import { env } from "@/lib/env";

export function apexHttpOrigin(): string {
  return `http://${env.APP_DOMAIN}`;
}
