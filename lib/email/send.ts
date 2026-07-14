import { FROM, fromWithName, getTransport } from "./transport";
import { logger } from "@/lib/logger";

export type SendInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Address replies are routed to (e.g. the tenant's companyEmail). */
  replyTo?: string;
  /** Display name for the From header (address stays the verified EMAIL_FROM). */
  fromName?: string;
};

export async function sendEmail(input: SendInput): Promise<void> {
  try {
    await getTransport().sendMail({
      from: input.fromName ? fromWithName(input.fromName) : FROM,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
    });
  } catch (err) {
    logger.error({ err, to: input.to, subject: input.subject }, "email_send_failed");
    throw err;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
