import crypto from "node:crypto";

export function billingReference(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}
