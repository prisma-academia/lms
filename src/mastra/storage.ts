import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';

/**
 * Mastra's Postgres storage, initialised once per version instead of once per
 * process.
 *
 * Left to itself, `PostgresStore` checks and creates every one of its tables
 * and indexes the first time it is used in each process. Against a database
 * that is not on the same machine that is hundreds of round trips: it was
 * measured at 65 seconds here. Every server start paid it on its first AI
 * request, and on serverless hosting every cold start did — which on its own
 * was enough to push essay grading past its deadline and to eat a fifth of the
 * course builder's time limit before a single lesson was written.
 *
 * So automatic initialisation is switched off (`disableInit`, the option Mastra
 * documents for running migrations separately), and `ensureStorageReady` does
 * the work only when it is actually needed:
 *
 *  - one small query reads which revision of the tables the database has;
 *  - if it matches `STORAGE_REVISION`, nothing else happens;
 *  - otherwise the full `init()` runs once, and the revision is recorded.
 *
 * `npm run mastra:init` runs the same thing ahead of time, so a deploy can pay
 * the cost before any user request does.
 */

/**
 * Identifies the table layout this code expects. Bump it whenever a `@mastra/*`
 * package is upgraded: that forces one `init()` on the next start, which is
 * how new columns and indexes get created. `npm run verify:ai` fails if this
 * falls out of step with the installed versions.
 */
export const STORAGE_REVISION = 'core-1.51.0+pg-1.16.0';

/** Keep Mastra's tables out of the application's `public` schema. */
const SCHEMA = 'mastra';

/** Where the applied revision is recorded. Created by `ensureStorageReady`. */
const STATE_TABLE = `"${SCHEMA}"."lms_storage_state"`;

declare global {
  var __mastraPgPool: Pool | undefined;
  var __mastraPgStore: PostgresStore | undefined;
  var __mastraStorageReady: Promise<void> | undefined;
}

function getPool(): Pool {
  if (!globalThis.__mastraPgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for Mastra Postgres storage');
    }
    // A small pool of its own: AI calls are infrequent, and this must not
    // compete with the application's own connections for the database's limit.
    globalThis.__mastraPgPool = new Pool({ connectionString, max: 5 });
  }
  return globalThis.__mastraPgPool;
}

export function getPgStore(): PostgresStore {
  if (!globalThis.__mastraPgStore) {
    globalThis.__mastraPgStore = new PostgresStore({
      id: 'mastra-storage',
      pool: getPool(),
      schemaName: SCHEMA,
      // See the note at the top of this file.
      disableInit: true,
    });
  }
  return globalThis.__mastraPgStore;
}

async function appliedRevision(): Promise<string | null> {
  try {
    const result = await getPool().query<{ revision: string }>(
      `SELECT revision FROM ${STATE_TABLE} WHERE id = 1`
    );
    return result.rows[0]?.revision ?? null;
  } catch {
    // The schema or the table does not exist yet: nothing has been applied.
    return null;
  }
}

async function initialise(): Promise<void> {
  if ((await appliedRevision()) === STORAGE_REVISION) return;

  const pool = getPool();

  // A second store, on the same pool, whose only job is to run `init()`.
  //
  // It cannot be done on the runtime store: with `disableInit` set, that
  // store's `init()` returns immediately — it is not merely "not automatic", it
  // does nothing (the reference says otherwise; the source and a test against
  // an empty schema both say this). Creating the tables therefore needs a store
  // that was constructed without the flag.
  const initialiser = new PostgresStore({
    id: 'mastra-storage-init',
    pool,
    schemaName: SCHEMA,
  });
  await initialiser.init();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
       id integer PRIMARY KEY,
       revision text NOT NULL,
       initialised_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  await pool.query(
    `INSERT INTO ${STATE_TABLE} (id, revision) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET revision = EXCLUDED.revision, initialised_at = now()`,
    [STORAGE_REVISION]
  );
}

/**
 * Resolves once Mastra's tables exist at the expected revision. Cheap after the
 * first call in a process, and one query in a process that finds them current.
 *
 * A failure is not cached: the next caller tries again, so a database blip at
 * start-up does not leave AI disabled until the process is restarted.
 */
export function ensureStorageReady(): Promise<void> {
  if (!globalThis.__mastraStorageReady) {
    globalThis.__mastraStorageReady = initialise().catch((error) => {
      globalThis.__mastraStorageReady = undefined;
      throw error;
    });
  }
  return globalThis.__mastraStorageReady;
}
