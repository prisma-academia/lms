#!/usr/bin/env tsx
import "dotenv/config";
import { expireTrials, sendTrialReminders } from "@/lib/jobs/billing-jobs";
import { sendEmail } from "@/lib/email/send";

async function main() {
  const cmd = process.argv[2] ?? "expire-trials";
  if (cmd === "expire-trials") {
    const n = await expireTrials();
    console.log(`Suspended ${n} expired trial tenant(s).`);
    return;
  }
  if (cmd === "trial-reminders") {
    const n = await sendTrialReminders(async ({ to, subject, html }) => {
      await sendEmail({ to, subject, html });
    });
    console.log(`Sent ${n} trial reminder email(s).`);
    return;
  }
  console.error(`Unknown job: ${cmd}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
