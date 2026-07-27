/**
 * Link FILE lessons that only have assetKey to LibraryItem by matching key.
 *
 * Usage: npx tsx scripts/backfill-lesson-library-refs.ts
 */
import "dotenv/config";
import { rawPrisma as prisma } from "../lib/db/raw-client";

async function main() {
  const lessons = await prisma.lesson.findMany({
    where: {
      contentType: "FILE",
      libraryItemId: null,
      assetKey: { not: null },
    },
    select: { id: true, tenantId: true, assetKey: true },
  });

  let linked = 0;
  for (const lesson of lessons) {
    if (!lesson.assetKey) continue;
    const item = await prisma.libraryItem.findFirst({
      where: { tenantId: lesson.tenantId, key: lesson.assetKey },
      select: { id: true },
    });
    if (!item) continue;
    await prisma.lesson.update({
      where: { id: lesson.id },
      data: { libraryItemId: item.id },
    });
    linked++;
  }

  console.log(`Linked ${linked} of ${lessons.length} FILE lessons to library items.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
