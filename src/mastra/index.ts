import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { courseBuilderWorkflow } from './workflows/course-builder-workflow';
import { courseBuilderAgent } from './agents/course-builder-agent';
import { essayGraderAgent } from './agents/essay-grader-agent';
import { certificateDesignerAgent } from './agents/certificate-designer-agent';
import { siteBuilderAgent } from './agents/site-builder-agent';
import { questionWriterAgent } from './agents/question-writer-agent';
import { ensureStorageReady, getPgStore } from './storage';
// Relative, not `@/lib/...` — see the path-alias note in lib/schemas/course-builder.ts.
import { AiError } from '../../lib/ai/run';

export const mastra = new Mastra({
  workflows: { courseBuilderWorkflow },
  agents: { courseBuilderAgent, essayGraderAgent, certificateDesignerAgent, siteBuilderAgent, questionWriterAgent },
  // Postgres covers memory, workflows, and observability (no LibSQL/DuckDB needed).
  // Its tables are NOT created automatically — see ./storage.ts.
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

/**
 * The Mastra instance, once its storage is ready to be written to.
 *
 * Application code must use this rather than the `mastra` export above: the
 * export exists for the Mastra CLI, and using it directly on a database whose
 * tables have not been created would fail on the first workflow snapshot.
 */
export async function getMastra(): Promise<typeof mastra> {
  try {
    await ensureStorageReady();
  } catch (error) {
    // The database, not the model, is what failed — and it is worth retrying:
    // `ensureStorageReady` does not cache a failure.
    throw new AiError(
      'unavailable',
      `AI storage is not ready: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  return mastra;
}
