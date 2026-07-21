import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { courseBuilderWorkflow } from './workflows/course-builder-workflow';
import { courseBuilderAgent } from './agents/course-builder-agent';

declare global {
  // eslint-disable-next-line no-var
  var __mastraPgStore: PostgresStore | undefined;
}

function getPgStore(): PostgresStore {
  if (!globalThis.__mastraPgStore) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for Mastra Postgres storage');
    }

    globalThis.__mastraPgStore = new PostgresStore({
      id: 'mastra-storage',
      connectionString,
      // Keep Mastra tables out of the Prisma public schema collision surface.
      schemaName: 'mastra',
    });
  }

  return globalThis.__mastraPgStore;
}

export const mastra = new Mastra({
  workflows: { courseBuilderWorkflow },
  agents: { courseBuilderAgent },
  // Postgres covers memory, workflows, and observability (no LibSQL/DuckDB needed).
  storage: getPgStore(),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
