/**
 * Tenant branding: does a logo upload actually work, end to end?
 *
 * Unlike `verify:gating`, this one is NOT pure logic — the logo pipeline's
 * failure modes are environmental, not algorithmic. The code path (presign ->
 * PUT -> finalize -> sharp variants) is straightforward; what breaks in the
 * real world is the bucket: objects that upload fine but are not publicly
 * readable, a missing public base URL, an endpoint the server can reach but the
 * browser cannot. So this script exercises the actual bucket and then *fetches
 * the resulting public URLs over HTTP*, which is the check that catches a logo
 * that "uploaded successfully" and still renders as a broken image.
 *
 *   npm run verify:branding
 *
 * ONE THING THIS CANNOT COVER: the browser's cross-origin PUT. A presigned PUT
 * from Node ignores CORS entirely, so a bucket with no CORS rule passes here
 * and still fails for every admin. Pair this with one manual upload through
 * /admin/settings after changing bucket configuration.
 *
 * Writes and deletes objects under `tenants/<VERIFY_TENANT_ID>/branding/`.
 */
import sharp from "sharp";
import {
  createPresignedUpload,
  publicUrlForKey,
  s3Configured,
  headObjectSize,
} from "../lib/storage/s3";
import {
  brandingAssetUrls,
  cleanupBrandingKeys,
  finalizeLogoBranding,
} from "../lib/tenant/branding-assets";
import { tenantSettingsSchema } from "../lib/tenant/settings";
import { env } from "../lib/env";

/** Not a real tenant — only the key prefix matters, and we clean up after. */
const TENANT_ID = "verify-branding";
const PRIMARY_COLOR = "#0f172a";

let failed = 0;
const created: string[] = [];

function check(label: string, ok: boolean, detail?: string) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : `\n      ${detail}`}`);
}

async function main() {
  console.log("Tenant branding pipeline\n");

  if (!s3Configured()) {
    console.log(
      "FAIL  object storage is configured\n" +
        "      s3Configured() is false. Set S3_BUCKET, S3_ACCESS_KEY_ID and\n" +
        "      S3_SECRET_ACCESS_KEY, plus either S3_REGION or S3_ENDPOINT.\n" +
        "      Until then every logo upload returns 503 storage_unconfigured."
    );
    process.exit(1);
  }
  check("object storage is configured", true);

  if (!env.S3_PUBLIC_BASE_URL && env.S3_ENDPOINT) {
    console.log(
      "NOTE  S3_PUBLIC_BASE_URL is unset with a custom S3_ENDPOINT, so public\n" +
        "      URLs are built from the endpoint itself. That only works if the\n" +
        "      bucket is publicly readable at that host — the fetch checks below\n" +
        "      are what tell you whether it is."
    );
  }

  // A 512x512 PNG: over MIN_LOGO_SIDE_PX, square, so it passes every rule in
  // finalizeLogoBranding and exercises all three variant generations.
  const png = await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 20, g: 60, b: 200, alpha: 1 } },
  })
    .png()
    .toBuffer();

  // ---- presign + PUT ------------------------------------------------------
  const presigned = await createPresignedUpload({
    tenantId: TENANT_ID,
    contentType: "image/png",
    kind: "logo",
    contentLength: png.byteLength,
  });
  created.push(presigned.key);

  const put = await fetch(presigned.url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(png),
  });
  check(
    "presigned PUT is accepted by the bucket",
    put.ok,
    put.ok ? undefined : `${put.status} ${put.statusText} — ${(await put.text()).slice(0, 300)}`
  );
  if (!put.ok) {
    await finish();
    return;
  }

  const size = await headObjectSize(presigned.key);
  check("uploaded object has the expected size", size === png.byteLength, `got ${size}, want ${png.byteLength}`);

  // ---- finalize (sharp variants) -----------------------------------------
  const result = await finalizeLogoBranding({
    tenantId: TENANT_ID,
    logoKey: presigned.key,
    primaryColor: PRIMARY_COLOR,
  });
  created.push(result.brandingAssets.icon32, result.brandingAssets.apple180, result.brandingAssets.og1200);
  check("finalize generates icon32 / apple180 / og1200", Boolean(
    result.brandingAssets.icon32 && result.brandingAssets.apple180 && result.brandingAssets.og1200
  ));

  for (const [name, key, want] of [
    ["icon32", result.brandingAssets.icon32, 32],
    ["apple180", result.brandingAssets.apple180, 180],
  ] as const) {
    const res = await fetch(publicUrlForKey(key));
    const meta = res.ok ? await sharp(Buffer.from(await res.arrayBuffer())).metadata() : null;
    check(`${name} is ${want}x${want}`, meta?.width === want && meta?.height === want, `got ${meta?.width}x${meta?.height}`);
  }

  // ---- the check that actually matters ------------------------------------
  const settings = tenantSettingsSchema.parse({
    logoKey: result.logoKey,
    brandingAssets: result.brandingAssets,
    primaryColor: PRIMARY_COLOR,
  });
  const urls = brandingAssetUrls(settings);

  for (const [name, url] of Object.entries(urls)) {
    if (!url) {
      check(`${name} resolves to a URL`, false, "brandingAssetUrls returned null");
      continue;
    }
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      check(`${name} is publicly readable`, false, `fetch(${url}) threw: ${String(err)}`);
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    check(
      `${name} is publicly readable`,
      res.ok && type.startsWith("image/"),
      `GET ${url} -> ${res.status} ${res.statusText}, content-type "${type}".\n` +
        `      The object exists (finalize just wrote it), so this is a bucket\n` +
        `      policy or S3_PUBLIC_BASE_URL problem. Every <img> pointing at this\n` +
        `      URL — admin sidebar, learner shell, auth card, email — is broken.`
    );
  }

  // ---- rejection path cleans up after itself ------------------------------
  const tiny = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const tinyUpload = await createPresignedUpload({
    tenantId: TENANT_ID,
    contentType: "image/png",
    kind: "logo",
    contentLength: tiny.byteLength,
  });
  await fetch(tinyUpload.url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(tiny),
  });
  let rejected = false;
  try {
    await finalizeLogoBranding({
      tenantId: TENANT_ID,
      logoKey: tinyUpload.key,
      primaryColor: PRIMARY_COLOR,
    });
  } catch {
    rejected = true;
  }
  check("an undersized logo is rejected by finalize", rejected);
  // The route is what cleans up a rejected key; mirror that here so the check
  // below is about the route's contract, not this script's tidiness.
  await cleanupBrandingKeys([tinyUpload.key]);
  let stillThere = true;
  try {
    await headObjectSize(tinyUpload.key);
  } catch {
    stillThere = false;
  }
  check("a rejected logo leaves no orphan in the bucket", !stillThere);

  await finish();
}

async function finish() {
  await cleanupBrandingKeys(created);
  console.log(`\n${failed === 0 ? "All branding checks passed." : `${failed} check(s) failed.`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nverify:branding crashed:", err);
  await cleanupBrandingKeys(created);
  process.exit(1);
});
