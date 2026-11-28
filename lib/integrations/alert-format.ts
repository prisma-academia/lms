import type { AlertProvider } from "@/lib/integrations/registry";

/**
 * Team-alert messages: what to say about an event, and how each chat platform
 * wants it said. Pure, so the verification script can check every format.
 */

export type AlertFact = { label: string; value: string };

export type AlertMessage = {
  /** One line, e.g. "New enrolment". */
  title: string;
  /** One or two sentences. Plain text; each formatter escapes for its platform. */
  text: string;
  facts: AlertFact[];
  /** Where to look in the admin, absolute. */
  link?: string | null;
  /** The academy's name, for the footer. */
  academy: string;
  eventType: string;
  at: Date;
};

/** What the dispatcher has looked up about the event's subjects. */
export type AlertContext = {
  academy: string;
  adminOrigin: string;
  learner?: { id: string; name: string; email: string } | null;
  course?: { id: string; title: string } | null;
  exam?: { id: string; title: string } | null;
  candidateName?: string | null;
};

function money(cents: unknown, currency: unknown): string | null {
  if (typeof cents !== "number") return null;
  const code = typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "NGN";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

const TITLES: Record<string, string> = {
  "learner.created": "New learner",
  "learner.updated": "Learner updated",
  "enrollment.created": "New enrolment",
  "enrollment.completed": "Course completed",
  "course.completed": "Course completed",
  "lesson.completed": "Lesson completed",
  "quiz.attempt.graded": "Quiz graded",
  "exam.published": "Exam published",
  "exam.attempt.started": "Exam started",
  "exam.attempt.submitted": "Exam submitted",
  "exam.integrity.flagged": "Exam integrity flag",
  "exam.result.released": "Exam result released",
  "certificate.issued": "Certificate issued",
  "payment.succeeded": "Payment received",
  "payment.failed": "Payment failed",
  "fee.paid": "Fee paid",
  "event.created": "New calendar event",
  "referral.recorded": "Referral credited",
  ping: "Test alert",
};

export function describeEvent(type: string, data: Record<string, unknown>, ctx: AlertContext, at = new Date()): AlertMessage {
  const who = ctx.learner?.name || ctx.candidateName || null;
  const facts: AlertFact[] = [];
  if (ctx.learner) facts.push({ label: "Learner", value: ctx.learner.email ? `${ctx.learner.name} (${ctx.learner.email})` : ctx.learner.name });
  else if (ctx.candidateName) facts.push({ label: "Candidate", value: ctx.candidateName });
  if (ctx.course) facts.push({ label: "Course", value: ctx.course.title });
  if (ctx.exam) facts.push({ label: "Exam", value: ctx.exam.title });

  let text: string;
  let link: string | null = null;
  const o = ctx.adminOrigin;
  switch (type) {
    case "learner.created":
      text = `${who ?? "A learner"} joined the academy${data.source === "self_registration" ? " (self-registered)" : ""}.`;
      if (ctx.learner) link = `${o}/admin/clients/${ctx.learner.id}`;
      break;
    case "learner.updated":
      text = `${who ?? "A learner"}'s details were updated.`;
      if (ctx.learner) link = `${o}/admin/clients/${ctx.learner.id}`;
      break;
    case "enrollment.created":
      text = `${who ?? "A learner"} enrolled on ${ctx.course?.title ?? "a course"}.`;
      if (ctx.course) link = `${o}/admin/courses/${ctx.course.id}`;
      break;
    case "enrollment.completed":
    case "course.completed":
      text = `${who ?? "A learner"} completed ${ctx.course?.title ?? "a course"}.`;
      if (ctx.course) link = `${o}/admin/courses/${ctx.course.id}`;
      break;
    case "lesson.completed":
      text = `${who ?? "A learner"} completed a lesson in ${ctx.course?.title ?? "a course"}.`;
      if (typeof data.progressPercent === "number") facts.push({ label: "Progress", value: `${Math.round(data.progressPercent)}%` });
      break;
    case "exam.attempt.submitted":
      text = `${who ?? "A candidate"} ${data.terminated ? "had their attempt ended" : "submitted"}${ctx.exam ? ` ${ctx.exam.title}` : " an exam"}.`;
      if (ctx.exam) link = `${o}/admin/exams/${ctx.exam.id}`;
      break;
    case "exam.integrity.flagged":
      text = `${who ?? "A candidate"} crossed the integrity threshold${ctx.exam ? ` in ${ctx.exam.title}` : ""}.`;
      if (ctx.exam) link = `${o}/admin/exams/${ctx.exam.id}`;
      break;
    case "exam.result.released": {
      text = `A result was released${ctx.exam ? ` for ${ctx.exam.title}` : ""}${who ? ` to ${who}` : ""}.`;
      if (typeof data.scorePercent === "number") {
        facts.push({ label: "Score", value: `${Math.round(data.scorePercent)}%${typeof data.grade === "string" && data.grade ? ` · ${data.grade}` : ""}` });
      }
      if (typeof data.passed === "boolean") facts.push({ label: "Outcome", value: data.passed ? "Pass" : "Not passed" });
      if (ctx.exam) link = `${o}/admin/exams/${ctx.exam.id}`;
      break;
    }
    case "certificate.issued":
      text = `${who ?? "A learner"} was issued a certificate${ctx.course ? ` for ${ctx.course.title}` : ""}.`;
      if (typeof data.serial === "string") facts.push({ label: "Serial", value: data.serial });
      break;
    case "payment.succeeded":
    case "payment.failed":
    case "fee.paid": {
      const amount = money(data.amountCents, data.currency);
      text =
        type === "payment.failed"
          ? `A payment${who ? ` by ${who}` : ""} failed.`
          : `${amount ?? "A payment"} received${who ? ` from ${who}` : ""}.`;
      if (amount) facts.push({ label: "Amount", value: amount });
      if (typeof data.reference === "string") facts.push({ label: "Reference", value: data.reference });
      link = `${o}/admin/course-payments`;
      break;
    }
    case "event.created":
      text = `“${typeof data.title === "string" ? data.title : "An event"}” was added to the calendar.`;
      if (typeof data.startAt === "string") facts.push({ label: "Starts", value: new Date(data.startAt).toUTCString() });
      link = `${o}/admin/events`;
      break;
    case "ping":
      text = "This channel is connected. Alerts you picked will appear here.";
      break;
    default:
      text = `Event ${type}.`;
  }
  return { title: TITLES[type] ?? type, text, facts, link, academy: ctx.academy, eventType: type, at };
}

/* ───────────────────────────── platforms ───────────────────────────── */

/** Slack mrkdwn needs &, < and > escaped; nothing else. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatSlack(m: AlertMessage): Record<string, unknown> {
  const facts = m.facts.map((f) => `*${slackEscape(f.label)}:* ${slackEscape(f.value)}`).join("\n");
  const blocks: Record<string, unknown>[] = [
    { type: "header", text: { type: "plain_text", text: m.title.slice(0, 150), emoji: false } },
    { type: "section", text: { type: "mrkdwn", text: slackEscape(m.text) } },
  ];
  if (facts) blocks.push({ type: "section", text: { type: "mrkdwn", text: facts } });
  const context = [`${slackEscape(m.academy)} · \`${slackEscape(m.eventType)}\``];
  if (m.link) context.push(`<${m.link}|Open in admin>`);
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: context.join(" · ") }] });
  return { text: `${m.title}: ${m.text}`, blocks, unfurl_links: false };
}

/** Discord markdown: escape the characters that would format or mention. */
export function discordEscape(s: string): string {
  return s.replace(/([\\*_~`|>])/g, "\\$1").replace(/@/g, "@\u200b");
}

export function formatDiscord(m: AlertMessage): Record<string, unknown> {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: m.title.slice(0, 256),
        description: discordEscape(m.text).slice(0, 4000),
        ...(m.link ? { url: m.link } : {}),
        color: 0x8c6bff,
        fields: m.facts.slice(0, 25).map((f) => ({ name: f.label.slice(0, 256), value: discordEscape(f.value).slice(0, 1024) || "—", inline: true })),
        footer: { text: `${m.academy} · ${m.eventType}`.slice(0, 2048) },
        timestamp: m.at.toISOString(),
      },
    ],
  };
}

/**
 * Teams: an Adaptive Card in a "message" envelope — what Teams Workflows
 * ("Post to a channel when a webhook request is received") and classic
 * Incoming Webhook connectors both accept.
 */
export function formatTeams(m: AlertMessage): Record<string, unknown> {
  const body: Record<string, unknown>[] = [
    { type: "TextBlock", text: m.title, weight: "Bolder", size: "Medium", wrap: true },
    { type: "TextBlock", text: m.text, wrap: true },
  ];
  if (m.facts.length > 0) body.push({ type: "FactSet", facts: m.facts.map((f) => ({ title: f.label, value: f.value })) });
  body.push({ type: "TextBlock", text: `${m.academy} · ${m.eventType}`, isSubtle: true, size: "Small", wrap: true });
  const card: Record<string, unknown> = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body,
  };
  if (m.link) card.actions = [{ type: "Action.OpenUrl", title: "Open in admin", url: m.link }];
  return {
    type: "message",
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }],
  };
}

/** Google Chat text formatting: *bold*, <url|label> links. */
export function formatGoogleChat(m: AlertMessage): Record<string, unknown> {
  const clean = (s: string) => s.replace(/[*_~`]/g, (c) => `\u200b${c}`).replace(/</g, "‹").replace(/>/g, "›");
  const lines = [`*${clean(m.title)}*`, clean(m.text)];
  for (const f of m.facts) lines.push(`*${clean(f.label)}:* ${clean(f.value)}`);
  const footer = `_${clean(m.academy)} · ${m.eventType}_`;
  lines.push(m.link ? `${footer} · <${m.link}|Open in admin>` : footer);
  return { text: lines.join("\n") };
}

export function formatFor(provider: AlertProvider, m: AlertMessage): Record<string, unknown> {
  switch (provider) {
    case "slack":
      return formatSlack(m);
    case "discord":
      return formatDiscord(m);
    case "teams":
      return formatTeams(m);
    case "google_chat":
      return formatGoogleChat(m);
  }
}

/* ───────────────────────────── URL checks ───────────────────────────── */

/**
 * Each platform's incoming webhooks live on known hosts. Pinning them keeps an
 * alert channel from being a general-purpose "POST anywhere" box (safeFetch
 * still runs its SSRF checks on top).
 */
export function validateAlertUrl(provider: AlertProvider, raw: string): { ok: true; url: string } | { ok: false; message: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, message: "That is not a valid URL." };
  }
  if (u.protocol !== "https:") return { ok: false, message: "The webhook URL must start with https://." };
  if (u.username || u.password || (u.port && u.port !== "443")) return { ok: false, message: "That URL is not a webhook URL." };
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  let good = false;
  switch (provider) {
    case "slack":
      good = host === "hooks.slack.com" && /^\/(services|workflows|triggers)\//.test(path);
      break;
    case "discord":
      good = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"].includes(host) && /^\/api\/webhooks\/\d+\/[\w-]+/.test(path);
      break;
    case "teams":
      good =
        (/^([a-z0-9-]+\.)*webhook\.office\.com$/.test(host) ||
          host === "outlook.office.com" ||
          /\.logic\.azure\.com$/.test(host) ||
          /\.(environment\.)?api\.powerplatform\.com$/.test(host)) &&
        path.length > 1;
      break;
    case "google_chat":
      good = host === "chat.googleapis.com" && /^\/v1\/spaces\/[^/]+\/messages$/.test(path);
      break;
  }
  if (!good) return { ok: false, message: `That does not look like a ${PROVIDER_NAMES[provider]} incoming-webhook URL.` };
  return { ok: true, url: u.toString() };
}

const PROVIDER_NAMES: Record<AlertProvider, string> = {
  slack: "Slack",
  discord: "Discord",
  teams: "Microsoft Teams",
  google_chat: "Google Chat",
};
