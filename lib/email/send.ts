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

/**
 * The plain-text alternative, for clients that show it and for spam filters
 * that distrust HTML-only mail. Links keep their address — an invitation whose
 * text part has no link in it is useless — and blocks keep their line breaks.
 */
function stripHtml(html: string): string {
  const decode = (s: string) =>
    s
      .replace(/&nbsp;/g, " ")
      .replace(/&middot;/g, "·")
      .replace(/&rarr;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  return decode(
    html
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      // The hidden inbox-preview line would otherwise open the text version.
      .replace(/<div style="display:none[\s\S]*?<\/div>/i, "")
      .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, "").trim();
        const url = href.replace(/^mailto:/, "");
        return !text || text === url || decode(text) === decode(url) ? url : `${text}: ${url}`;
      })
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h1|h2|tr|table|div)>/gi, "\n")
      .replace(/<\/td>/gi, " ")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
