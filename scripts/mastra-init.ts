/**
 * Create or upgrade Mastra's storage tables.
 *
 *   npm run mastra:init
 *
 * The application does this by itself the first time an AI feature is used
 * against a database that is behind (see src/mastra/storage.ts), but it takes
 * about a minute on a remote database and whoever makes that first request
 * waits for it. Run this after deploying, and after upgrading any `@mastra/*`
 * package, so no user request has to.
 *
 * Safe to run repeatedly: when the tables are already at the expected revision
 * it does one query and exits.
 */
import "dotenv/config";
import { ensureStorageReady, STORAGE_REVISION } from "../src/mastra/storage";

async function main() {
  const started = Date.now();
  console.log(`Ensuring Mastra storage is at revision ${STORAGE_REVISION}…`);
  await ensureStorageReady();
  console.log(`Ready (${((Date.now() - started) / 1000).toFixed(1)}s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Mastra storage initialisation failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
