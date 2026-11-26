import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { inTenant } from "@/lib/referrals/codes";
import { normalizeReferralCode } from "@/lib/referrals/code-format";

/**
 * Crediting a staff member for a learner they brought in.
 *
 * Three moments are recorded — the learner signs up, enrols, or pays — each as
 * one `ReferralEvent`. This is tracking only: nothing is paid out, nothing is
 * discounted, and a learner's access never depends on any of it.
 *
 * That last point shapes the whole module. Every function here:
 *
 *  - never throws. A registration, an enrolment or a payment must complete
 *    exactly as it would have with referrals switched off; a failure in here is
 *    logged and swallowed.
 *  - is idempotent. Each event has a reference that makes it unique (the
 *    learner for a sign-up, the enrolment for an enrolment, the payment
 *    reference for a purchase), so a replayed webhook or a double submit
 *    records it once.
 *  - ignores a bad code silently. An unknown code, a code that has been
 *    switched off, or a staff member using their own code is simply not
 *    credited — the learner is not told, because there is nothing for them to
 *    fix and a code's validity is not their business.
 *
 * Which code gets the credit, in order: one given explicitly (typed into a
 * form, or carried through a payment's metadata), then the code in the
 * visitor's `?ref=` cookie, then the code the learner originally signed up
 * through. The first of those that is real and active wins.
 */

export type ReferralOutcome = {
  /** True only when this call wrote a new event. False for "already recorded" too. */
  recorded: boolean;
  /** The code that was credited, when one was. */
  code: string | null;
};

const NOT_RECORDED: ReferralOutcome = { recorded: false, code: null };

type CodeSource = {
  /** A code supplied directly: a form field, or a value stored with a payment. */
  code?: string | null;
  /** The visitor's `?ref=` cookie — `await readReferralCookie()` in a route handler. */
  cookieCode?: string | null;
};

type ResolvedCode = { id: string; code: string };

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && Boolean(b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();
}

/**
 * Pick the code to credit for this learner, or null.
 *
 * `useSignupReferrer` is off for the sign-up itself (the learner has no
 * referrer yet — that is what is being decided) and on for everything after.
 */
async function resolveCode(
  tenantId: string,
  clientId: string,
  source: CodeSource,
  useSignupReferrer: boolean
): Promise<ResolvedCode | null> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: { email: true, referralCodeId: true },
  });
  if (!client) return null;

  const select = {
    id: true,
    code: true,
    tenantUser: { select: { email: true, status: true } },
  } as const;

  const usable = (row: {
    id: string;
    code: string;
    tenantUser: { email: string; status: string };
  } | null): ResolvedCode | null => {
    if (!row) return null;
    // A code belonging to someone who can no longer sign in earns nothing.
    if (row.tenantUser.status !== "ACTIVE") return null;
    // Staff signing themselves up as a learner through their own link.
    if (sameEmail(row.tenantUser.email, client.email)) return null;
    return { id: row.id, code: row.code };
  };

  const tried = new Set<string>();
  for (const candidate of [source.code, source.cookieCode]) {
    const code = normalizeReferralCode(candidate);
    if (!code || tried.has(code)) continue;
    tried.add(code);
    const found = usable(
      await prisma.referralCode.findFirst({ where: { tenantId, code, active: true }, select })
    );
    if (found) return found;
  }

  if (useSignupReferrer && client.referralCodeId) {
    return usable(
      await prisma.referralCode.findFirst({
        where: { tenantId, id: client.referralCodeId, active: true },
        select,
      })
    );
  }
  return null;
}

async function writeEvent(data: {
  tenantId: string;
  referralCodeId: string;
  type: "SIGNUP" | "ENROLLMENT" | "PURCHASE";
  clientId: string;
  reference: string;
  courseId?: string | null;
  programmeId?: string | null;
  libraryItemId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
}): Promise<boolean> {
  // skipDuplicates turns the (type, reference) uniqueness into "do nothing" on
  // a replay, instead of an error to catch and tell apart from a real failure.
  const result = await prisma.referralEvent.createMany({
    data: [
      {
        tenantId: data.tenantId,
        referralCodeId: data.referralCodeId,
        type: data.type,
        clientId: data.clientId,
        reference: data.reference,
        courseId: data.courseId ?? null,
        programmeId: data.programmeId ?? null,
        libraryItemId: data.libraryItemId ?? null,
        amountCents: data.amountCents ?? null,
        currency: data.currency ?? null,
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}

async function guarded(
  what: string,
  context: Record<string, unknown>,
  work: () => Promise<ReferralOutcome>
): Promise<ReferralOutcome> {
  try {
    return await work();
  } catch (err) {
    logger.warn({ err, ...context }, `referral_${what}_failed`);
    return NOT_RECORDED;
  }
}

/**
 * A learner has just been created. Credits the sign-up and remembers the code
 * as the learner's referrer, so later enrolments and purchases made without a
 * cookie (another device, a webhook) are still attributed.
 *
 * Call once, after the `Client` row exists.
 */
export function recordSignupReferral(input: {
  tenantId: string;
  clientId: string;
} & CodeSource): Promise<ReferralOutcome> {
  const { tenantId, clientId } = input;
  return guarded("signup", { tenantId, clientId }, () =>
    inTenant(tenantId, async () => {
      const code = await resolveCode(tenantId, clientId, input, false);
      if (!code) return NOT_RECORDED;

      // `referralCodeId: null` in the filter: the first referrer is kept. A
      // second call must not hand an existing learner to someone else.
      await prisma.client.updateMany({
        where: { id: clientId, tenantId, referralCodeId: null },
        data: { referralCodeId: code.id, referredAt: new Date() },
      });

      const recorded = await writeEvent({
        tenantId,
        referralCodeId: code.id,
        type: "SIGNUP",
        clientId,
        reference: clientId,
      });
      return { recorded, code: code.code };
    })
  );
}

/**
 * A learner has been enrolled in a course or a programme.
 *
 * `enrollmentId` is the `Enrollment` id for a course, or the
 * `ProgrammeEnrollment` id for a programme (pass `programmeId` with it). It is
 * what makes the event unique, so calling this again for the same enrolment
 * records nothing new.
 */
export function recordEnrollmentReferral(input: {
  tenantId: string;
  clientId: string;
  enrollmentId: string;
  courseId?: string | null;
  programmeId?: string | null;
} & CodeSource): Promise<ReferralOutcome> {
  const { tenantId, clientId, enrollmentId } = input;
  return guarded("enrollment", { tenantId, clientId, enrollmentId }, () =>
    inTenant(tenantId, async () => {
      const code = await resolveCode(tenantId, clientId, input, true);
      if (!code) return NOT_RECORDED;
      const recorded = await writeEvent({
        tenantId,
        referralCodeId: code.id,
        type: "ENROLLMENT",
        clientId,
        reference: enrollmentId,
        courseId: input.courseId,
        programmeId: input.programmeId,
      });
      return { recorded, code: code.code };
    })
  );
}

/**
 * A learner is about to pay. If they arrived through a referral link and have
 * no referrer on record yet, remember it now.
 *
 * Why here: the payment may be confirmed by the gateway's webhook, which has
 * no visitor and so no cookie. Without this, a learner who signed up on their
 * own and later bought through someone's link would be credited to nobody
 * whenever the webhook beat the browser back. First referrer wins, as at
 * sign-up; nothing is recorded as an event until the payment is real.
 */
export function rememberCheckoutReferrer(input: {
  tenantId: string;
  clientId: string;
} & CodeSource): Promise<ReferralOutcome> {
  const { tenantId, clientId } = input;
  return guarded("checkout_referrer", { tenantId, clientId }, () =>
    inTenant(tenantId, async () => {
      const code = await resolveCode(tenantId, clientId, input, false);
      if (!code) return NOT_RECORDED;
      const updated = await prisma.client.updateMany({
        where: { id: clientId, tenantId, referralCodeId: null },
        data: { referralCodeId: code.id, referredAt: new Date() },
      });
      return { recorded: updated.count > 0, code: code.code };
    })
  );
}

/**
 * A learner's payment has been confirmed.
 *
 * `reference` is the payment reference the gateway and our own payment row
 * share. Both the redirect-back verifier and the webhook may call this for the
 * same payment; whichever is second records nothing.
 *
 * `amountCents` is what the learner paid, in the smallest unit of `currency`.
 */
export function recordPurchaseReferral(input: {
  tenantId: string;
  clientId: string;
  reference: string;
  amountCents: number;
  currency: string;
  courseId?: string | null;
  programmeId?: string | null;
  libraryItemId?: string | null;
} & CodeSource): Promise<ReferralOutcome> {
  const { tenantId, clientId, reference } = input;
  return guarded("purchase", { tenantId, clientId, reference }, () =>
    inTenant(tenantId, async () => {
      if (!reference) return NOT_RECORDED;
      const code = await resolveCode(tenantId, clientId, input, true);
      if (!code) return NOT_RECORDED;
      const recorded = await writeEvent({
        tenantId,
        referralCodeId: code.id,
        type: "PURCHASE",
        clientId,
        reference,
        courseId: input.courseId,
        programmeId: input.programmeId,
        libraryItemId: input.libraryItemId,
        amountCents: Number.isFinite(input.amountCents) ? Math.max(0, Math.round(input.amountCents)) : null,
        currency: input.currency || null,
      });
      return { recorded, code: code.code };
    })
  );
}
