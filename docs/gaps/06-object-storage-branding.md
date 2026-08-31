# 06 — Object storage & tenant branding/settings

**Severity: Resolved** · PRD §5.8, §8.3, §16.6

> This gap has been closed. The text below is kept as a record of what was
> missing and where the implementation now lives, because the original
> "not in package.json" claim outlived the work by long enough to mislead.

## Expected
- §5.8 tenant settings: name, **logo**, contact email, **branding (primary color)**, **timezone**, **locale**, **default currency**, **module enable/disable flags**.
- §8.3 / §16.6: object storage via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` for tenant logos/assets.

## Current state
- `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` **are installed**. Storage lives in
  `lib/storage/s3.ts` (presigned PUTs, per-kind size limits, resumable multipart, SVG deliberately
  excluded as a stored-XSS vector), with quota enforcement in `lib/storage/quota.ts`.
- Tenant settings are a typed Zod schema over `Tenant.settingsJson` — `lib/tenant/settings.ts`
  (`logoKey`, `faviconKey`, `brandingAssets`, `primaryColor`, `themePreset`, locale, meta).
- Logo upload: `app/api/tenant/settings/logo/route.ts` (presign) →
  `app/api/tenant/settings/logo/finalize/route.ts` (read back, validate, generate variants) →
  `lib/tenant/branding-assets.ts` (`finalizeLogoBranding`, `brandingAssetUrls`,
  `cleanupBrandingKeys`). Favicon override: `app/api/tenant/settings/favicon/route.ts`.
- Admin UI: `app/admin/(dashboard)/settings/form.tsx`; browser pre-flight in
  `lib/client/image-upload.ts`.

## Verifying it
`npm run verify:branding` (`scripts/verify-branding.ts`) exercises the real bucket: presign, PUT,
finalize, then **fetches every resulting public URL over HTTP**. That last step is the one that
catches the common production failure — objects that upload successfully but are not publicly
readable, so every `<img>` renders broken.

It cannot cover the browser's cross-origin PUT (a presigned PUT from Node ignores CORS), so pair
it with one manual upload through `/admin/settings` after any bucket configuration change.

## Still outstanding
`enabledModules` (§5.8 module enable/disable flags) is not enforced in nav/route rendering.
