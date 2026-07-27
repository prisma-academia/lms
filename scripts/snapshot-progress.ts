/**
 * Snapshot every enrollment's progressPercent to a JSON file.
 *
 * Used as a before/after regression check around the lesson-gating change:
 * once `LessonProgress` rows can exist for merely-opened lessons, any progress
 * count that forgets `completedAt: { not: null }` inflates progressPercent and
 * issues certificates. Run this before the change and again after; the diff
 * must be empty.
 *
 *   npx tsx scripts/snapshot-progress.ts <out.json>
 */
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import "dotenv/config";

// Raw client, like the seeds: the app client in lib/db/client is tenant-scoped
// and throws outside a request context. This reads across all tenants by design.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: tsx scripts/snapshot-progress.ts <out.json>");

  const rows = await prisma.enrollment.findMany({
    select: { id: true, progressPercent: true, completedAt: true },
    orderBy: { id: "asc" },
  });
  const total = await prisma.lessonProgress.count();
  const completed = await prisma.lessonProgress.count({ where: { completedAt: { not: null } } });
  const started = await prisma.lessonProgress.count({ where: { startedAt: { not: null } } });

  console.log(
    `enrollments=${rows.length} lessonProgress=${total} withCompletedAt=${completed} withStartedAt=${started}`
  );
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`wrote ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
