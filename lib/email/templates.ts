import type { EmailBranding } from "./branding";

/**
 * Tenant-branded HTML email shell. Every template renders through this so the
 * logo, brand colour, name, links, support contact and any custom instruction
 * are consistent. All CSS is inline (email clients ignore <style>/<head>).
 */
function shell(branding: EmailBranding, title: string, body: string): string {
  const color = branding.primaryColor || "#0f172a";
  const header = branding.logoUrl
    ? `<img src="${escape(branding.logoUrl)}" alt="${escape(branding.name)}" style="max-height:44px;max-width:200px;display:block;" />`
    : `<span style="display:inline-flex;align-items:center;gap:10px;font-size:18px;font-weight:700;color:#fff;">
        <span style="display:inline-flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,0.18);font-size:16px;">${escape(
          branding.name.charAt(0).toUpperCase()
        )}</span>
        ${escape(branding.name)}
      </span>`;

  const contactBits: string[] = [];
  contactBits.push(
    `<a href="${escape(branding.siteUrl)}" style="color:${color};text-decoration:none;">${escape(
      hostLabel(branding.siteUrl)
    )}</a>`
  );
  contactBits.push(
    `<a href="mailto:${escape(branding.supportEmail)}" style="color:${color};text-decoration:none;">${escape(
      branding.supportEmail
    )}</a>`
  );
  if (branding.supportPhone) contactBits.push(escape(branding.supportPhone));

  const instruction = branding.instruction
    ? `<p style="font-size:12px;color:#78716c;margin:0 0 8px 0;">${escape(branding.instruction)}</p>`
    : "";
  const address = branding.address
    ? `<p style="font-size:12px;color:#a8a29e;margin:8px 0 0 0;">${escape(branding.address)}</p>`
    : "";

  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#fafaf9;color:#1c1917;padding:24px;margin:0;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:10px;overflow:hidden;">
      <div style="background:${color};padding:18px 24px;">${header}</div>
      <div style="padding:24px;">
        <h1 style="font-size:18px;margin:0 0 16px 0;color:#1c1917;">${escape(title)}</h1>
        ${body}
      </div>
      <div style="border-top:1px solid #e7e5e4;padding:16px 24px;background:#fafaf9;">
        <p style="font-size:12px;color:#57534e;margin:0 0 6px 0;font-weight:600;">${escape(branding.name)}</p>
        <p style="font-size:12px;color:#78716c;margin:0 0 8px 0;">${contactBits.join(
          " &nbsp;·&nbsp; "
        )}</p>
        ${instruction}
        <p style="font-size:11px;color:#a8a29e;margin:0;">This is an automated message${
          branding.isPlatform ? "" : ` from ${escape(branding.name)}`
        }. Please do not reply directly.</p>
        ${address}
      </div>
    </div>
  </body></html>`;
}

/** A primary-coloured CTA button. */
function button(branding: EmailBranding, href: string, label: string): string {
  const color = branding.primaryColor || "#0f172a";
  return `<p style="margin:20px 0;">
    <a href="${escape(href)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px;font-size:14px;">${escape(
      label
    )}</a>
  </p>`;
}

function link(branding: EmailBranding, href: string): string {
  const color = branding.primaryColor || "#0f172a";
  return `<a href="${escape(href)}" style="color:${color};word-break:break-all;">${escape(href)}</a>`;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function inviteEmail(
  branding: EmailBranding,
  input: { name?: string | null; loginUrl: string; tempPassword: string; subjectLabel: string }
): string {
  const greeting = input.name ? `Hi ${escape(input.name)},` : "Hi,";
  const body = `
    <p>${greeting}</p>
    <p>You've been invited to ${escape(input.subjectLabel)}.</p>
    ${button(branding, input.loginUrl, "Sign in")}
    <p style="font-size:13px;color:#57534e;">Or open this link: ${link(branding, input.loginUrl)}</p>
    <p>Temporary password: <code style="background:#f5f5f4;padding:2px 6px;border-radius:4px;">${escape(input.tempPassword)}</code></p>
    <p>You will be required to set a new password on first login.</p>
  `;
  return shell(branding, `You've been invited`, body);
}

export function tempPasswordEmail(
  branding: EmailBranding,
  input: { name?: string | null; loginUrl: string; tempPassword: string }
): string {
  const greeting = input.name ? `Hi ${escape(input.name)},` : "Hi,";
  const body = `
    <p>${greeting}</p>
    <p>Your password has been reset by an administrator.</p>
    ${button(branding, input.loginUrl, "Sign in")}
    <p style="font-size:13px;color:#57534e;">Or open this link: ${link(branding, input.loginUrl)}</p>
    <p>Temporary password: <code style="background:#f5f5f4;padding:2px 6px;border-radius:4px;">${escape(input.tempPassword)}</code></p>
    <p>You will be required to set a new password on first login.</p>
  `;
  return shell(branding, `Your password was reset`, body);
}

export function notificationEmail(
  branding: EmailBranding,
  input: { name?: string | null; subject: string; body: string; actionUrl?: string }
): string {
  const greeting = input.name ? `Hi ${escape(input.name)},` : "Hi,";
  const action = input.actionUrl
    ? button(branding, input.actionUrl, "View in your dashboard")
    : "";
  const body = `
    <p>${greeting}</p>
    <p>${escape(input.body)}</p>
    ${action}
  `;
  return shell(branding, escape(input.subject), body);
}

export function otpEmail(
  branding: EmailBranding,
  input: { code: string; variant?: "signin" | "registration" }
): string {
  const isReg = input.variant === "registration";
  const intro = isReg
    ? `<p>Your verification code to finish creating your account at <strong>${escape(branding.name)}</strong>:</p>`
    : `<p>Your one-time sign-in code for <strong>${escape(branding.name)}</strong>:</p>`;
  const body = `
    ${intro}
    <p style="font-size:28px;font-weight:600;letter-spacing:4px;font-family:monospace;background:#f5f5f4;padding:12px;border-radius:6px;text-align:center;">${escape(input.code)}</p>
    <p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>
  `;
  return shell(branding, isReg ? "Verify your email" : "Your sign-in code", body);
}

export function passwordResetEmail(
  branding: EmailBranding,
  input: { name?: string | null; resetUrl: string }
): string {
  const greeting = input.name ? `Hi ${escape(input.name)},` : "Hi,";
  const body = `
    <p>${greeting}</p>
    <p>We received a request to reset your password. Use the button below. It expires in one hour.</p>
    ${button(branding, input.resetUrl, "Reset password")}
    <p style="font-size:13px;color:#57534e;">Or open this link: ${link(branding, input.resetUrl)}</p>
    <p>If you did not request this, you can ignore this email.</p>
  `;
  return shell(branding, `Reset your password`, body);
}

export function trialReminderEmail(
  branding: EmailBranding,
  input: { daysLeft: number; billingUrl?: string }
): string {
  const body = `
    <p>Your trial for <strong>${escape(branding.name)}</strong> ends in ${input.daysLeft} day${
      input.daysLeft === 1 ? "" : "s"
    }.</p>
    <p>Upgrade your plan to keep your academy online.</p>
    ${input.billingUrl ? button(branding, input.billingUrl, "Go to billing") : ""}
  `;
  return shell(branding, `Trial ending soon`, body);
}

export function welcomeEmail(
  branding: EmailBranding,
  input: { name?: string | null; loginUrl: string }
): string {
  const greeting = input.name ? `Hi ${escape(input.name)},` : "Hi,";
  const body = `
    <p>${greeting}</p>
    <p>Welcome to <strong>${escape(branding.name)}</strong> — your account is ready.</p>
    ${button(branding, input.loginUrl, "Go to your dashboard")}
    <p style="font-size:13px;color:#57534e;">Or open this link: ${link(branding, input.loginUrl)}</p>
    <p>We're glad to have you. If you have any questions, just reach out.</p>
  `;
  return shell(branding, `Welcome to ${branding.name}`, body);
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
  const greeting = input.name ? `Hi ${escape(input.name)},` : "Hi,";
  const body = `
    <p>${greeting}</p>
    <p>You're enrolled in the ${input.itemType} <strong>${escape(input.itemName)}</strong> at ${escape(
      branding.name
    )}.</p>
    ${input.actionUrl ? button(branding, input.actionUrl, "Start learning") : ""}
    <p>Happy learning!</p>
  `;
  return shell(branding, `You're enrolled`, body);
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
  const greeting = input.name ? `Hi ${escape(input.name)},` : "Hi,";
  const rows = [
    ["Item", input.description],
    ["Amount", input.amountLabel],
    ...(input.reference ? [["Reference", input.reference]] : []),
    ...(input.dateLabel ? [["Date", input.dateLabel]] : []),
  ]
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:6px 0;font-size:13px;color:#78716c;">${escape(k)}</td>
          <td style="padding:6px 0;font-size:13px;color:#1c1917;text-align:right;font-weight:600;">${escape(
            v
          )}</td>
        </tr>`
    )
    .join("");
  const body = `
    <p>${greeting}</p>
    <p>Thank you for your payment. Here is your receipt:</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e7e5e4;border-radius:8px;margin:16px 0;padding:8px 12px;">
      ${rows}
    </table>
    ${input.actionUrl ? button(branding, input.actionUrl, "View in your dashboard") : ""}
    <p style="font-size:13px;color:#57534e;">Keep this email for your records.</p>
  `;
  return shell(branding, `Payment receipt`, body);
}
