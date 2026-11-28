import type { EmailBranding } from "./branding";

/**
 * Every email the product sends.
 *
 * They share one shell, drawn in the product's own visual language — the
 * heavy ink outline, hard offset shadow, bold display heading and one strong
 * colour that the app uses for its cards and buttons — with the academy's logo
 * and brand colour in place of the product's.
 *
 * Email clients are not browsers: no <style> blocks survive everywhere, no web
 * fonts, no flexbox. So the layout is tables, every style is inline, and the
 * fonts name the app's typefaces first and fall back to what a mail client is
 * sure to have. Where a client drops `box-shadow` or `border-radius` (Outlook
 * on Windows), what is left is a plain bordered card that still reads well.
 */

const INK = "#16130f";
const PAPER = "#f6f3ec";
const CARD = "#ffffff";
const BODY = "#2b2722";
const MUTED = "#6a645b";
const FAINT = "#8d867b";
const TINT = "#f3efe6";

const FONT_BODY = `'Space Grotesk','Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_HEAD = `'Archivo Black','Arial Black','Segoe UI',Helvetica,Arial,sans-serif`;
const FONT_MONO = `'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;

/* ------------------------------------------------------------------ helpers */

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The academy's colour if it is a usable hex value, otherwise the product's. */
function brandColor(branding: EmailBranding): string {
  const c = (branding.primaryColor || "").trim();
  return /^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : "#2563eb";
}

/** Ink or white, whichever is readable on the given background. */
function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return luminance > 0.42 ? INK : "#ffffff";
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function greeting(name?: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `Hi ${escape(first)},` : "Hi,";
}

/* ------------------------------------------------------------------- pieces */

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px 0;font:400 15px/1.65 ${FONT_BODY};color:${BODY};">${html}</p>`;
}

function small(html: string): string {
  return `<p style="margin:0 0 12px 0;font:400 13px/1.6 ${FONT_BODY};color:${MUTED};">${html}</p>`;
}

function strong(text: string): string {
  return `<strong style="font-weight:700;color:${INK};">${escape(text)}</strong>`;
}

/** The one action an email asks for. Followed by the bare link, for clients that hide buttons. */
function button(branding: EmailBranding, href: string, label: string, opts: { showLink?: boolean } = {}): string {
  const color = brandColor(branding);
  const on = readableOn(color);
  const fallback =
    opts.showLink === false
      ? ""
      : `<p style="margin:0 0 18px 0;font:400 12px/1.6 ${FONT_BODY};color:${FAINT};">Button not working? Copy this link into your browser:<br>
          <a href="${escape(href)}" style="color:${MUTED};text-decoration:underline;word-break:break-all;">${escape(href)}</a></p>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 14px 0;">
      <tr>
        <td bgcolor="${color}" style="background:${color};border:2px solid ${INK};border-radius:10px;box-shadow:3px 3px 0 ${INK};">
          <a href="${escape(href)}" style="display:inline-block;padding:13px 26px;font:700 15px/1.2 ${FONT_BODY};color:${on};text-decoration:none;border-radius:8px;">${escape(label)}&nbsp;&rarr;</a>
        </td>
      </tr>
    </table>${fallback}`;
}

/** A bordered list of label / value pairs: who the account is for, what was paid, and so on. */
function facts(rows: Array<[label: string, value: string]>): string {
  const body = rows
    .map(
      ([label, value], i) => `<tr>
        <td style="padding:11px 14px;${i ? `border-top:1px solid #ded8cc;` : ""}font:700 11px/1.4 ${FONT_BODY};letter-spacing:.06em;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top;">${escape(label)}</td>
        <td align="right" style="padding:11px 14px;${i ? `border-top:1px solid #ded8cc;` : ""}font:700 14px/1.4 ${FONT_BODY};color:${INK};word-break:break-word;">${escape(value)}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px 0;border:2px solid ${INK};border-radius:10px;border-collapse:separate;background:${TINT};">${body}</table>`;
}

/** Numbered steps, each with a square badge in the brand colour. */
function steps(branding: EmailBranding, items: string[]): string {
  const color = brandColor(branding);
  const on = readableOn(color);
  const rows = items
    .map(
      (text, i) => `<tr>
        <td width="34" valign="top" style="padding:0 12px 12px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="28" height="28" align="center" bgcolor="${color}" style="background:${color};border:2px solid ${INK};border-radius:7px;font:700 13px/1 ${FONT_BODY};color:${on};">${i + 1}</td>
          </tr></table>
        </td>
        <td valign="top" style="padding:5px 0 12px 0;font:400 14px/1.5 ${FONT_BODY};color:${BODY};">${text}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 10px 0;">${rows}</table>`;
}

/** A quiet aside: expiry, "if this wasn't you". */
function note(branding: EmailBranding, html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px 0;">
      <tr>
        <td width="4" bgcolor="${brandColor(branding)}" style="background:${brandColor(branding)};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding:2px 0 2px 14px;font:400 13px/1.6 ${FONT_BODY};color:${MUTED};">${html}</td>
      </tr>
    </table>`;
}

/* -------------------------------------------------------------------- shell */

function shell(
  branding: EmailBranding,
  input: { title: string; body: string; eyebrow?: string; preheader?: string }
): string {
  const color = brandColor(branding);
  const on = readableOn(color);
  const name = escape(branding.name);

  const mark = branding.logoUrl
    ? `<img src="${escape(branding.logoUrl)}" alt="${name}" height="40" style="display:block;height:40px;max-width:220px;border:0;outline:none;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="40" height="40" align="center" bgcolor="${color}" style="background:${color};border:2px solid ${INK};border-radius:10px;font:400 18px/1 ${FONT_HEAD};color:${on};">${escape(
          branding.name.trim().charAt(0).toUpperCase() || "A"
        )}</td>
        <td style="padding-left:12px;font:400 17px/1.2 ${FONT_HEAD};color:${INK};">${name}</td>
      </tr></table>`;

  const contact = [
    `<a href="${escape(branding.siteUrl)}" style="color:${MUTED};text-decoration:underline;">${escape(hostLabel(branding.siteUrl))}</a>`,
    `<a href="mailto:${escape(branding.supportEmail)}" style="color:${MUTED};text-decoration:underline;">${escape(branding.supportEmail)}</a>`,
    ...(branding.supportPhone ? [escape(branding.supportPhone)] : []),
  ].join(" &nbsp;&middot;&nbsp; ");

  const eyebrow = input.eyebrow
    ? `<p style="margin:0 0 10px 0;font:700 11px/1.4 ${FONT_BODY};letter-spacing:.1em;text-transform:uppercase;color:${MUTED};">${escape(input.eyebrow)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escape(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:${PAPER};font-size:1px;line-height:1px;">${escape(input.preheader ?? input.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER};">
  <tr>
    <td align="center" style="padding:32px 14px 40px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">
        <tr>
          <td style="padding:0 4px 18px 4px;">${mark}</td>
        </tr>
        <tr>
          <td bgcolor="${CARD}" style="background:${CARD};border:2px solid ${INK};border-radius:14px;box-shadow:5px 5px 0 ${INK};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td height="10" bgcolor="${color}" style="height:10px;background:${color};border-bottom:2px solid ${INK};border-radius:11px 11px 0 0;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:30px 30px 26px 30px;">
                  ${eyebrow}
                  <h1 style="margin:0 0 18px 0;font:400 26px/1.2 ${FONT_HEAD};letter-spacing:-.01em;color:${INK};">${escape(input.title)}</h1>
                  ${input.body}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 6px 0 6px;">
            <p style="margin:0 0 6px 0;font:700 13px/1.5 ${FONT_BODY};color:${INK};">${name}</p>
            <p style="margin:0 0 8px 0;font:400 12px/1.6 ${FONT_BODY};color:${MUTED};">${contact}</p>
            ${branding.instruction ? `<p style="margin:0 0 8px 0;font:400 12px/1.6 ${FONT_BODY};color:${MUTED};">${escape(branding.instruction)}</p>` : ""}
            ${branding.address ? `<p style="margin:0 0 8px 0;font:400 12px/1.6 ${FONT_BODY};color:${FAINT};">${escape(branding.address)}</p>` : ""}
            <p style="margin:0;font:400 11px/1.6 ${FONT_BODY};color:${FAINT};">This is an automated message${
              branding.isPlatform ? "" : ` from ${name}`
            }. Replies to this address are not read.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/* ---------------------------------------------------------------- templates */

/**
 * An invitation: the button opens a page that already knows who the account is
 * for and asks only for a new password.
 */
export function accountSetupEmail(
  branding: EmailBranding,
  input: {
    name?: string | null;
    email: string;
    setupUrl: string;
    /** Who the account is for: the academy's owner, a member of its staff, or a platform administrator. */
    role: "owner" | "staff" | "platform";
    /** For staff: the role they were given, e.g. "Instructor". */
    roleLabel?: string | null;
    /** For staff: who invited them. */
    invitedBy?: string | null;
    expiresInDays: number;
  }
): string {
  const who = strong(branding.name);
  const intro =
    input.role === "owner"
      ? paragraph(`Your academy, ${who}, has been created and you are its owner. Set your password to open it and finish setting it up.`)
      : input.role === "platform"
        ? paragraph(`You have been given an administrator account on ${who}. Set your password to sign in.`)
        : paragraph(
            `${input.invitedBy ? `${strong(input.invitedBy)} has invited you` : "You have been invited"} to join the team at ${who}. Set your password to get started.`
          );

  const rows: Array<[string, string]> = [["Your sign-in email", input.email]];
  if (input.role === "owner") rows.push(["Your role", "Owner"]);
  else if (input.roleLabel) rows.push(["Your role", input.roleLabel]);
  if (input.role !== "platform") rows.push(["Academy address", hostLabel(branding.appOrigin)]);

  const next =
    input.role === "owner"
      ? `${small("What happens next:")}${steps(branding, [
          "Choose a password. There is nothing else to type: the button already knows the account is yours.",
          "Add your academy's details, time zone and currency.",
          "Upload your logo and pick your colour.",
          "Create your first course, or leave that for later.",
        ])}`
      : "";

  const body = `
    ${paragraph(greeting(input.name))}
    ${intro}
    ${button(branding, input.setupUrl, "Set your password")}
    ${facts(rows)}
    ${next}
    ${note(
      branding,
      `This link works once and expires in ${input.expiresInDays} days. If it has expired, ask ${
        input.role === "owner" || input.role === "platform" ? "the person who set up your account" : "your administrator"
      } to send a new one.`
    )}
  `;
  return shell(branding, {
    eyebrow: input.role === "owner" ? "Your academy is ready" : "Invitation",
    title: input.role === "owner" ? `Welcome to ${branding.name}` : `Join ${branding.name}`,
    preheader: "Set your password to get started. One button, no temporary password.",
    body,
  });
}

/** An administrator reset someone's password: same one-button page as an invitation. */
export function adminPasswordResetEmail(
  branding: EmailBranding,
  input: { name?: string | null; email: string; setupUrl: string; expiresInHours: number }
): string {
  const body = `
    ${paragraph(greeting(input.name))}
    ${paragraph(`An administrator at ${strong(branding.name)} has reset your password. You have been signed out everywhere. Choose a new password to get back in.`)}
    ${button(branding, input.setupUrl, "Choose a new password")}
    ${facts([["Your sign-in email", input.email]])}
    ${note(branding, `This link works once and expires in ${input.expiresInHours} hours. If you were not expecting this, contact ${escape(branding.supportEmail)}.`)}
  `;
  return shell(branding, {
    eyebrow: "Account security",
    title: "Your password was reset",
    preheader: "Choose a new password to get back in.",
    body,
  });
}

export function notificationEmail(
  branding: EmailBranding,
  input: { name?: string | null; subject: string; body: string; actionUrl?: string }
): string {
  const lines = input.body
    .split(/\n{2,}/)
    .map((block) => paragraph(escape(block).replace(/\n/g, "<br>")))
    .join("");
  const body = `
    ${paragraph(greeting(input.name))}
    ${lines}
    ${input.actionUrl ? button(branding, input.actionUrl, "Open in your dashboard", { showLink: false }) : ""}
  `;
  return shell(branding, { eyebrow: "Notification", title: input.subject, preheader: input.body.slice(0, 120), body });
}

export function otpEmail(
  branding: EmailBranding,
  input: { code: string; variant?: "signin" | "registration" }
): string {
  const isRegistration = input.variant === "registration";
  const intro = isRegistration
    ? paragraph(`Enter this code to confirm your email and finish creating your account at ${strong(branding.name)}.`)
    : paragraph(`Enter this code to sign in to ${strong(branding.name)}.`);
  const body = `
    ${intro}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px 0;">
      <tr>
        <td align="center" bgcolor="${TINT}" style="background:${TINT};border:2px dashed ${INK};border-radius:12px;padding:20px 12px;font:700 34px/1.1 ${FONT_MONO};letter-spacing:.3em;color:${INK};">${escape(input.code)}</td>
      </tr>
    </table>
    ${note(branding, "The code expires in 5 minutes and works once. If you did not ask for it, you can ignore this email: nothing happens without the code.")}
  `;
  return shell(branding, {
    eyebrow: isRegistration ? "Confirm your email" : "Sign-in code",
    title: isRegistration ? "Your verification code" : "Your sign-in code",
    preheader: `Your code is ${input.code}. It expires in 5 minutes.`,
    body,
  });
}

export function passwordResetEmail(
  branding: EmailBranding,
  input: { name?: string | null; resetUrl: string }
): string {
  const body = `
    ${paragraph(greeting(input.name))}
    ${paragraph(`We received a request to reset the password for your account at ${strong(branding.name)}.`)}
    ${button(branding, input.resetUrl, "Reset your password")}
    ${note(branding, "This link works once and expires in one hour. If you did not ask for it, you can ignore this email: your password stays as it is.")}
  `;
  return shell(branding, {
    eyebrow: "Account security",
    title: "Reset your password",
    preheader: "Use the button to choose a new password. The link expires in one hour.",
    body,
  });
}

export function trialReminderEmail(
  branding: EmailBranding,
  input: { daysLeft: number; billingUrl?: string }
): string {
  const days = `${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"}`;
  const body = `
    ${paragraph(`The free trial for ${strong(branding.name)} ends in ${strong(days)}.`)}
    ${paragraph("Choose a plan before then to keep your academy online. Your courses, learners and settings stay exactly as they are.")}
    ${input.billingUrl ? button(branding, input.billingUrl, "Choose a plan") : ""}
  `;
  return shell(branding, {
    eyebrow: "Your trial",
    title: `${input.daysLeft === 1 ? "1 day" : `${input.daysLeft} days`} left on your trial`,
    preheader: `Choose a plan within ${days} to keep your academy online.`,
    body,
  });
}

export function welcomeEmail(
  branding: EmailBranding,
  input: { name?: string | null; loginUrl: string }
): string {
  const body = `
    ${paragraph(greeting(input.name))}
    ${paragraph(`Your account at ${strong(branding.name)} is ready.`)}
    ${button(branding, input.loginUrl, "Sign in")}
    ${note(branding, `Sign in with the email and password you chose. If you have a question, write to ${escape(branding.supportEmail)}.`)}
  `;
  return shell(branding, {
    eyebrow: "Welcome",
    title: `Welcome to ${branding.name}`,
    preheader: "Your account is ready. Sign in to get started.",
    body,
  });
}

export function enrollmentConfirmationEmail(
  branding: EmailBranding,
  input: {
    name?: string | null;
    itemName: string;
    itemType: "course" | "programme";
    actionUrl?: string;
  }
): string {
  const body = `
    ${paragraph(greeting(input.name))}
    ${paragraph(`You are enrolled in the ${input.itemType} ${strong(input.itemName)} at ${strong(branding.name)}.`)}
    ${input.actionUrl ? button(branding, input.actionUrl, "Start learning") : ""}
    ${note(branding, "You can pick up where you left off at any time from your dashboard.")}
  `;
  return shell(branding, {
    eyebrow: input.itemType === "course" ? "Course enrolment" : "Programme enrolment",
    title: "You're enrolled",
    preheader: `You are enrolled in ${input.itemName}.`,
    body,
  });
}

export function paymentReceiptEmail(
  branding: EmailBranding,
  input: {
    name?: string | null;
    description: string;
    amountLabel: string;
    reference?: string | null;
    dateLabel?: string | null;
    actionUrl?: string;
  }
): string {
  const rows: Array<[string, string]> = [
    ["Item", input.description],
    ["Amount paid", input.amountLabel],
    ...(input.reference ? ([["Reference", input.reference]] as Array<[string, string]>) : []),
    ...(input.dateLabel ? ([["Date", input.dateLabel]] as Array<[string, string]>) : []),
  ];
  const body = `
    ${paragraph(greeting(input.name))}
    ${paragraph("Thank you. Your payment was received.")}
    ${facts(rows)}
    ${input.actionUrl ? button(branding, input.actionUrl, "Open your dashboard", { showLink: false }) : ""}
    ${note(branding, "Keep this email as your receipt.")}
  `;
  return shell(branding, {
    eyebrow: "Receipt",
    title: "Payment received",
    preheader: `${input.amountLabel} for ${input.description}.`,
    body,
  });
}

/**
 * An exam slip: the Exam ID and PIN a candidate signs in to a CBT exam with,
 * and when and where to sit it. The PIN is new — issuing it replaced any
 * earlier one.
 */
export function examSlipEmail(
  branding: EmailBranding,
  input: {
    name?: string | null;
    examTitle: string;
    candidateNo: string;
    pin: string;
    loginUrl: string;
    regNumber?: string | null;
    /** "28 Nov 2026, 09:00", already in the academy's time zone. */
    whenLabel?: string | null;
    venue?: string | null;
    durationMin: number;
  }
): string {
  const rows: Array<[string, string]> = [["Exam", input.examTitle]];
  if (input.regNumber) rows.push(["Registration no.", input.regNumber]);
  if (input.whenLabel) rows.push(["When", input.whenLabel]);
  if (input.venue) rows.push(["Venue", input.venue]);
  rows.push(["Duration", `${input.durationMin} minutes`]);

  const credential = (label: string, value: string) => `<td align="center" bgcolor="${TINT}" style="background:${TINT};border:2px dashed ${INK};border-radius:12px;padding:14px 10px;">
          <div style="font:700 11px/1.4 ${FONT_BODY};letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${escape(label)}</div>
          <div style="margin-top:4px;font:700 24px/1.2 ${FONT_MONO};letter-spacing:.12em;color:${INK};word-break:break-all;">${escape(value)}</div>
        </td>`;

  const body = `
    ${paragraph(greeting(input.name))}
    ${paragraph(`Here are your sign-in details for ${strong(input.examTitle)} at ${strong(branding.name)}. Keep them private: anyone with them can sit the exam as you.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px 0;">
      <tr>
        ${credential("Exam ID", input.candidateNo)}
        <td width="12" style="font-size:0;line-height:0;">&nbsp;</td>
        ${credential("PIN", input.pin)}
      </tr>
    </table>
    ${facts(rows)}
    ${button(branding, input.loginUrl, "Go to the exam sign-in")}
    ${small("On the day:")}${steps(branding, [
      `Open ${escape(hostLabel(input.loginUrl))}/exam on the computer you will use.`,
      "Type your Exam ID and PIN exactly as shown above.",
      "Read the instructions, then start when you are told to.",
    ])}
    ${note(branding, "This PIN replaces any PIN you were given before. If you lose it, ask the exam office for a new one: PINs are never sent again or recovered.")}
  `;
  return shell(branding, {
    eyebrow: "Exam slip",
    title: input.examTitle,
    preheader: `Your Exam ID is ${input.candidateNo}. Your PIN is inside.`,
    body,
  });
}
