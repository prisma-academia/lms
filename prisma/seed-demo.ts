/**
 * Demo tenant seed — Nigeria-localized, full module coverage.
 *
 * Run: npm run db:seed:demo
 *
 * Uses the UN-extended `rawPrisma` and sets `tenantId` explicitly on every
 * scoped row (outside request context — same pattern as prisma/seed.ts).
 */
import "dotenv/config";
import { rawPrisma as prisma } from "../lib/db/raw-client";
import { hashPassword } from "../lib/auth/password";
import { SLUG, PASSWORD, createInitialContext } from "./seed/index";
import { seedTenant } from "./seed/levels/tenant";
import { seedUsers } from "./seed/levels/users";
import { seedContent } from "./seed/levels/content";

async function main() {
  console.log("Seeding demo tenant…");

  const passwordHash = await hashPassword(PASSWORD);
  const tenantId = await seedTenant(prisma);

  const ctx = createInitialContext(prisma, tenantId, passwordHash);
  await seedUsers(ctx);
  await seedContent(ctx);

  const appDomain = process.env.APP_DOMAIN ?? "lvh.me:3000";
  console.log("\n✔ Demo tenant seeded.\n");
  console.log("  Tenant host : http://" + SLUG + "." + appDomain);
  console.log("  Student     : rashida@demo.test / " + PASSWORD + "   → /auth/login");
  console.log("  Admin       : admin@demo.test / " + PASSWORD + "      → /admin/auth/login");
  console.log("  Instructor  : instructor@demo.test / " + PASSWORD + " → /admin/auth/login");
  console.log("");
  console.log("  Smoke: dashboard, programmes, certificates, calendar, inbox, notifications, quizzes");
  console.log("  Admin: fees, resources, activity, programmes");
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
