
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { courseBuilderWorkflow } from './workflows/course-builder-workflow';
import { courseBuilderAgent } from './agents/course-builder-agent';


export const mastra = new Mastra({
  workflows: { weatherWorkflow, courseBuilderWorkflow },
  agents: { weatherAgent, courseBuilderAgent },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      // Uses a hosted database when deployed (mastra env db create --kind turso),
      // and a local file during development. The dev path is absolute so Studio
      // and the Next.js app share one database despite differing working directories.
      url:
        process.env.TURSO_DATABASE_URL ??
        "file:C:/Users/ALIENWARE/nodejs/prisma-lms/mastra.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
    domains: {
      // Sync accessor (no top-level await) so this module can be imported from
      // the Next.js server runtime. Absolute path for the same reason as above.
      observability: new DuckDBStore({
        path: 'C:/Users/ALIENWARE/nodejs/prisma-lms/mastra.duckdb',
      }).observability,
    }
  }),
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
