import type { Agent } from "@mastra/core/agent";
import type { z } from "zod";
import { aiStatus } from "./config";

/**
 * One way to call a model, and one vocabulary for how a call fails.
 *
 * Before this module every call site did `agent.generate(...)` and then checked
 * `result.object`. But `generate` does not always throw: it can resolve with
 * `error` set and no object, and a reply cut off at the output limit resolves
 * normally too. All of those surfaced as the same "returned no result", so a
 * missing key, an empty credit balance and a truncated lesson were
 * indistinguishable — to the learner, to staff, and in the logs.
 *
 * Like `config.ts`, this file takes no path-alias imports: Mastra workflow code
 * imports it relatively.
 */

export type AiErrorCode =
  /** No provider key in the environment. Nothing was sent. */
  | "not_configured"
  /** The provider rejected the key. */
  | "auth"
  /** The account has no credit / billing is not set up. */
  | "credits"
  | "rate_limited"
  /** Our own deadline expired, or the request was aborted. */
  | "timeout"
  /** The reply hit the output-token limit before it finished. */
  | "truncated"
  /** The reply arrived but did not match the requested shape. */
  | "invalid_output"
  /** The provider declined the request (bad request, refusal, unsupported option). */
  | "rejected"
  /** The provider is overloaded or erroring. Retrying later is reasonable. */
  | "unavailable"
  | "unknown";

/** What to tell a person. Never includes provider detail or key names. */
const USER_MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "AI features are not set up for this platform yet.",
  auth: "The AI service rejected the platform's credentials.",
  credits: "The AI service account has run out of credit.",
  rate_limited: "The AI service is busy right now. Please try again in a minute.",
  timeout: "The AI service took too long to respond. Please try again.",
  truncated: "The AI response was cut off before it finished. Try a narrower request.",
  invalid_output: "The AI returned a response in an unexpected format. Please try again.",
  rejected: "The AI service could not process this request.",
  unavailable: "The AI service is temporarily unavailable. Please try again shortly.",
  unknown: "The AI request failed unexpectedly.",
};

/** Failures where the same request, sent again later, may well succeed. */
const RETRYABLE: ReadonlySet<AiErrorCode> = new Set<AiErrorCode>([
  "rate_limited",
  "timeout",
  "unavailable",
  "truncated",
  "invalid_output",
]);

export class AiError extends Error {
  readonly code: AiErrorCode;
  /** Safe to show to an end user. */
  readonly userMessage: string;
  /** Provider detail for logs and for staff-facing diagnostics. */
  readonly detail: string;

  constructor(code: AiErrorCode, detail?: string, options?: { cause?: unknown }) {
    super(detail ? `${code}: ${detail}` : code, options);
    this.name = "AiError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
    this.detail = (detail ?? "").slice(0, 500);
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

export function aiUserMessage(code: AiErrorCode): string {
  return USER_MESSAGES[code];
}

function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(USER_MESSAGES, value);
}

/**
 * Rebuild an `AiError` from something that crossed a serialization boundary.
 *
 * A workflow does not hand back the `Error` a step threw. It hands back a plain
 * object — `{ message, name, code, detail, … }` — so `instanceof Error` is
 * false and the class is gone. Reading only `error instanceof Error` (as the
 * course-builder route once did) therefore never matched, and every failure was
 * reported as the same generic "workflow failed".
 */
export function reviveAiError(value: unknown): AiError {
  if (value instanceof AiError) return value;

  const fromMessage = (message: string): AiError | null => {
    // `AiError` formats its message as `code: detail`.
    const match = /^([a-z_]+)(?::\s*([\s\S]*))?$/.exec(message.trim());
    return match && isAiErrorCode(match[1]) ? new AiError(match[1], match[2]) : null;
  };

  if (typeof value === "string") return fromMessage(value) ?? classifyAiError(new Error(value));

  if (value && typeof value === "object") {
    const candidate = value as { code?: unknown; detail?: unknown; message?: unknown };
    if (isAiErrorCode(candidate.code)) {
      return new AiError(candidate.code, typeof candidate.detail === "string" ? candidate.detail : undefined);
    }
    if (typeof candidate.message === "string") {
      return fromMessage(candidate.message) ?? classifyAiError(value);
    }
  }

  return classifyAiError(value);
}

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { statusCode?: unknown; status?: unknown; cause?: unknown };
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  if (typeof candidate.status === "number") return candidate.status;
  // Mastra and the AI SDK both wrap the provider error; look one level down.
  return candidate.cause && candidate.cause !== error ? statusOf(candidate.cause) : null;
}

function textOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const candidate = error as { message?: unknown; responseBody?: unknown; cause?: unknown };
  const parts = [
    typeof candidate.message === "string" ? candidate.message : "",
    typeof candidate.responseBody === "string" ? candidate.responseBody : "",
  ];
  if (candidate.cause && candidate.cause !== error) parts.push(textOf(candidate.cause));
  return parts.filter(Boolean).join(" | ");
}

/**
 * Map anything thrown by (or returned from) a model call onto an `AiError`.
 * Order matters: the message checks come first because several providers
 * report "no credit" and "bad key" with a generic 400.
 */
export function classifyAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;

  const text = textOf(error);
  const lower = text.toLowerCase();
  const status = statusOf(error);
  const name = error && typeof error === "object" ? String((error as { name?: unknown }).name ?? "") : "";
  const wrap = (code: AiErrorCode) => new AiError(code, text, { cause: error });

  if (lower.includes("could not find api key") || lower.includes("api key is missing")) {
    return wrap("not_configured");
  }
  if (name === "TimeoutError" || name === "AbortError" || lower.includes("timed out") || lower.includes("aborted")) {
    return wrap("timeout");
  }
  if (
    status === 402 ||
    lower.includes("credit balance") ||
    lower.includes("insufficient credit") ||
    lower.includes("insufficient_quota") ||
    lower.includes("billing")
  ) {
    return wrap("credits");
  }
  if (status === 401 || status === 403 || lower.includes("invalid x-api-key") || lower.includes("authentication_error")) {
    return wrap("auth");
  }
  if (status === 429 || lower.includes("rate limit") || lower.includes("rate_limit")) {
    return wrap("rate_limited");
  }
  if (status === 529 || (status !== null && status >= 500) || lower.includes("overloaded")) {
    return wrap("unavailable");
  }
  if (
    name === "ZodError" ||
    lower.includes("structured output validation") ||
    lower.includes("no object generated") ||
    lower.includes("could not parse the response") ||
    lower.includes("failed to parse")
  ) {
    return wrap("invalid_output");
  }
  if (status !== null && status >= 400) return wrap("rejected");

  return wrap("unknown");
}

export type AiCallOptions = {
  /** Hard ceiling on the reply. Without one a long reply is silently cut off. */
  maxOutputTokens: number;
  /** Our own deadline for the whole call, retries included. */
  timeoutMs: number;
  /** Provider-level retries for transient failures (network, 429, 5xx). */
  maxRetries?: number;
};

type GenerateResult = {
  text?: string;
  object?: unknown;
  finishReason?: string;
  error?: unknown;
};

type GenerateOptions = Record<string, unknown>;

/**
 * The one place `agent.generate` is called. Typed loosely on purpose: Mastra's
 * generic signature ties the result type to the options, and both call shapes
 * below go through here.
 */
async function call(agent: Agent, prompt: string, options: GenerateOptions): Promise<GenerateResult> {
  const status = aiStatus();
  if (!status.configured) {
    throw new AiError("not_configured", `${status.keyEnvVar} is not set (model ${status.model}).`);
  }

  let result: GenerateResult;
  try {
    const generate = agent.generate.bind(agent) as unknown as (
      messages: { role: "user"; content: string }[],
      options: GenerateOptions
    ) => Promise<GenerateResult>;
    result = await generate([{ role: "user", content: prompt }], options);
  } catch (e) {
    throw classifyAiError(e);
  }

  // `generate` can resolve with an error instead of rejecting.
  if (result.error) throw classifyAiError(result.error);
  // …and when our own deadline fires it resolves with nothing at all: no text,
  // no object, no error. Without this check a timeout is reported as "the model
  // returned an unexpected format", which sends whoever reads it looking in the
  // wrong place.
  const signal = options.abortSignal;
  if (signal instanceof AbortSignal && signal.aborted) {
    throw new AiError("timeout", "The call did not finish before its deadline.");
  }
  if (result.finishReason === "length") {
    throw new AiError("truncated", "The model stopped at the output-token limit.");
  }
  return result;
}

function settings(options: AiCallOptions): GenerateOptions {
  return {
    // No temperature / topP / topK: current Claude models reject sampling
    // parameters, and Mastra silently drops them — so setting one buys nothing
    // and reads as a guarantee the call does not have.
    modelSettings: {
      maxOutputTokens: options.maxOutputTokens,
      maxRetries: options.maxRetries ?? 2,
    },
    abortSignal: AbortSignal.timeout(options.timeoutMs),
  };
}

/** True when a provider rejected the request because of how the schema was sent. */
function looksLikeSchemaRejection(error: AiError): boolean {
  if (error.code !== "rejected") return false;
  const detail = error.detail.toLowerCase();
  return ["schema", "response_format", "output_config", "output_format", "tool_choice"].some((needle) =>
    detail.includes(needle)
  );
}

/**
 * Ask for a JSON object matching `schema`.
 *
 * Keep the schema LEAN — required fields, no length or range limits — and apply
 * limits in code afterwards. A model that writes 601 characters into a field
 * capped at 600 has not failed in any way that matters, but a strict schema
 * turns that into a failed call.
 */
export async function generateStructured<S extends z.ZodType>(
  agent: Agent,
  prompt: string,
  options: AiCallOptions & { schema: S }
): Promise<z.infer<S>> {
  const attempt = async (jsonPromptInjection: boolean): Promise<z.infer<S>> => {
    const result = await call(agent, prompt, {
      ...settings(options),
      structuredOutput: {
        schema: options.schema,
        errorStrategy: "strict",
        ...(jsonPromptInjection ? { jsonPromptInjection: true } : {}),
      },
    });
    if (result.object == null) {
      throw new AiError("invalid_output", "The model returned no structured object.");
    }
    const parsed = options.schema.safeParse(result.object);
    if (!parsed.success) {
      throw new AiError("invalid_output", parsed.error.message, { cause: parsed.error });
    }
    return parsed.data as z.infer<S>;
  };

  try {
    return await attempt(false);
  } catch (e) {
    const error = classifyAiError(e);
    // Some gateways reject native structured output for a schema the model
    // itself handles fine. Putting the schema in the prompt instead is less
    // strict but gets an answer, and the zod parse above still validates it.
    if (looksLikeSchemaRejection(error)) return attempt(true);
    throw error;
  }
}

/**
 * Ask for free text.
 *
 * Use this for long prose and HTML rather than wrapping it in a JSON field:
 * inside JSON every quote and newline has to be escaped, which is exactly where
 * a long generation goes wrong, and one bad escape loses the whole reply.
 */
export async function generateText(agent: Agent, prompt: string, options: AiCallOptions): Promise<string> {
  const result = await call(agent, prompt, settings(options));
  const text = (result.text ?? "").trim();
  if (!text) throw new AiError("invalid_output", "The model returned an empty reply.");
  return text;
}
