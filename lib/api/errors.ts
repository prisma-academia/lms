import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/guards";
import { fail } from "./respond";
import { logger } from "@/lib/logger";

export function handleError(err: unknown) {
  if (err instanceof AuthError) {
    return fail(err.status, err.status === 401 ? "unauthorized" : "forbidden", err.message);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail(400, "validation_error", `${first?.path.join(".") ?? "input"}: ${first?.message ?? "invalid"}`);
  }
  if (err instanceof DomainError) {
    return fail(err.status, err.code, err.message);
  }
  // An unhandled error is, by definition, one nobody wrote a message for. The
  // reference is the only thread connecting what the user saw to the stack in
  // the logs — without it "Something went wrong" is unreportable and therefore
  // unfixable. The cause itself is never returned: it can carry connection
  // strings, keys and row contents.
  const ref = randomUUID().slice(0, 8);
  logger.error({ err, ref }, "unhandled_api_error");
  return fail(
    500,
    "server_error",
    `Something went wrong on our side (reference ${ref}). Try again — if it keeps happening, quote that reference when reporting it.`
  );
}

export class DomainError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
