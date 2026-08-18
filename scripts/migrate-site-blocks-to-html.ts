/**
 * Backfill `SitePage.htmlSource` from the retired `blocksJson`.
 *
 * Run once per environment, after the migration that adds `htmlSource` and
 * before the one that drops `blocksJson`:
 *
 *   npm run db:migrate:site-html
 *
 * Idempotent — a page that already has HTML is skipped, so a re-run after a
 * partial failure picks up where it stopped rather than overwriting edits an
 * admin has made in the meantime.
 *
 * Exits non-zero if any page with blocks converted to nothing. That is the
 * signal not to run the drop migration yet: `blocksJson` is still the only copy
 * of that page's content, and dropping the column would destroy it.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import "dotenv/config";
import { parseSiteBlocks } from "../lib/site/blocks";
import { blocksToHtml } from "../lib/site/blocks-to-html";

// Raw client, like the seeds and snapshot scripts: the app client in
// lib/db/client is tenant-scoped and throws outside a request context. This
// has to walk every tenant, which is exactly what that guard forbids.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Row = {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  htmlSource: string;
  blocksJson: unknown;
};

async function main() {
  // Raw query rather than the typed client: this reads `blocksJson`, a column
  // the schema is in the middle of removing, so the generated types may or may
  // not still know about it depending on when `prisma generate` last ran.
  const pages = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT "id", "tenantId", "title", "slug", "htmlSource", "blocksJson" FROM "SitePage" ORDER BY "tenantId", "slug"`
  );

  let converted = 0;
  let skipped = 0;
  let empty = 0;
  const failures: string[] = [];

  for (const page of pages) {
    const label = `${page.tenantId} /${page.slug} (${page.title})`;

    if (page.htmlSource && page.htmlSource.trim().length > 0) {
      skipped++;
      continue;
    }

    const blocks = parseSiteBlocks(page.blocksJson);
    if (blocks.length === 0) {
      // Nothing to lose: the page rendered from the Classic fallback before and
      // still will, because `render-page.tsx` keeps that fallback.
      empty++;
      console.log(`  – ${label}: no blocks, left empty`);
      continue;
    }

    const html = blocksToHtml(blocks);
    if (!html.trim()) {
      failures.push(`${label}: ${blocks.length} blocks produced no HTML`);
      continue;
    }

    await prisma.sitePage.update({
      where: { id: page.id },
      data: { htmlSource: html },
    });
    converted++;
    console.log(`  ✓ ${label}: ${blocks.length} blocks → ${html.length} chars`);
  }

  console.log(
    `\n${pages.length} pages: ${converted} converted, ${skipped} already had HTML, ` +
      `${empty} had no blocks, ${failures.length} failed.`
  );

  if (failures.length > 0) {
    console.error("\nFAILED — do not drop blocksJson yet:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
