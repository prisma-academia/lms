/**
 * lib/crypto/secret-box.ts — encryption at rest for webhook / integration
 * secrets. Pure: no database, no network.
 *
 *  - a value round-trips, and sealing twice never gives the same ciphertext;
 *  - one flipped byte, the wrong aad or the wrong key fails authentication;
 *  - rotation: a v2 box opens v1 values, flags them for re-sealing, re-seals;
 *  - a missing or malformed APP_ENCRYPTION_KEY is a clear error, never clear text.
 *
 *   npm run verify:secret-box
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";

config();
// A throwaway key, whatever .env says, so the check never depends on it.
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");

let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failed++;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}
function throws(fn: () => unknown, pattern?: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return pattern ? pattern.test(e instanceof Error ? e.message : String(e)) : true;
  }
}

async function main() {
  const { createSecretBox, decodeKey, sealSecret, openSecret, encryptionConfigured, SecretBoxError } = await import("../lib/crypto/secret-box");
  const { env } = await import("../lib/env");

  console.log("round trip");
  const k1 = randomBytes(32);
  const box = createSecretBox({ v1: k1 }, "v1");
  const plain = "whsec_" + randomBytes(32).toString("base64url") + " ünïcødé ✓";
  const a = box.seal(plain);
  const b = box.seal(plain);
  check("opens to the same plaintext", box.open(a) === plain);
  check("versioned prefix v1:", a.startsWith("v1:") && a.split(":").length === 4, a);
  check("two seals differ (fresh IV)", a !== b);
  check("plaintext does not appear in the sealed value", !a.includes("whsec_"));

  console.log("integrity");
  const parts = a.split(":");
  const ct = Buffer.from(parts[2], "base64url");
  ct[0] ^= 0x01;
  const tampered = [parts[0], parts[1], ct.toString("base64url"), parts[3]].join(":");
  check("a flipped ciphertext byte fails", throws(() => box.open(tampered), /authentication/));
  const withAad = box.seal(plain, "webhook-endpoint");
  check("right aad opens", box.open(withAad, "webhook-endpoint") === plain);
  check("wrong aad fails", throws(() => box.open(withAad, "integration")));
  check("missing aad fails", throws(() => box.open(withAad)));
  check("another key fails", throws(() => createSecretBox({ v1: randomBytes(32) }, "v1").open(a), /authentication/));
  check("garbage is refused", throws(() => box.open("not-sealed"), /Not a sealed value/));

  console.log("rotation");
  const k2 = randomBytes(32);
  const rotated = createSecretBox({ v1: k1, v2: k2 }, "v2");
  check("v2 box opens a v1 value", rotated.open(a) === plain);
  check("v1 value needs re-sealing", rotated.needsReseal(a));
  const resealed = rotated.reseal(a);
  check("re-sealed under v2", resealed.startsWith("v2:") && rotated.open(resealed) === plain);
  check("re-sealed value does not need re-sealing", !rotated.needsReseal(resealed));
  check("a box without v1 cannot open v1 values (clear message)", throws(() => createSecretBox({ v2: k2 }, "v2").open(a), /No key configured for v1/));
  check("aad survives a reseal", rotated.open(rotated.reseal(withAad, "webhook-endpoint"), "webhook-endpoint") === plain);

  console.log("keys");
  check("decodeKey accepts 32-byte base64", decodeKey(randomBytes(32).toString("base64")).length === 32);
  check("decodeKey accepts base64url", decodeKey(randomBytes(32).toString("base64url")).length === 32);
  check("decodeKey refuses 16 bytes", throws(() => decodeKey(randomBytes(16).toString("base64")), /32 bytes/));
  check("decodeKey refuses non-base64", throws(() => decodeKey("not base64 at all!"), /base64/));
  check("a 31-byte key in a keyring is refused", throws(() => createSecretBox({ v1: randomBytes(31) }, "v1")));
  check("current version must exist", throws(() => createSecretBox({ v1: k1 }, "v2")));

  console.log("env-backed default");
  check("configured with APP_ENCRYPTION_KEY", encryptionConfigured());
  check("sealSecret / openSecret round-trip", openSecret(sealSecret(plain, "x"), "x") === plain);
  const saved = process.env.APP_ENCRYPTION_KEY;
  (env as { APP_ENCRYPTION_KEY?: string }).APP_ENCRYPTION_KEY = undefined;
  delete process.env.APP_ENCRYPTION_KEY;
  check("missing key: encryptionConfigured() is false", !encryptionConfigured());
  let message = "";
  try {
    sealSecret("x");
  } catch (e) {
    message = e instanceof Error ? e.message : "";
    check("missing key throws SecretBoxError", e instanceof SecretBoxError);
  }
  check("missing key message names APP_ENCRYPTION_KEY", /APP_ENCRYPTION_KEY is not set/.test(message), message);
  process.env.APP_ENCRYPTION_KEY = "dG9vLXNob3J0";
  check("malformed key throws a clear error", throws(() => sealSecret("x"), /32 bytes/));
  process.env.APP_ENCRYPTION_KEY = saved;

  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll secret-box checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
