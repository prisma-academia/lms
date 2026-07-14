import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

let cached: Transporter | null = null;

export function getTransport(): Transporter {
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
  return cached;
}

export const FROM = `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`;

/** From header with a custom display name (e.g. the tenant's name) but the
 * verified EMAIL_FROM address, so SMTP deliverability is preserved. */
export function fromWithName(name: string): string {
  const clean = name.replace(/[<>"\r\n]/g, "").trim() || env.EMAIL_FROM_NAME;
  return `${clean} <${env.EMAIL_FROM}>`;
}
