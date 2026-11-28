#!/usr/bin/env tsx
import "dotenv/config";
import { expireTrials, sendTrialReminders } from "@/lib/jobs/billing-jobs";
import { sendEmail } from "@/lib/email/send";
import { autosubmitExpired, examReminders, releaseAfterClose } from "@/lib/jobs/exam-jobs";

async function main() {
  const cmd = process.argv[2] ?? "expire-trials";
  if (cmd === "expire-trials") {
    const n = await expireTrials();
    console.log(`Suspended ${n} expired trial tenant(s).`);
    return;
  }
  if (cmd === "trial-reminders") {
    const n = await sendTrialReminders(async ({ to, subject, html, replyTo, fromName }) => {
      await sendEmail({ to, subject, html, replyTo, fromName });
    });
    console.log(`Sent ${n} trial reminder email(s).`);
    return;
  }
  if (cmd === "exam-autosubmit") {
    const r = await autosubmitExpired();
    console.log(`Auto-submitted ${r.submitted} attempt(s); closed ${r.closed} exam(s).`);
    return;
  }
  if (cmd === "exam-release") {
    console.log(`Released ${await releaseAfterClose()} exam result(s).`);
    return;
  }
  if (cmd === "exam-reminders") {
    console.log(`Sent ${await examReminders()} exam reminder(s).`);
    return;
  }
  if (cmd === "deliver-webhooks") {
    // Every minute: retries and anything the inline first attempt missed.
    const { sweepDueDeliveries } = await import("@/lib/integrations/webhook-delivery");
    const r = await sweepDueDeliveries();
    console.log(`Attempted ${r.attempted} webhook delivery(ies); ${r.succeeded} succeeded.`);
    return;
  }
  if (cmd === "prune-api-logs") {
    const { pruneDeveloperData } = await import("@/lib/jobs/developer-jobs");
    console.log("Pruned:", JSON.stringify(await pruneDeveloperData()));
    return;
  }
  console.error(`Unknown job: ${cmd}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
