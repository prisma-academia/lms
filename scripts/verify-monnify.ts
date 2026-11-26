/**
 * Monnify payments — without Monnify.
 *
 * Every check here is about money either arriving where it should or being
 * refused when it should, so each one is a statement of something that must
 * stay true:
 *
 *  - a notification that was not signed by Monnify changes nothing;
 *  - a signed notification is still not believed until Monnify is asked;
 *  - a payment for less than the price, or in another currency, unlocks nothing;
 *  - the same notification twice gives the customer one enrolment, one receipt;
 *  - naira and kobo are converted exactly, in both directions;
 *  - an academy's share is only split off when it has somewhere to go.
 *
 * No real network: `fetch` is replaced by a stub that fails the run if anything
 * tries to reach a host other than the fake gateway. No real email: the mail
 * transport is replaced and what would have been sent is counted.
 *
 * The second half uses the database — throwaway courses, a library item and
 * pending payments inside the `demo` academy, all deleted in `finally`.
 *
 *   npm run verify:monnify              # everything
 *   npm run verify:monnify -- --no-db   # pure checks only
 */
import { createHmac, randomBytes } from "node:crypto";
import { config } from "dotenv";

config();

// Before any application module is loaded (they read the environment once, on
// import): throwaway keys, a gateway address that cannot resolve, and no other
// gateway — so nothing here depends on, or can touch, a real account.
const API_KEY = "MK_TEST_VERIFYSCRIPT";
const SECRET_KEY = "verify-script-secret-not-a-real-key";
const CONTRACT = "0000000001";
process.env.MONNIFY_API_KEY = API_KEY;
process.env.MONNIFY_SECRET_KEY = SECRET_KEY;
process.env.MONNIFY_CONTRACT_CODE = CONTRACT;
process.env.MONNIFY_BASE_URL = "https://monnify.invalid";
// Whatever the real .env says about these must not decide a check's outcome.
process.env.MONNIFY_ENABLED = "true";
process.env.MONNIFY_CALLBACK_IPS = "";
process.env.PAYMENT_PROVIDER = "";
for (const key of ["PAYSTACK_SECRET_KEY", "PAYSTACK_PUBLIC_KEY", "FLUTTERWAVE_SECRET_KEY", "FLUTTERWAVE_PUBLIC_KEY", "FLUTTERWAVE_SECRET_HASH"]) {
  delete process.env[key];
}

const withDb = !process.argv.includes("--no-db");

let failed = 0;
let total = 0;

function check(label: string, actual: unknown, expected: unknown) {
  total++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      got  ${a}\n      want ${e}`}`);
}

function section(title: string) {
  console.log(`\n— ${title}`);
}

/* -------------------------------------------------------------------------- */
/* The fake gateway                                                            */
/* -------------------------------------------------------------------------- */

type Call = { method: string; path: string; headers: Record<string, string>; body: unknown };
type Reply = { status?: number; body?: unknown; raw?: string } | { fail: "timeout" | "network" };

const calls: Call[] = [];
const strayCalls: string[] = [];
let respond: (call: Call) => Reply = () => ({ status: 500, body: {} });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(href);
  if (url.host !== "monnify.invalid") {
    strayCalls.push(href);
    throw new Error(`verify-monnify: unexpected network call to ${url.host}`);
  }
  const call: Call = {
    method: init?.method ?? "GET",
    path: url.pathname + url.search,
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  };
  calls.push(call);
  const reply = respond(call);
  if ("fail" in reply) {
    if (reply.fail === "timeout") throw new DOMException("The operation timed out.", "TimeoutError");
    throw new TypeError("fetch failed");
  }
  return new Response(reply.raw ?? JSON.stringify(reply.body ?? {}), {
    status: reply.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

/** A Monnify success envelope. */
const yes = (responseBody: unknown): Reply => ({
  body: { requestSuccessful: true, responseMessage: "success", responseCode: "0", responseBody },
});
/** A Monnify refusal. */
const no = (status: number, responseMessage: string, responseCode = "99"): Reply => ({
  status,
  body: { requestSuccessful: false, responseMessage, responseCode },
});

let logins = 0;
/** Install a gateway that signs in, and answers everything else through `extra`. */
function gateway(extra: (call: Call) => Reply | undefined = () => undefined) {
  respond = (call) => {
    if (call.path === "/api/v1/auth/login") {
      logins++;
      return yes({ accessToken: `token-${logins}`, expiresIn: 3600 });
    }
    return extra(call) ?? no(404, `no stub for ${call.method} ${call.path}`);
  };
}

const paths = () => calls.map((c) => `${c.method} ${c.path.split("?")[0]}`);
const reset = () => {
  calls.length = 0;
};

/** What Monnify's transaction query returns for one payment. */
const transaction = (reference: string, over: Record<string, unknown> = {}) =>
  yes({
    transactionReference: "MNFY|67|20261126000000|000001",
    paymentReference: reference,
    amountPaid: "15000.00",
    totalPayable: "15000.00",
    settlementAmount: "14775.00",
    paymentStatus: "PAID",
    currency: "NGN",
    paymentMethod: "CARD",
    metaData: {},
    ...over,
  });

const newReference = (prefix: string) => `${prefix}_${randomBytes(12).toString("hex")}`;
const sign = (rawBody: string, secret = SECRET_KEY) => createHmac("sha512", secret).update(rawBody).digest("hex");

/** A webhook body as Monnify sends it for a successful collection. */
const notification = (reference: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    eventType: "SUCCESSFUL_TRANSACTION",
    eventData: {
      product: { reference, type: "WEB_SDK" },
      transactionReference: "MNFY|67|20261126000000|000001",
      paymentReference: reference,
      amountPaid: 15000,
      totalPayable: 15000,
      settlementAmount: "14775.00",
      paymentStatus: "PAID",
      currency: "NGN",
      paymentMethod: "CARD",
      customer: { name: "Test Learner", email: "learner@example.test" },
      metaData: {},
      ...over,
    },
  });

async function errorOf(fn: () => Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await fn();
    return { threw: false };
  } catch (e) {
    const err = e as { name?: string; kind?: string; code?: string; status?: number; message?: string; retryable?: boolean };
    return { name: err.name, kind: err.kind ?? err.code, status: err.status, message: err.message, retryable: err.retryable };
  }
}

async function main() {
  const monnify = await import("../lib/billing/monnify");
  const payments = await import("../lib/billing/payments");
  const providers = await import("../lib/billing/providers");
  const redirect = await import("../lib/billing/redirect");
  const { registerMonnifyPayoutAccount } = await import("../lib/billing/subaccount");
  const { DomainError } = await import("../lib/api/errors");

  /* ------------------------------------------------------------------------ */
  section("Naira and kobo");
  /* ------------------------------------------------------------------------ */

  check(
    "kobo become decimal naira for Monnify",
    [monnify.koboToNaira(1_500_000), monnify.koboToNaira(250_050), monnify.koboToNaira(2_000), monnify.koboToNaira(1)],
    [15000, 2500.5, 20, 0.01]
  );
  check(
    "an amount that is not whole kobo is refused rather than rounded",
    [
      (await errorOf(async () => monnify.koboToNaira(12.5))).kind,
      (await errorOf(async () => monnify.koboToNaira(-100))).kind,
      (await errorOf(async () => monnify.koboToNaira(Number.NaN))).kind,
    ],
    ["rejected", "rejected", "rejected"]
  );
  check(
    "Monnify's naira figures become kobo, whether sent as text or number",
    [
      monnify.nairaToKobo("15000.00"),
      monnify.nairaToKobo("2500.5"),
      monnify.nairaToKobo(2500.5),
      monnify.nairaToKobo("2,500.50"),
      monnify.nairaToKobo(15000),
      monnify.nairaToKobo("0.01"),
    ],
    [1_500_000, 250_050, 250_050, 250_050, 1_500_000, 1]
  );
  // 1.15 * 100 is 114.99999999999999 and 0.1 + 0.2 is 0.30000000000000004: a
  // conversion done in floating point would be a kobo short on one and report
  // dust on the other.
  check(
    "the conversion is exact where floating point is not",
    [monnify.nairaToKobo("1.15"), monnify.nairaToKobo(1.15), monnify.nairaToKobo(0.1 + 0.2), monnify.nairaToKobo("1234567.89")],
    [115, 115, 30, 123_456_789]
  );
  check(
    "every kobo amount survives the round trip",
    [1, 99, 100, 101, 2_000, 250_050, 1_500_000, 99_999_999].filter(
      (kobo) => monnify.nairaToKobo(monnify.koboToNaira(kobo)) !== kobo
    ),
    []
  );
  check(
    "anything that is not a plain amount is not an amount",
    [
      monnify.nairaToKobo("abc"),
      monnify.nairaToKobo("-5"),
      monnify.nairaToKobo(-5),
      monnify.nairaToKobo(""),
      monnify.nairaToKobo(null),
      monnify.nairaToKobo(undefined),
      monnify.nairaToKobo(Number.NaN),
      monnify.nairaToKobo(Number.POSITIVE_INFINITY),
      monnify.nairaToKobo({ amount: 5 }),
      monnify.nairaToKobo("1e5"),
    ],
    [null, null, null, null, null, null, null, null, null, null]
  );

  /* ------------------------------------------------------------------------ */
  section("Is the paid amount enough?");
  /* ------------------------------------------------------------------------ */

  const price = { amountCents: 1_500_000, currency: "NGN" };
  check("the exact price is accepted", payments.checkPaidAmount(price, { amountCents: 1_500_000, currency: "NGN" }), {
    ok: true,
    overpaidCents: 0,
  });
  check("more than the price is accepted, and the excess is reported", payments.checkPaidAmount(price, { amountCents: 1_500_050, currency: "ngn" }), {
    ok: true,
    overpaidCents: 50,
  });
  check("one kobo short is refused", payments.checkPaidAmount(price, { amountCents: 1_499_999, currency: "NGN" }), {
    ok: false,
    reason: "underpaid",
  });
  check("₦20 for a ₦15,000 course is refused", payments.checkPaidAmount(price, { amountCents: 2_000, currency: "NGN" }), {
    ok: false,
    reason: "underpaid",
  });
  check("the right number in the wrong currency is refused", payments.checkPaidAmount(price, { amountCents: 1_500_000, currency: "USD" }), {
    ok: false,
    reason: "currency_mismatch",
  });
  check(
    "an amount that cannot be read is refused, never treated as zero or as enough",
    [
      payments.checkPaidAmount(price, { amountCents: Number.NaN, currency: "NGN" }),
      payments.checkPaidAmount(price, { amountCents: -1, currency: "NGN" }),
      payments.checkPaidAmount(price, { amountCents: 1500000.5, currency: "NGN" }),
    ].map((r) => (r.ok ? "accepted" : r.reason)),
    ["invalid_amount", "invalid_amount", "invalid_amount"]
  );
  check(
    "a payment row with no price cannot be satisfied by any payment",
    [0, -5].map((amountCents) => {
      const r = payments.checkPaidAmount({ amountCents, currency: "NGN" }, { amountCents: 1_000_000, currency: "NGN" });
      return r.ok ? "accepted" : r.reason;
    }),
    ["invalid_amount", "invalid_amount"]
  );

  /* ------------------------------------------------------------------------ */
  section("Webhook signature");
  /* ------------------------------------------------------------------------ */

  const ref0 = newReference("course");
  const body0 = notification(ref0);
  const good = sign(body0);

  check("Monnify's signature is HMAC-SHA512 of the raw body with the secret key, in hex", monnify.monnifySignature(body0, SECRET_KEY), good);
  check("a correctly signed body is accepted", monnify.verifyMonnifySignature(body0, good, SECRET_KEY), true);
  check("…in upper case and with stray whitespace too", monnify.verifyMonnifySignature(body0, `  ${good.toUpperCase()}\n`, SECRET_KEY), true);
  check(
    "a body altered after signing is refused — even by one character",
    [
      monnify.verifyMonnifySignature(body0.replace("15000", "15001"), good, SECRET_KEY),
      monnify.verifyMonnifySignature(body0.replace(ref0, newReference("course")), good, SECRET_KEY),
      monnify.verifyMonnifySignature(`${body0} `, good, SECRET_KEY),
    ],
    [false, false, false]
  );
  check("a signature made with a different secret is refused", monnify.verifyMonnifySignature(body0, sign(body0, "another-secret"), SECRET_KEY), false);
  // `timingSafeEqual` throws on a length mismatch. A webhook that can be made
  // to throw is a webhook that can be made to answer 500 and be retried forever.
  check(
    "a signature of the wrong length or shape is refused without throwing",
    [
      good.slice(0, 127),
      `${good}0`,
      good.slice(0, 64),
      "",
      "not-a-signature",
      "z".repeat(128),
      `${good.slice(0, 126)}zz`,
    ].map((sig) => {
      try {
        return monnify.verifyMonnifySignature(body0, sig, SECRET_KEY);
      } catch {
        return "threw";
      }
    }),
    [false, false, false, false, false, false, false]
  );
  check(
    "a missing signature, or a missing secret, is refused",
    [
      monnify.verifyMonnifySignature(body0, null, SECRET_KEY),
      monnify.verifyMonnifySignature(body0, undefined, SECRET_KEY),
      monnify.verifyMonnifySignature(body0, good, ""),
      // With no secret, the HMAC of the body under an EMPTY key must not pass.
      monnify.verifyMonnifySignature(body0, sign(body0, ""), ""),
    ],
    [false, false, false, false]
  );

  /* ------------------------------------------------------------------------ */
  section("Reading a notification");
  /* ------------------------------------------------------------------------ */

  check("a successful collection becomes a payment event in kobo", monnify.parseMonnifyWebhook(body0) && {
    ...monnify.parseMonnifyWebhook(body0),
    raw: undefined,
  }, { reference: ref0, status: "success", amountCents: 1_500_000, currency: "NGN" });
  check(
    "other events on the same URL are not payments",
    ["SUCCESSFUL_DISBURSEMENT", "FAILED_DISBURSEMENT", "SUCCESSFUL_REFUND", "SETTLEMENT", "REJECTED_PAYMENT", undefined].map((eventType) =>
      monnify.parseMonnifyWebhook(JSON.stringify({ ...JSON.parse(body0), eventType }))
    ),
    [null, null, null, null, null, null]
  );
  check(
    "a collection that is not fully paid is not a payment",
    ["PARTIALLY_PAID", "PENDING", "FAILED", "REVERSED", "EXPIRED", "CANCELLED"].map((paymentStatus) =>
      monnify.parseMonnifyWebhook(notification(ref0, { paymentStatus }))
    ),
    [null, null, null, null, null, null]
  );
  check(
    "a body that cannot be read is nothing, not an error",
    [
      monnify.parseMonnifyWebhook("not json"),
      monnify.parseMonnifyWebhook(""),
      monnify.parseMonnifyWebhook("null"),
      monnify.parseMonnifyWebhook(notification(ref0, { paymentReference: undefined })),
      monnify.parseMonnifyWebhook(notification(ref0, { amountPaid: "lots" })),
    ],
    [null, null, null, null, null]
  );

  const asRequest = (rawBody: string, signature: string | null) =>
    new Request("https://platform.example.test/api/webhooks/monnify", {
      method: "POST",
      headers: { "content-type": "application/json", ...(signature ? { "monnify-signature": signature } : {}) },
      body: rawBody,
    });
  check(
    "the provider reads a signed request and refuses an unsigned or altered one",
    [
      (await monnify.monnifyProvider.verifyWebhook(asRequest(body0, good)))?.reference ?? null,
      await monnify.monnifyProvider.verifyWebhook(asRequest(body0, null)),
      await monnify.monnifyProvider.verifyWebhook(asRequest(body0.replace("15000", "20"), good)),
      await monnify.monnifyProvider.verifyWebhook(asRequest(body0, good.slice(0, 100))),
    ],
    [ref0, null, null, null]
  );

  /* ------------------------------------------------------------------------ */
  section("Access token");
  /* ------------------------------------------------------------------------ */

  const banks = (call: Call): Reply | undefined =>
    call.path === "/api/v1/banks"
      ? yes([
          { name: "Kuda Microfinance Bank", code: "50211" },
          { name: "Access bank", code: "044" },
          { name: "Broken entry" },
        ])
      : undefined;

  // The token cache reads the clock; move it instead of waiting an hour.
  const realNow = Date.now;
  let skewMs = 0;
  Date.now = () => realNow() + skewMs;
  try {
    monnify.resetMonnifyTokenCache();
    logins = 0;
    reset();
    gateway(banks);

    const listed = await monnify.listMonnifyBanks();
    await monnify.listMonnifyBanks();
    await monnify.listMonnifyBanks();
    check("one sign-in serves many calls", paths(), ["POST /api/v1/auth/login", "GET /api/v1/banks", "GET /api/v1/banks", "GET /api/v1/banks"]);
    check(
      "sign-in sends the API key and secret as Basic credentials",
      calls[0].headers.authorization,
      `Basic ${Buffer.from(`${API_KEY}:${SECRET_KEY}`).toString("base64")}`
    );
    check("every other call carries the token, never the keys", calls.slice(1).map((c) => c.headers.authorization), [
      "Bearer token-1",
      "Bearer token-1",
      "Bearer token-1",
    ]);
    check("banks without a name or code are left out", listed, [
      { name: "Kuda Microfinance Bank", code: "50211", provider: "monnify" },
      { name: "Access bank", code: "044", provider: "monnify" },
    ]);

    reset();
    skewMs = 58 * 60 * 1000; // 58 minutes into a 60-minute token
    await monnify.listMonnifyBanks();
    check("the token is still used two minutes before it expires", paths(), ["GET /api/v1/banks"]);

    reset();
    skewMs = 59 * 60 * 1000 + 30_000; // inside the last minute
    await monnify.listMonnifyBanks();
    check("…and replaced in its last minute, before Monnify would refuse it", [paths(), calls[1].headers.authorization], [
      ["POST /api/v1/auth/login", "GET /api/v1/banks"],
      "Bearer token-2",
    ]);

    monnify.resetMonnifyTokenCache();
    reset();
    await Promise.all([1, 2, 3, 4, 5].map(() => monnify.listMonnifyBanks()));
    check("five calls arriving together share one sign-in", paths().filter((p) => p.includes("login")).length, 1);

    // Monnify stops accepting a token we still think is good.
    reset();
    let refusedOnce = false;
    gateway((call) => {
      if (call.path !== "/api/v1/banks") return undefined;
      if (!refusedOnce) {
        refusedOnce = true;
        return no(401, "Full authentication is required to access this resource");
      }
      return banks(call);
    });
    const afterRevocation = await monnify.listMonnifyBanks();
    check("a token Monnify has revoked is replaced and the call repeated, once", [paths(), afterRevocation.length], [
      ["GET /api/v1/banks", "POST /api/v1/auth/login", "GET /api/v1/banks"],
      2,
    ]);

    monnify.resetMonnifyTokenCache();
    reset();
    respond = () => no(401, "Invalid credentials");
    const badKeys = await errorOf(() => monnify.listMonnifyBanks());
    check("wrong keys fail as an authentication problem, after one attempt", [badKeys.kind, badKeys.retryable, paths()], [
      "auth",
      false,
      ["POST /api/v1/auth/login"],
    ]);
    check(
      "an error never carries the key, the secret or a token",
      [API_KEY, SECRET_KEY, "token-", Buffer.from(`${API_KEY}:${SECRET_KEY}`).toString("base64")].filter((secret) =>
        JSON.stringify(badKeys).includes(secret)
      ),
      []
    );

    monnify.resetMonnifyTokenCache();
    respond = () => yes({ expiresIn: 3600 });
    check("a sign-in reply with no token is an error, not a call made with 'undefined'", (await errorOf(() => monnify.listMonnifyBanks())).kind, "bad_response");
  } finally {
    Date.now = realNow;
  }

  /* ------------------------------------------------------------------------ */
  section("When Monnify does not answer properly");
  /* ------------------------------------------------------------------------ */

  const failure = async (reply: Reply) => {
    monnify.resetMonnifyTokenCache();
    gateway((call) => (call.path === "/api/v1/banks" ? reply : undefined));
    const e = await errorOf(() => monnify.listMonnifyBanks());
    return [e.kind, e.retryable];
  };
  check("a timeout is reported as one, and is worth retrying", await failure({ fail: "timeout" }), ["timeout", true]);
  check("a dropped connection is 'unavailable', worth retrying", await failure({ fail: "network" }), ["unavailable", true]);
  check("a 500 is 'unavailable', worth retrying", await failure({ status: 500, body: {} }), ["unavailable", true]);
  check("a gateway error page (502, not JSON) is 'unavailable'", await failure({ status: 502, raw: "<html>Bad Gateway</html>" }), ["unavailable", true]);
  check("a refusal is 'rejected', and retrying will not help", await failure(no(400, "Invalid contract code")), ["rejected", false]);
  check("200 with requestSuccessful false is still a refusal", await failure({ status: 200, body: { requestSuccessful: false, responseMessage: "Nope" } }), ["rejected", false]);
  check("200 that is not JSON is a bad response", await failure({ status: 200, raw: "OK" }), ["bad_response", false]);

  monnify.resetMonnifyTokenCache();
  gateway((call) => (call.path === "/api/v1/banks" ? no(400, "Sub account feature is not enabled for this merchant") : undefined));
  check(
    "a refusal carries Monnify's own explanation",
    (await errorOf(() => monnify.listMonnifyBanks())).message,
    "Sub account feature is not enabled for this merchant"
  );

  /* ------------------------------------------------------------------------ */
  section("Opening a checkout");
  /* ------------------------------------------------------------------------ */

  const checkoutRef = newReference("course");
  const checkoutInput = {
    email: "learner@example.test",
    customerName: "Ada Learner",
    description: "Budgeting basics",
    amountCents: 1_500_000,
    currency: "ngn",
    reference: checkoutRef,
    callbackUrl: `https://demo.example.test/my-courses?checkout=done&reference=${checkoutRef}`,
    metadata: { type: "course_purchase" as const, tenantId: "t1", courseId: "c1", clientId: "u1" },
  };
  const initOk = (call: Call): Reply | undefined =>
    call.path === "/api/v1/merchant/transactions/init-transaction"
      ? yes({
          transactionReference: "MNFY|20261126|000090",
          paymentReference: (call.body as { paymentReference: string }).paymentReference,
          checkoutUrl: "https://sandbox.sdk.monnify.invalid/checkout/MNFY|20261126|000090",
        })
      : undefined;

  monnify.resetMonnifyTokenCache();
  reset();
  gateway(initOk);
  const opened = await monnify.monnifyProvider.initializeCheckout(checkoutInput);
  const sent = calls[1].body as Record<string, unknown>;
  check("the customer is sent to Monnify's checkout page, under our reference", opened, {
    authorizationUrl: "https://sandbox.sdk.monnify.invalid/checkout/MNFY|20261126|000090",
    reference: checkoutRef,
  });
  check(
    "Monnify is asked for naira, with our reference, contract and return address",
    {
      amount: sent.amount,
      paymentReference: sent.paymentReference,
      contractCode: sent.contractCode,
      currencyCode: sent.currencyCode,
      customerEmail: sent.customerEmail,
      customerName: sent.customerName,
      paymentDescription: sent.paymentDescription,
      redirectUrl: sent.redirectUrl,
    },
    {
      amount: 15000,
      paymentReference: checkoutRef,
      contractCode: CONTRACT,
      currencyCode: "NGN",
      customerEmail: "learner@example.test",
      customerName: "Ada Learner",
      paymentDescription: "Budgeting basics",
      redirectUrl: checkoutInput.callbackUrl,
    }
  );
  check("with no payout account, no split is sent — the whole sum stays with the platform", "incomeSplitConfig" in sent, false);

  reset();
  await monnify.monnifyProvider.initializeCheckout({
    ...checkoutInput,
    subaccount: { monnifyCode: "MFY_SUB_319452883228", commissionPct: 10, platformFeeCents: 150_000 },
  });
  check(
    "with an active payout account, the academy's share is split off and the platform bears Monnify's fee",
    (calls[0].body as Record<string, unknown>).incomeSplitConfig,
    [{ subAccountCode: "MFY_SUB_319452883228", splitPercentage: 90, feePercentage: 0, feeBearer: false }]
  );

  reset();
  await monnify.monnifyProvider.initializeCheckout({
    ...checkoutInput,
    // Codes for other gateways are not Monnify sub-accounts.
    subaccount: { paystackCode: "ACCT_x", flutterwaveId: "RS_x", commissionPct: 10 },
  });
  check("another gateway's payout code is never sent to Monnify as a split", "incomeSplitConfig" in (calls[0].body as object), false);

  reset();
  const tooSmall = await errorOf(() => monnify.monnifyProvider.initializeCheckout({ ...checkoutInput, amountCents: 1_999 }));
  check("an amount under Monnify's ₦20 minimum is refused before any request is made", [tooSmall.kind, calls.length], ["rejected", 0]);

  gateway((call) => (call.path.includes("init-transaction") ? yes({ transactionReference: "x" }) : undefined));
  check(
    "a reply with no checkout page is an error, not a redirect to 'undefined'",
    (await errorOf(() => monnify.monnifyProvider.initializeCheckout(checkoutInput))).kind,
    "bad_response"
  );

  /* ------------------------------------------------------------------------ */
  section("Which academies can be paid");
  /* ------------------------------------------------------------------------ */

  const account = (over: Record<string, unknown> = {}) => ({
    courseSalesEnabled: true,
    platformCommissionPct: 10,
    monnifySubaccountCode: "MFY_SUB_1" as string | null,
    monnifyStatus: "ACTIVE" as "ACTIVE" | "PENDING" | "FAILED" | "SUSPENDED",
    paystackSubaccountCode: null as string | null,
    paystackStatus: "PENDING" as "ACTIVE" | "PENDING" | "FAILED" | "SUSPENDED",
    flutterwaveSubaccountId: null as string | null,
    flutterwaveStatus: "PENDING" as "ACTIVE" | "PENDING" | "FAILED" | "SUSPENDED",
    ...over,
  });

  check("Monnify takes new payments", [providers.activeGateway()?.name, providers.checkoutAvailable()], ["MONNIFY", true]);
  check("an active Monnify payout account yields the split", providers.payoutSplit(account(), "MONNIFY", 1_500_000), {
    commissionPct: 10,
    platformFeeCents: 150_000,
    monnifyCode: "MFY_SUB_1",
  });
  check(
    "no split — and so no sale — unless the payout account is ACTIVE",
    [
      providers.payoutSplit(account({ monnifyStatus: "PENDING" }), "MONNIFY", 1_500_000),
      providers.payoutSplit(account({ monnifyStatus: "FAILED" }), "MONNIFY", 1_500_000),
      providers.payoutSplit(account({ monnifyStatus: "SUSPENDED" }), "MONNIFY", 1_500_000),
      // Marked active, but there is no code to send money to.
      providers.payoutSplit(account({ monnifySubaccountCode: null }), "MONNIFY", 1_500_000),
      providers.payoutSplit(null, "MONNIFY", 1_500_000),
    ],
    [null, null, null, null, null]
  );
  check(
    "a payout account on the old gateway does not count for the new one",
    providers.payoutSplit(
      account({ monnifySubaccountCode: null, monnifyStatus: "PENDING", paystackSubaccountCode: "ACCT_demo", paystackStatus: "ACTIVE" }),
      "MONNIFY",
      1_500_000
    ),
    null
  );
  check(
    "status is reported per gateway, and never ACTIVE without a code",
    [
      providers.payoutStatus(account(), "MONNIFY"),
      providers.payoutStatus(account({ monnifySubaccountCode: null }), "MONNIFY"),
      providers.payoutStatus(account({ monnifyStatus: "FAILED", monnifySubaccountCode: null }), "MONNIFY"),
      providers.payoutStatus(null, "MONNIFY"),
    ],
    ["ACTIVE", "PENDING", "FAILED", "NOT_SET_UP"]
  );

  const active = providers.requireActiveGateway();
  const refusal = (fn: () => unknown) => {
    try {
      fn();
      return "allowed";
    } catch (e) {
      return e instanceof DomainError ? e.code : "threw";
    }
  };
  check(
    "a sale needs sales switched on AND an active payout account",
    [
      refusal(() => providers.requireSaleSplit(account(), active, 1_500_000)),
      refusal(() => providers.requireSaleSplit(account({ courseSalesEnabled: false }), active, 1_500_000)),
      refusal(() => providers.requireSaleSplit(account({ monnifyStatus: "PENDING" }), active, 1_500_000)),
      refusal(() => providers.requireSaleSplit(null, active, 1_500_000)),
    ],
    ["allowed", "sales_disabled", "subaccount_inactive", "sales_disabled"]
  );
  check(
    "an existing payment is confirmed by its own gateway — or nobody, if that gateway is switched off",
    [
      providers.gatewayForPayment("MONNIFY")?.name ?? null,
      providers.gatewayForPayment("PAYSTACK")?.name ?? null,
      providers.gatewayForPayment("FLUTTERWAVE")?.name ?? null,
      providers.gatewayForPayment("MANUAL")?.name ?? null,
    ],
    ["MONNIFY", null, null, null]
  );
  check(
    "gateways are named for people",
    [providers.gatewayLabel("MONNIFY"), providers.gatewayLabel("MANUAL"), providers.gatewayLabel("PAYSTACK"), providers.gatewayLabel(null)],
    ["Monnify", "Recorded by staff", "Paystack", "—"]
  );

  const technical = new monnify.MonnifyError("rejected", "Invalid contract code 0000000001", 400, "99");
  const forCustomer = providers.gatewayError(technical, "customer", "test");
  const forStaff = providers.gatewayError(technical, "staff", "test");
  check("a customer is not shown the gateway's internals", [forCustomer.code, forCustomer.message.includes("contract")], ["gateway_error", false]);
  check("staff are, because they are the ones who can fix it", [forStaff.code, forStaff.message], ["gateway_rejected", "Invalid contract code 0000000001"]);
  check(
    "an outage is reported as temporary to both",
    [
      providers.gatewayError(new monnify.MonnifyError("timeout", "Monnify took too long to respond. Please try again."), "customer", "test").status,
      providers.gatewayError(new monnify.MonnifyError("unavailable", "x"), "staff", "test").code,
    ],
    [503, "gateway_unavailable"]
  );

  /* ------------------------------------------------------------------------ */
  section("Asking Monnify about a payment");
  /* ------------------------------------------------------------------------ */

  const askRef = newReference("course");
  const ask = async (reply: Reply, reference = askRef) => {
    monnify.resetMonnifyTokenCache();
    reset();
    gateway((call) => (call.path.startsWith("/api/v2/merchant/transactions/query") ? reply : undefined));
    const event = await monnify.monnifyProvider.verifyTransaction(reference);
    return event ? { reference: event.reference, status: event.status, amountCents: event.amountCents, currency: event.currency } : null;
  };

  check("a paid transaction is confirmed, in kobo", await ask(transaction(askRef)), {
    reference: askRef,
    status: "success",
    amountCents: 1_500_000,
    currency: "NGN",
  });
  check("it is looked up by our reference", calls[1].path, `/api/v2/merchant/transactions/query?paymentReference=${askRef}`);
  check("an overpaid transaction is confirmed with what was actually paid", (await ask(transaction(askRef, { paymentStatus: "OVERPAID", amountPaid: "15000.50" })))?.amountCents, 1_500_050);
  const unpaid: unknown[] = [];
  for (const paymentStatus of ["PARTIALLY_PAID", "PENDING", "ABANDONED", "CANCELLED", "FAILED", "REVERSED", "EXPIRED", ""]) {
    unpaid.push(await ask(transaction(askRef, { paymentStatus })));
  }
  check("anything short of paid in full is not a confirmation", unpaid, [null, null, null, null, null, null, null, null]);
  check("a transaction Monnify has never heard of is 'not paid', not an error", await ask(no(404, "There's no transaction matching supplied reference")), null);
  check("an answer about a different payment is not an answer", await ask(transaction(newReference("course"))), null);
  check("a paid amount that cannot be read is not a confirmation", await ask(transaction(askRef, { amountPaid: "N/A" })), null);

  monnify.resetMonnifyTokenCache();
  gateway((call) => (call.path.includes("/transactions/query") ? { status: 500, body: {} } : undefined));
  check(
    "when Monnify cannot be asked, that is an error — never mistaken for 'not paid'",
    (await errorOf(() => monnify.monnifyProvider.verifyTransaction(askRef))).kind,
    "unavailable"
  );
  monnify.resetMonnifyTokenCache();
  gateway((call) => (call.path.includes("/transactions/query") ? no(400, "Invalid contract code") : undefined));
  check(
    "…and neither is a refusal that has nothing to do with the payment",
    (await errorOf(() => monnify.monnifyProvider.verifyTransaction(askRef))).kind,
    "rejected"
  );

  /* ------------------------------------------------------------------------ */
  section("Payout accounts");
  /* ------------------------------------------------------------------------ */

  const payout = { bankCode: "058", accountNumber: "0123456789", email: "bursar@example.test", commissionPct: 10 };
  const subAccounts =
    (onCreate: Reply, existing: unknown[] = []) =>
    (call: Call): Reply | undefined => {
      if (call.path !== "/api/v1/sub-accounts") return undefined;
      return call.method === "POST" ? onCreate : yes(existing);
    };

  monnify.resetMonnifyTokenCache();
  reset();
  gateway(subAccounts(yes([{ subAccountCode: "MFY_SUB_NEW", accountName: "Greenfield Academy", accountNumber: "0123456789", bankCode: "058" }])));
  check("a payout account is registered for the academy's share of each sale", await registerMonnifyPayoutAccount(payout), {
    code: "MFY_SUB_NEW",
    accountName: "Greenfield Academy",
    error: null,
  });
  check("…as one entry, in naira, for 100% less the commission", calls[1].body, [
    { currencyCode: "NGN", bankCode: "058", accountNumber: "0123456789", email: "bursar@example.test", defaultSplitPercentage: 90 },
  ]);

  monnify.resetMonnifyTokenCache();
  reset();
  gateway(
    subAccounts(no(400, "Sub account with account number already exists"), [
      { subAccountCode: "MFY_SUB_OTHER", accountNumber: "9999999999", bankCode: "058" },
      { subAccountCode: "MFY_SUB_SAMEACCT_OTHERBANK", accountNumber: "0123456789", bankCode: "044" },
      { subAccountCode: "MFY_SUB_EXISTING", accountNumber: "0123456789", bankCode: "058", accountName: "Greenfield Academy" },
    ])
  );
  check(
    "an account already registered with Monnify is recognised — by number AND bank — instead of failing forever",
    await registerMonnifyPayoutAccount(payout),
    { code: "MFY_SUB_EXISTING", accountName: "Greenfield Academy", error: null }
  );

  monnify.resetMonnifyTokenCache();
  gateway(subAccounts(no(400, "Sub account feature is not enabled for this merchant"), []));
  const notEnabled = await registerMonnifyPayoutAccount(payout);
  check("when Monnify refuses, the academy is told why in Monnify's words", [notEnabled.code, notEnabled.error], [
    null,
    "Monnify could not register the payout account: Sub account feature is not enabled for this merchant",
  ]);

  monnify.resetMonnifyTokenCache();
  reset();
  gateway(subAccounts({ fail: "timeout" }, [{ subAccountCode: "MFY_SUB_EXISTING", accountNumber: "0123456789", bankCode: "058" }]));
  const timedOut = await registerMonnifyPayoutAccount(payout);
  check(
    "a timeout is not evidence the account exists: nothing is adopted, and the academy is told to retry",
    [timedOut.code, timedOut.error?.includes("save again to retry"), paths().filter((p) => p.startsWith("GET")).length],
    [null, true, 0]
  );

  reset();
  check("with no email to register under, nothing is sent", [await registerMonnifyPayoutAccount({ ...payout, email: null }), calls.length], [
    { code: null, accountName: null, error: "Add a business email so the payout account can be registered." },
    0,
  ]);

  monnify.resetMonnifyTokenCache();
  reset();
  gateway((call) =>
    call.path.startsWith("/api/v2/disbursements/account/validate") ? yes({ accountNumber: "0123456789", accountName: "GREENFIELD ACADEMY", bankCode: "058" }) : undefined
  );
  check("a bank account is checked by number and bank, and its name returned", [await monnify.resolveMonnifyAccount({ bankCode: "058", accountNumber: "0123456789" }), calls[1].path], [
    { accountName: "GREENFIELD ACADEMY" },
    "/api/v2/disbursements/account/validate?accountNumber=0123456789&bankCode=058",
  ]);

  /* ------------------------------------------------------------------------ */
  section("Coming back from the payment page");
  /* ------------------------------------------------------------------------ */

  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
  check(
    "the return address uses the scheme and host the customer is really on",
    [
      redirect.requestOrigin(req("http://10.0.0.5:3000/api/x", { host: "demo.example.com", "x-forwarded-proto": "https" })),
      redirect.requestOrigin(req("http://internal/api/x", { "x-forwarded-host": "demo.example.com, proxy.internal", "x-forwarded-proto": "https,http" })),
      redirect.requestOrigin(req("http://demo.localhost:3010/api/x", { host: "demo.localhost:3010" })),
    ],
    ["https://demo.example.com", "https://demo.example.com", "http://demo.localhost:3010"]
  );
  check(
    "a Host header that is not a host is not put into a payment URL",
    [
      redirect.requestOrigin(req("http://demo.localhost:3010/api/x", { host: "evil.test/path?x=" })),
      redirect.requestOrigin(req("http://demo.localhost:3010/api/x", { host: "evil.test@demo.localhost" })),
      redirect.requestOrigin(req("http://demo.localhost:3010/api/x", { "x-forwarded-host": "a b" })),
    ],
    ["http://demo.localhost:3010", "http://demo.localhost:3010", "http://demo.localhost:3010"]
  );

  const backRef = newReference("library");
  const back = redirect.checkoutReturnUrl(req("http://x/api/y", { host: "demo.example.com", "x-forwarded-proto": "https" }), "/library/item123", backRef);
  check("the return address carries our own reference", back, `https://demo.example.com/library/item123?checkout=done&reference=${backRef}`);
  check("…and the page reads it back", redirect.readCheckoutReference(new URL(back).search), backRef);
  check(
    "Monnify's own parameter is understood, however it was appended",
    [
      redirect.readCheckoutReference(`?checkout=done&paymentReference=${backRef}`),
      // Appended properly, after ours.
      redirect.readCheckoutReference(`${new URL(back).search}&paymentReference=${backRef}`),
      // Appended with a second "?", as if the address had no query string.
      redirect.readCheckoutReference(`${new URL(back).search}?paymentReference=${backRef}`),
      redirect.readCheckoutReference(`?reference=${backRef}&checkout=done?paymentReference=${backRef}`),
      redirect.readCheckoutReference(`?checkout=done?paymentReference=${backRef}`),
    ],
    [backRef, backRef, backRef, backRef, backRef]
  );
  check(
    "the older gateways' parameters still work, for payments already in flight",
    [redirect.readCheckoutReference(`?checkout=done&trxref=${backRef}`), redirect.readCheckoutReference(`?checkout=done&tx_ref=${backRef}`)],
    [backRef, backRef]
  );
  check(
    "a page that is not a return from checkout, or a reference we could not have issued, is ignored",
    [
      redirect.readCheckoutReference(`?reference=${backRef}`),
      redirect.readCheckoutReference(`?checkout=cancelled&reference=${backRef}`),
      redirect.readCheckoutReference("?checkout=done"),
      redirect.readCheckoutReference("?checkout=done&reference=<script>alert(1)</script>"),
      redirect.readCheckoutReference("?checkout=done&reference=course_123"),
      redirect.readCheckoutReference(`?checkout=done&reference=${backRef}extra`),
      redirect.readCheckoutReference(""),
    ],
    [null, null, null, null, null, null, null]
  );

  check("nothing in the offline checks reached for a real network", strayCalls, []);

  if (withDb) await databaseChecks();
  else console.log("\n(skipped the database checks — run without --no-db to include them)");

  check("nothing at all reached for a real network", strayCalls, []);
}

/* -------------------------------------------------------------------------- */
/* Fulfilment, against real rows                                               */
/* -------------------------------------------------------------------------- */

async function databaseChecks() {
  // Replace the mail transport before anything builds one. What fulfilment
  // would have emailed is collected here instead of being sent.
  const outbox: { to: string; subject: string; html: string }[] = [];
  const nodemailer = (await import("nodemailer")).default as unknown as { createTransport: (...args: unknown[]) => unknown };
  nodemailer.createTransport = () => ({
    sendMail: async (mail: { to: string; subject: string; html: string }) => {
      outbox.push(mail);
      return { messageId: "verify" };
    },
  });

  const monnify = await import("../lib/billing/monnify");
  const { prisma } = await import("../lib/db/client");
  const { rawPrisma } = await import("../lib/db/raw-client");
  const { runWithContext } = await import("../lib/db/tenant-context");
  const { fulfillPayment } = await import("../lib/billing/fulfillment");
  const { findPaymentByReference } = await import("../lib/billing/payments");
  const { POST } = await import("../app/api/webhooks/monnify/route");

  section("Fulfilment, against the database");

  const tenant = await rawPrisma.tenant.findFirst({ where: { slug: "demo" }, select: { id: true } });
  if (!tenant) {
    console.log("(skipped — there is no `demo` academy in this database)");
    return;
  }
  const t = tenant.id;
  // `await` INSIDE the callback: a Prisma query does not start until it is
  // awaited, and one awaited after `runWithContext` has returned runs with no
  // tenant bound at all.
  const inTenant = <T>(fn: () => Promise<T>) =>
    runWithContext({ mode: "tenant-admin", tenantId: t }, async () => await fn()) as Promise<T>;

  const client = await inTenant(() => prisma.client.findFirst({ where: { tenantId: t }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  if (!client) {
    console.log("(skipped — the demo academy has no learner to buy anything)");
    return;
  }

  const stamp = Date.now();
  const PRICE = 1_500_000; // ₦15,000
  const created = { courses: [] as string[], items: [] as string[], payments: [] as string[] };

  /** Deliver a notification to the real route handler, as Monnify would. */
  const deliver = async (rawBody: string, signature: string | null = sign(rawBody)) => {
    const res = await POST(
      new Request("https://platform.example.test/api/webhooks/monnify", {
        method: "POST",
        headers: { "content-type": "application/json", ...(signature ? { "monnify-signature": signature } : {}) },
        body: rawBody,
      })
    );
    return res.status;
  };
  /** Have Monnify's transaction query answer `reply` for every reference. */
  const monnifySays = (reply: (reference: string) => Reply) => {
    monnify.resetMonnifyTokenCache();
    reset();
    gateway((call) => {
      if (!call.path.startsWith("/api/v2/merchant/transactions/query")) return undefined;
      return reply(new URLSearchParams(call.path.split("?")[1]).get("paymentReference") ?? "");
    });
  };
  const queries = () => calls.filter((c) => c.path.includes("/transactions/query")).length;
  /**
   * Receipts go out after the response. Wait until `expected` have arrived (or
   * give up), then a little longer — long enough for one that should NOT have
   * been sent to show itself.
   */
  const settle = async (expected: number) => {
    for (let waited = 0; outbox.length < expected && waited < 15_000; waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  };

  try {
    const [courseA, courseB, item] = await inTenant(async () => [
      await prisma.course.create({
        data: { tenantId: t, title: `Monnify verification A ${stamp}`, slug: `monnify-verification-a-${stamp}`, status: "DRAFT", priceCents: PRICE },
        select: { id: true },
      }),
      await prisma.course.create({
        data: { tenantId: t, title: `Monnify verification B ${stamp}`, slug: `monnify-verification-b-${stamp}`, status: "DRAFT", priceCents: PRICE },
        select: { id: true },
      }),
      await prisma.libraryItem.create({
        data: { tenantId: t, name: `monnify-verification-${stamp}.pdf`, key: `verify/monnify-${stamp}.pdf`, contentType: "application/pdf", isFree: false, priceCents: 50_000, currency: "NGN" },
        select: { id: true },
      }),
    ]);
    created.courses.push(courseA.id, courseB.id);
    created.items.push(item.id);

    const pendingCourse = async (courseId: string, data: Record<string, unknown> = {}) => {
      const reference = newReference("course");
      const row = await inTenant(() =>
        prisma.coursePayment.create({
          data: {
            tenantId: t,
            courseId,
            clientId: client.id,
            provider: "MONNIFY",
            amountCents: PRICE,
            currency: "NGN",
            externalRef: reference,
            platformFeeCents: 150_000,
            tenantPayoutCents: PRICE - 150_000,
            ...data,
          },
          select: { id: true },
        })
      );
      created.payments.push(row.id);
      return reference;
    };
    const payment = (reference: string) =>
      rawPrisma.coursePayment.findUnique({
        where: { externalRef: reference },
        select: { id: true, status: true, amountCents: true, platformFeeCents: true, tenantPayoutCents: true, completedAt: true, providerData: true },
      });
    const enrolments = (courseId: string) => rawPrisma.enrollment.count({ where: { courseId, clientId: client.id } });
    const audits = (action: string, targetId: string) => rawPrisma.activityLog.count({ where: { tenantId: t, action, targetId } });

    const p1 = await pendingCourse(courseA.id);

    /* ---- Finding the payment ---- */

    const found = await findPaymentByReference(p1, { anyTenant: true });
    check(
      "a reference leads to our own record of what was bought, by whom, for how much",
      found && { kind: found.kind, tenantId: found.tenantId, status: found.status, amountCents: found.amountCents, currency: found.currency, metadata: found.metadata },
      {
        kind: "course_purchase",
        tenantId: t,
        status: "PENDING",
        amountCents: PRICE,
        currency: "NGN",
        metadata: { type: "course_purchase", tenantId: t, courseId: courseA.id, clientId: client.id },
      }
    );
    check(
      "inside a session the lookup is confined to that session's academy",
      [
        (await inTenant(() => findPaymentByReference(p1)))?.kind ?? null,
        await (runWithContext({ mode: "tenant-client", tenantId: "some-other-academy" }, () => findPaymentByReference(p1)) as Promise<unknown>),
      ],
      ["course_purchase", null]
    );
    check("a reference we never issued leads nowhere", await findPaymentByReference(newReference("course"), { anyTenant: true }), null);

    /* ---- Notifications that must change nothing ---- */

    monnifySays((reference) => transaction(reference));
    check(
      "an unsigned notification is acknowledged and ignored — Monnify is not even asked",
      [await deliver(notification(p1), null), queries(), (await payment(p1))?.status, await enrolments(courseA.id)],
      [200, 0, "PENDING", 0]
    );
    check(
      "so is one signed with the wrong secret, and one altered after signing",
      [
        await deliver(notification(p1), sign(notification(p1), "attacker-secret")),
        await deliver(notification(p1).replace("15000", "15001"), sign(notification(p1))),
        queries(),
        (await payment(p1))?.status,
      ],
      [200, 200, 0, "PENDING"]
    );
    check(
      "a signed notification about something other than a collection is ignored",
      [await deliver(JSON.stringify({ eventType: "SUCCESSFUL_DISBURSEMENT", eventData: { reference: p1 } })), queries()],
      [200, 0]
    );

    const stranger = newReference("course");
    check(
      "a signed notification for a reference we never issued grants nothing",
      [await deliver(notification(stranger)), await rawPrisma.coursePayment.count({ where: { externalRef: stranger } })],
      [200, 0]
    );

    // The notification is genuine but stale, replayed, or simply wrong: it says
    // PAID, and Monnify — asked directly — does not.
    monnifySays((reference) => transaction(reference, { paymentStatus: "PENDING", amountPaid: "0.00" }));
    check(
      "a signed 'paid' notification is not believed when Monnify itself says the payment is pending",
      [await deliver(notification(p1)), queries(), (await payment(p1))?.status, await enrolments(courseA.id)],
      [200, 1, "PENDING", 0]
    );

    monnifySays((reference) => transaction(reference, { paymentStatus: "PARTIALLY_PAID", amountPaid: "7500.00" }));
    check(
      "half the price, reported as a part payment, unlocks nothing",
      [await deliver(notification(p1)), (await payment(p1))?.status, await enrolments(courseA.id)],
      [200, "PENDING", 0]
    );

    // The dangerous one. The notification claims the full ₦15,000; Monnify
    // confirms a payment did succeed — for ₦20.
    monnifySays((reference) => transaction(reference, { amountPaid: "20.00", totalPayable: "20.00" }));
    check(
      "a 'successful' payment of ₦20 for a ₦15,000 course unlocks nothing, whatever the notification claimed",
      [await deliver(notification(p1, { amountPaid: 15000 })), (await payment(p1))?.status, await enrolments(courseA.id)],
      [200, "PENDING", 0]
    );
    const p1Row = await payment(p1);
    check("…and the refusal is on the academy's audit trail", await audits("billing.payment_rejected", p1Row!.id), 1);

    monnifySays((reference) => transaction(reference, { currency: "USD" }));
    check(
      "15,000 of the wrong currency unlocks nothing",
      [await deliver(notification(p1)), (await payment(p1))?.status, await enrolments(courseA.id)],
      [200, "PENDING", 0]
    );

    monnifySays(() => ({ status: 500, body: {} }));
    check(
      "when Monnify cannot be asked, the notification is answered with an error so it is sent again",
      [await deliver(notification(p1)), (await payment(p1))?.status],
      [503, "PENDING"]
    );

    const wrongGateway = await fulfillPayment({ reference: p1, status: "success", amountCents: PRICE, currency: "NGN", raw: {} }, "PAYSTACK", { anyTenant: true });
    check("a Monnify payment cannot be confirmed through another gateway's channel", [wrongGateway, (await payment(p1))?.status], [
      { outcome: "ignored", reason: "wrong_gateway" },
      "PENDING",
    ]);
    check("through all of that, not one email was sent", outbox.length, 0);

    /* ---- The payment that should go through ---- */

    monnifySays((reference) => transaction(reference));
    const firstStatus = await deliver(notification(p1));
    await settle(2);
    const paid = await payment(p1);
    check(
      "a signed notification that Monnify confirms, for the full price, is fulfilled",
      [firstStatus, paid?.status, paid?.completedAt != null, await enrolments(courseA.id)],
      [200, "SUCCESS", true, 1]
    );
    check(
      "the enrolment is tied to the payment that bought it",
      (await rawPrisma.enrollment.findFirst({ where: { courseId: courseA.id, clientId: client.id }, select: { paymentId: true } }))?.paymentId,
      paid?.id
    );
    check(
      "the split agreed at checkout is left as it was, and Monnify's account of the payment is kept",
      [paid?.amountCents, paid?.platformFeeCents, paid?.tenantPayoutCents, (paid?.providerData as { paymentStatus?: string } | null)?.paymentStatus],
      [PRICE, 150_000, PRICE - 150_000, "PAID"]
    );
    check("it is recorded once on the audit trail", await audits("course.enrolled", courseA.id), 1);
    check(
      "the learner gets a receipt and an enrolment confirmation",
      outbox.map((m) => m.subject.split(" — ")[0]).sort(),
      ["Payment receipt", "You're enrolled"]
    );
    check("the receipt states the price and the reference", [outbox.some((m) => m.html.includes("15,000")), outbox.some((m) => m.html.includes(p1))], [true, true]);

    /* ---- The same payment, again ---- */

    const replayStatus = [await deliver(notification(p1)), await deliver(notification(p1))];
    await settle(2);
    check(
      "the same notification delivered twice more changes nothing: one enrolment, one audit entry, no more email",
      [replayStatus, await enrolments(courseA.id), await audits("course.enrolled", courseA.id), outbox.length, (await payment(p1))?.completedAt?.getTime() === paid?.completedAt?.getTime()],
      [[200, 200], 1, 1, 2, true]
    );
    const replay = await fulfillPayment({ reference: p1, status: "success", amountCents: 1, currency: "XXX", raw: {} }, "MONNIFY", { anyTenant: true });
    check("a replay is reported as already done, whatever amount it carries", replay, { outcome: "already_fulfilled", kind: "course_purchase" });

    /* ---- Overpayment ---- */

    const p2 = await pendingCourse(courseA.id);
    monnifySays((reference) => transaction(reference, { paymentStatus: "OVERPAID", amountPaid: "15000.50", totalPayable: "15000.00" }));
    const over = await fulfillPayment((await monnify.monnifyProvider.verifyTransaction(p2))!, "MONNIFY", { anyTenant: true });
    check(
      "an overpayment is accepted, the excess is reported, and the books keep the price",
      [over, (await payment(p2))?.status, (await payment(p2))?.amountCents],
      [{ outcome: "fulfilled", kind: "course_purchase", overpaidCents: 50 }, "SUCCESS", PRICE]
    );

    /* ---- A refunded payment stays refunded ---- */

    const p4 = await pendingCourse(courseA.id, { status: "REFUNDED" });
    const enrolledBefore = await audits("course.enrolled", courseA.id);
    monnifySays((reference) => transaction(reference));
    check(
      "a 'paid' notification for a payment that has been refunded does not hand the purchase back",
      [await deliver(notification(p4)), (await payment(p4))?.status, (await audits("course.enrolled", courseA.id)) - enrolledBefore],
      [200, "REFUNDED", 0]
    );

    /* ---- Two notifications at once ---- */

    outbox.length = 0;
    const p3 = await pendingCourse(courseB.id, { platformFeeCents: null, tenantPayoutCents: null });
    monnifySays((reference) => transaction(reference));
    const together = await Promise.all([deliver(notification(p3)), deliver(notification(p3)), deliver(notification(p3))]);
    await settle(2);
    check(
      "three copies arriving at the same moment still make one enrolment, one audit entry and one pair of emails",
      [together, (await payment(p3))?.status, await enrolments(courseB.id), await audits("course.enrolled", courseB.id), outbox.length],
      [[200, 200, 200], "SUCCESS", 1, 1, 2]
    );
    const commission =
      (await rawPrisma.tenantSubaccount.findUnique({ where: { tenantId: t }, select: { platformCommissionPct: true } }))?.platformCommissionPct ??
      Number(process.env.PLATFORM_COMMISSION_PCT ?? 10);
    const p3Row = await payment(p3);
    check(
      "a payment row that had no split recorded is given one, from the academy's commission",
      [p3Row?.platformFeeCents, p3Row?.tenantPayoutCents],
      [Math.round((PRICE * commission) / 100), PRICE - Math.round((PRICE * commission) / 100)]
    );

    /* ---- Library purchases ---- */

    outbox.length = 0;
    const libraryRef = newReference("library");
    const libraryRow = await inTenant(() =>
      prisma.libraryPayment.create({
        data: { tenantId: t, itemId: item.id, clientId: client.id, provider: "MONNIFY", amountCents: 50_000, currency: "NGN", externalRef: libraryRef, platformFeeCents: 5_000, tenantPayoutCents: 45_000 },
        select: { id: true },
      })
    );
    created.payments.push(libraryRow.id);
    // This lookup is what the redirect-verify endpoint could not do before:
    // library payments were simply not among the tables it searched.
    check("a library purchase can be found by its reference", (await findPaymentByReference(libraryRef, { anyTenant: true }))?.metadata, {
      type: "library_purchase",
      tenantId: t,
      itemId: item.id,
      clientId: client.id,
    });
    monnifySays((reference) => transaction(reference, { amountPaid: "500.00", totalPayable: "500.00" }));
    const libraryStatus = await deliver(notification(libraryRef, { amountPaid: 500 }));
    await settle(1);
    check(
      "…and paying for it unlocks the file, with a receipt and no 'enrolled' email",
      [
        libraryStatus,
        (await rawPrisma.libraryPayment.findUnique({ where: { externalRef: libraryRef }, select: { status: true } }))?.status,
        (await rawPrisma.libraryEntitlement.findFirst({ where: { itemId: item.id, clientId: client.id }, select: { source: true, paymentId: true } })),
        outbox.map((m) => m.subject.split(" — ")[0]),
      ],
      [200, "SUCCESS", { source: "PURCHASE", paymentId: libraryRow.id }, ["Payment receipt"]]
    );
  } finally {
    await inTenant(async () => {
      const targets = [...created.courses, ...created.items, ...created.payments];
      if (targets.length) await prisma.activityLog.deleteMany({ where: { tenantId: t, targetId: { in: targets } } });
      // Courses and the item take their payments, enrolments and entitlements with them.
      for (const id of created.courses) await prisma.course.delete({ where: { id } }).catch(() => undefined);
      for (const id of created.items) await prisma.libraryItem.delete({ where: { id } }).catch(() => undefined);
    });
    const left =
      (await rawPrisma.coursePayment.count({ where: { id: { in: created.payments } } })) +
      (await rawPrisma.libraryPayment.count({ where: { id: { in: created.payments } } })) +
      (await rawPrisma.course.count({ where: { id: { in: created.courses } } })) +
      (await rawPrisma.libraryItem.count({ where: { id: { in: created.items } } }));
    console.log(left === 0 ? "\nCleaned up the verification courses, library item and payments." : `\nWARNING: ${left} verification row(s) were left behind.`);
    await prisma.$disconnect();
    await rawPrisma.$disconnect();
  }
}

// Guards against the run ending early with a zero exit code — which would read
// as "all passed" when most checks never ran.
let finished = false;
process.on("exit", (code) => {
  if (!finished && code === 0) {
    console.error("\nverify-monnify exited before finishing.");
    process.exitCode = 1;
  }
});

main()
  .catch((e) => {
    console.error("\nVerification crashed:", e);
    failed++;
  })
  .finally(() => {
    finished = true;
    console.log(failed === 0 ? `\nAll ${total} Monnify checks passed.` : `\n${failed} of ${total} check(s) FAILED.`);
    process.exit(failed === 0 ? 0 : 1);
  });
