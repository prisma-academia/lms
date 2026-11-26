import { DomainError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { aiStatus } from "./config";
import { AiError, classifyAiError, type AiErrorCode } from "./run";

/**
 * AI failures, as HTTP responses.
 *
 * App-side only (it imports the API error type and the logger); Mastra code
 * uses `./run` and `./config` directly.
 */

const STATUS: Record<AiErrorCode, number> = {
  not_configured: 503,
  auth: 503,
  credits: 503,
  rate_limited: 429,
  timeout: 504,
  truncated: 502,
  invalid_output: 502,
  rejected: 502,
  unavailable: 503,
  unknown: 502,
};

/**
 * Throw before starting any AI work when no provider key is configured, so the
 * caller hears "AI is not set up" immediately instead of after a spinner.
 */
export function requireAiConfigured(): void {
  const status = aiStatus();
  if (!status.configured) {
    // The variable name goes to the log for the operator, not to the response.
    logger.warn({ keyEnvVar: status.keyEnvVar, model: status.model }, "ai_not_configured");
    throw toDomainError(new AiError("not_configured"));
  }
}

function toDomainError(error: AiError): DomainError {
  return new DomainError(STATUS[error.code], `ai_${error.code}`, error.userMessage);
}

/**
 * Convert anything thrown by an AI call into a `DomainError` with a message a
 * person can act on, and log the provider's own detail under `context`.
 */
export function aiDomainError(e: unknown, context: string): DomainError {
  if (e instanceof DomainError) return e;
  const error = classifyAiError(e);
  logger.error({ code: error.code, detail: error.detail, context }, "ai_call_failed");
  return toDomainError(error);
}

