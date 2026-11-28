/**
 * Code samples for the in-app API reference, generated from the OpenAPI
 * document: request samples per operation, and webhook-signature verification
 * for receivers. Pure string builders, no rendering.
 */

export type Json = Record<string, unknown>;
export type Doc = { paths: Record<string, Record<string, Json>>; components?: { schemas?: Record<string, Json> } } & Json;

export function resolve(schema: Json | undefined, doc: Doc): Json {
  let s = schema ?? {};
  for (let i = 0; i < 5 && typeof s.$ref === "string"; i++) {
    const name = (s.$ref as string).split("/").pop() ?? "";
    s = doc.components?.schemas?.[name] ?? {};
  }
  return s;
}

/** Strip `null` from a `type` list / `anyOf` so the example shows the real shape. */
function nonNull(schema: Json): Json {
  if (Array.isArray(schema.anyOf)) {
    const real = (schema.anyOf as Json[]).find((s) => s.type !== "null");
    if (real) return { ...real, description: schema.description ?? real.description };
  }
  if (Array.isArray(schema.type)) {
    const t = (schema.type as string[]).find((x) => x !== "null");
    return { ...schema, type: t };
  }
  return schema;
}

function stringExample(name: string, s: Json): string {
  if (Array.isArray(s.enum)) return String(s.enum[0]);
  if (s.format === "email" || /email/i.test(name)) return "ada@example.com";
  if (s.format === "date-time" || /At$|_since$|^from$|^to$/.test(name)) return "2026-12-01T09:00:00Z";
  if (s.format === "uri" || /url/i.test(name)) return "https://example.com/webhooks/prisma";
  if (/firstName/.test(name)) return "Ada";
  if (/lastName/.test(name)) return "Okafor";
  if (/fullName/.test(name)) return "Ada Okafor";
  if (/externalId/i.test(name)) return "STU-00123";
  if (/phone/i.test(name)) return "+2348012345678";
  if (/csv/i.test(name)) return "fullName,email,regNumber\nAda Okafor,ada@example.com,REG001";
  if (/Ids?$|Id$|^id$/.test(name)) return "clx0example0id";
  if (/name|title/i.test(name)) return "Year 10 – Mathematics";
  return "string";
}

export function exampleFor(schema: Json | undefined, doc: Doc, name = "", depth = 0): unknown {
  const s = nonNull(resolve(schema, doc));
  if (depth > 4) return null;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum)) return s.enum[0];
  const type = s.type;
  if (type === "object" || s.properties) {
    const props = (s.properties ?? {}) as Record<string, Json>;
    const required = new Set((s.required as string[] | undefined) ?? []);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      // Requests show required fields plus a couple of common optional ones.
      if (depth === 0 && !required.has(k) && !/^(firstName|lastName|externalId|description|events|url)$/.test(k)) continue;
      out[k] = exampleFor(v, doc, k, depth + 1);
    }
    return out;
  }
  if (type === "array") {
    if (/events/.test(name)) return ["learner.created", "enrollment.completed"];
    return [exampleFor(s.items as Json, doc, name.replace(/s$/, ""), depth + 1)];
  }
  if (type === "integer" || type === "number") {
    if (typeof s.minimum === "number") return Math.max(s.minimum as number, 1);
    return 1;
  }
  if (type === "boolean") return false;
  if (type === "string") return stringExample(name, s);
  return null;
}

export type SampleLang = "curl" | "javascript" | "php" | "python";

export function requestSample(lang: SampleLang, input: { method: string; url: string; body: unknown | null; idempotent: boolean }): string {
  const { method, url, body } = input;
  const M = method.toUpperCase();
  const json = body !== null ? JSON.stringify(body, null, 2) : null;
  const idem = input.idempotent;
  if (lang === "curl") {
    const lines = [`curl -X ${M} '${url}'`, `  -H "Authorization: Bearer $PRISMA_API_KEY"`];
    if (json) lines.push(`  -H 'Content-Type: application/json'`);
    if (idem) lines.push(`  -H "Idempotency-Key: $(uuidgen)"`);
    if (json) lines.push(`  -d '${json.replace(/'/g, "'\\''")}'`);
    return lines.join(" \\\n");
  }
  if (lang === "javascript") {
    return [
      `const res = await fetch("${url}", {`,
      `  method: "${M}",`,
      `  headers: {`,
      `    Authorization: \`Bearer \${process.env.PRISMA_API_KEY}\`,`,
      ...(json ? [`    "Content-Type": "application/json",`] : []),
      ...(idem ? [`    "Idempotency-Key": crypto.randomUUID(),`] : []),
      `  },`,
      ...(json ? [`  body: JSON.stringify(${json.replace(/\n/g, "\n  ")}),`] : []),
      `});`,
      `const { data, error, meta } = await res.json();`,
      `if (error) throw new Error(\`\${error.code}: \${error.message}\`);`,
    ].join("\n");
  }
  if (lang === "php") {
    return [
      `<?php`,
      `$ch = curl_init("${url}");`,
      `curl_setopt_array($ch, [`,
      `    CURLOPT_CUSTOMREQUEST => "${M}",`,
      `    CURLOPT_RETURNTRANSFER => true,`,
      `    CURLOPT_HTTPHEADER => [`,
      `        "Authorization: Bearer " . getenv("PRISMA_API_KEY"),`,
      ...(json ? [`        "Content-Type: application/json",`] : []),
      ...(idem ? [`        "Idempotency-Key: " . bin2hex(random_bytes(16)),`] : []),
      `    ],`,
      ...(json ? [`    CURLOPT_POSTFIELDS => json_encode(${phpArray(body)}),`] : []),
      `]);`,
      `$response = json_decode(curl_exec($ch), true);`,
      `curl_close($ch);`,
      `if ($response["error"]) { throw new Exception($response["error"]["message"]); }`,
      `$data = $response["data"];`,
    ].join("\n");
  }
  return [
    `import os, uuid, requests`,
    ``,
    `res = requests.request(`,
    `    "${M}",`,
    `    "${url}",`,
    `    headers={`,
    `        "Authorization": f"Bearer {os.environ['PRISMA_API_KEY']}",`,
    ...(idem ? [`        "Idempotency-Key": str(uuid.uuid4()),`] : []),
    `    },`,
    ...(json ? [`    json=${pythonLiteral(body)},`] : []),
    `    timeout=30,`,
    `)`,
    `body = res.json()`,
    `if body["error"]:`,
    `    raise RuntimeError(body["error"]["message"])`,
    `data = body["data"]`,
  ].join("\n");
}

function phpArray(v: unknown, indent = "    "): string {
  if (Array.isArray(v)) return `[${v.map((x) => phpArray(x, indent)).join(", ")}]`;
  if (v && typeof v === "object") {
    const inner = Object.entries(v).map(([k, x]) => `${indent}    ${JSON.stringify(k)} => ${phpArray(x, indent + "    ")}`);
    return `[\n${inner.join(",\n")}\n${indent}]`;
  }
  return JSON.stringify(v);
}

function pythonLiteral(v: unknown, indent = "    "): string {
  if (v === null) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (Array.isArray(v)) return `[${v.map((x) => pythonLiteral(x, indent)).join(", ")}]`;
  if (typeof v === "object") {
    const inner = Object.entries(v as Json).map(([k, x]) => `${indent}    ${JSON.stringify(k)}: ${pythonLiteral(x, indent + "    ")}`);
    return `{\n${inner.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(v);
}

export const SIGNATURE_SAMPLES: Record<"node" | "php" | "python", string> = {
  node: `import crypto from "node:crypto";

// rawBody: the request body exactly as received (a string/Buffer, NOT re-serialised JSON).
export function verifyPrismaSignature(rawBody, header, secret, toleranceSec = 300) {
  let t = 0;
  const sigs = [];
  for (const part of (header ?? "").split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "t") t = Number(v);
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest();
  return sigs.some((s) => {
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

// Express: app.post("/webhooks/prisma", express.raw({ type: "application/json" }), (req, res) => {
//   if (!verifyPrismaSignature(req.body.toString("utf8"), req.get("X-Prisma-Signature"), process.env.PRISMA_WEBHOOK_SECRET)) return res.sendStatus(400);
//   const event = JSON.parse(req.body); // { id, type, createdAt, tenantId, data }
//   res.sendStatus(200);
// });`,
  php: `<?php
function verify_prisma_signature(string $rawBody, string $header, string $secret, int $tolerance = 300): bool {
    $t = null; $sigs = [];
    foreach (explode(",", $header) as $part) {
        [$k, $v] = array_pad(explode("=", trim($part), 2), 2, "");
        if ($k === "t") $t = (int) $v;
        if ($k === "v1") $sigs[] = $v;
    }
    if (!$t || abs(time() - $t) > $tolerance) return false;
    $expected = hash_hmac("sha256", $t . "." . $rawBody, $secret);
    foreach ($sigs as $sig) {
        if (hash_equals($expected, $sig)) return true;
    }
    return false;
}

$raw = file_get_contents("php://input");
if (!verify_prisma_signature($raw, $_SERVER["HTTP_X_PRISMA_SIGNATURE"] ?? "", getenv("PRISMA_WEBHOOK_SECRET"))) {
    http_response_code(400); exit;
}
$event = json_decode($raw, true); // ["id", "type", "createdAt", "tenantId", "data"]
http_response_code(200);`,
  python: `import hashlib, hmac, time

def verify_prisma_signature(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    t, sigs = None, []
    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            t = int(value)
        elif key == "v1":
            sigs.append(value)
    if t is None or abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in sigs)

# Flask:
# @app.post("/webhooks/prisma")
# def prisma_webhook():
#     if not verify_prisma_signature(request.get_data(), request.headers.get("X-Prisma-Signature", ""), os.environ["PRISMA_WEBHOOK_SECRET"]):
#         abort(400)
#     event = request.get_json()  # {"id", "type", "createdAt", "tenantId", "data"}
#     return "", 200`,
};
