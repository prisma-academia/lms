import { buildOpenApi } from "@/lib/api/v1/openapi";
import { env } from "@/lib/env";
import { appScheme } from "@/lib/url/scheme";

/** GET /api/v1/openapi.json — public: the reference describes the API, not anyone's data. */
export function GET() {
  const doc = buildOpenApi(`${appScheme()}://${env.APP_DOMAIN}/api/v1`);
  return new Response(JSON.stringify(doc), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
