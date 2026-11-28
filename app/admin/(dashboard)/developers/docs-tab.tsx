"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { FormField, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { exampleFor, requestSample, resolve, SIGNATURE_SAMPLES, type Doc, type Json, type SampleLang } from "./docs-samples";

type Op = { id: string; method: string; path: string; op: Json };

/** Wall-clock for the "Try it" timer; only ever called from the send handler. */
function clockMs(): number {
  return performance.now();
}

const METHOD_COLOR: Record<string, string> = {
  get: "var(--info)",
  post: "var(--success)",
  put: "var(--warning)",
  patch: "var(--warning)",
  delete: "var(--destructive)",
};

function typeLabel(s: Json, doc: Doc): string {
  if (typeof s.$ref === "string") return (s.$ref as string).split("/").pop() ?? "object";
  if (Array.isArray(s.anyOf)) return (s.anyOf as Json[]).map((x) => typeLabel(x, doc)).join(" | ");
  if (Array.isArray(s.enum)) return (s.enum as unknown[]).map((v) => JSON.stringify(v)).join(" | ");
  if (Array.isArray(s.type)) return (s.type as string[]).join(" | ");
  if (s.type === "array") return `${typeLabel((s.items as Json) ?? {}, doc)}[]`;
  return (s.type as string) ?? "any";
}

/** Our own schema renderer: a property list, nesting objects a few levels deep. */
function SchemaView({ schema, doc, depth = 0 }: { schema: Json; doc: Doc; depth?: number }) {
  let s = resolve(schema, doc);
  if (s.type === "array" && s.items) s = resolve(s.items as Json, doc);
  const props = (s.properties ?? {}) as Record<string, Json>;
  const required = new Set((s.required as string[] | undefined) ?? []);
  if (Object.keys(props).length === 0) return <p className="text-xs font-medium text-muted-foreground">{typeLabel(schema, doc)}</p>;
  return (
    <ul className={cn("flex flex-col gap-2", depth > 0 && "mt-2 border-l-2 border-border pl-3")}>
      {Object.entries(props).map(([name, raw]) => {
        const p = resolve(raw, doc);
        const nested = depth < 2 && (p.properties || (p.type === "array" && (resolve(p.items as Json, doc).properties)));
        return (
          <li key={name} className="text-[13px]">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <code className="font-mono font-bold">{name}</code>
              <span className="font-mono text-[12px] text-muted-foreground">{typeLabel(raw, doc)}</span>
              {required.has(name) ? <span className="text-[11px] font-bold text-destructive">required</span> : null}
            </div>
            {typeof (raw.description ?? p.description) === "string" ? (
              <p className="text-xs font-medium text-muted-foreground">{String(raw.description ?? p.description)}</p>
            ) : null}
            {nested ? <SchemaView schema={raw} doc={doc} depth={depth + 1} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="max-h-96 overflow-auto rounded-[10px] border-2 border-border bg-background p-3 pr-20 font-mono text-[12px] leading-relaxed">{code}</pre>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="absolute right-2 top-2"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function TryIt({ op, doc, apiKey, setApiKey }: { op: Op; doc: Doc; apiKey: string; setApiKey: (k: string) => void }) {
  const params = ((op.op.parameters ?? []) as Json[]).map((p) => ({ name: p.name as string, in: p.in as string, required: !!p.required }));
  const body = op.op.requestBody as Json | undefined;
  const bodySchema = body ? ((body.content as Json)["application/json"] as Json).schema as Json : undefined;
  const [values, setValues] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState(() => (bodySchema ? JSON.stringify(exampleFor(bodySchema, doc), null, 2) : ""));
  const [result, setResult] = useState<{ status: number; ms: number; headers: [string, string][]; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    if (!apiKey.trim()) return setError("Paste an API key first.");
    let path = op.path;
    for (const p of params.filter((x) => x.in === "path")) {
      const v = values[`path:${p.name}`]?.trim();
      if (!v) return setError(`Fill in {${p.name}}.`);
      path = path.replace(`{${p.name}}`, encodeURIComponent(v));
    }
    const qs = new URLSearchParams();
    for (const p of params.filter((x) => x.in === "query")) {
      const v = values[`query:${p.name}`]?.trim();
      if (v) qs.set(p.name, v);
    }
    if (bodySchema && bodyText.trim()) {
      try {
        JSON.parse(bodyText);
      } catch {
        return setError("The body is not valid JSON.");
      }
    }
    setSending(true);
    const started = clockMs();
    try {
      const res = await fetch(`/api/v1${path}${qs.size ? `?${qs.toString()}` : ""}`, {
        method: op.method.toUpperCase(),
        // The API ignores cookies; leaving them off keeps this a true key-only call.
        credentials: "omit",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          ...(bodySchema ? { "Content-Type": "application/json" } : {}),
        },
        body: bodySchema ? bodyText : undefined,
      });
      const text = await res.text();
      const keep = ["x-request-id", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "idempotent-replayed", "retry-after"];
      setResult({
        status: res.status,
        ms: Math.round(clockMs() - started),
        headers: keep.flatMap((h) => (res.headers.get(h) ? [[h, res.headers.get(h)!] as [string, string]] : [])),
        body: (() => {
          try {
            return JSON.stringify(JSON.parse(text), null, 2);
          } catch {
            return text;
          }
        })(),
      });
    } catch {
      setError("The request did not complete (network error).");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <FormField label="API key" htmlFor="try-key" hint="Kept in this tab only, never saved. Requests are real: writes change your academy's data.">
        <TextInput type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="plms_live_…" className="font-mono text-[14px]" />
      </FormField>
      {params.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {params.map((p) => (
            <FormField key={`${p.in}:${p.name}`} label={`${p.name}${p.in === "path" ? " (path)" : ""}`} htmlFor={`try-${p.in}-${p.name}`} required={p.required}>
              <TextInput value={values[`${p.in}:${p.name}`] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [`${p.in}:${p.name}`]: e.target.value }))} className="font-mono text-[14px]" />
            </FormField>
          ))}
        </div>
      ) : null}
      {bodySchema ? (
        <FormField label="Body (JSON)" htmlFor="try-body">
          <TextArea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={8} className="font-mono text-[13px]" spellCheck={false} />
        </FormField>
      ) : null}
      {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}
      <div>
        <Button type="button" onClick={send} disabled={sending}>
          <Icon name="play" /> {sending ? "Sending…" : "Send request"}
        </Button>
      </div>
      {result ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold">
            <Badge color={result.status < 300 ? "var(--success)" : result.status < 500 ? "var(--warning)" : "var(--destructive)"}>{result.status}</Badge>
            <span className="num text-muted-foreground">{result.ms} ms</span>
          </div>
          {result.headers.length ? (
            <pre className="overflow-x-auto rounded-[10px] border-2 border-border bg-background p-2 font-mono text-[12px]">{result.headers.map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
          ) : null}
          <CodeBlock code={result.body} />
        </div>
      ) : null}
    </div>
  );
}

function OperationView({ op, doc, apiBase, apiKey, setApiKey }: { op: Op; doc: Doc; apiBase: string; apiKey: string; setApiKey: (k: string) => void }) {
  const [lang, setLang] = useState<SampleLang>("curl");
  const body = op.op.requestBody as Json | undefined;
  const bodySchema = body ? (((body.content as Json)["application/json"] as Json).schema as Json) : undefined;
  const responses = (op.op.responses ?? {}) as Record<string, Json>;
  const okCode = Object.keys(responses).find((c) => /^2/.test(c)) ?? "200";
  const okSchema = ((((responses[okCode]?.content as Json)?.["application/json"] as Json)?.schema as Json)?.properties as Json)?.data as Json | undefined;
  const params = (op.op.parameters ?? []) as Json[];
  const sample = requestSample(lang, {
    method: op.method,
    url: `${apiBase}${op.path}`,
    body: bodySchema ? exampleFor(bodySchema, doc) : null,
    idempotent: ["post", "put", "patch"].includes(op.method),
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={METHOD_COLOR[op.method]}>{op.method.toUpperCase()}</Badge>
          <code className="break-all font-mono text-[14px] font-bold">/api/v1{op.path}</code>
        </div>
        <h2 className="mt-2 font-heading text-lg">{String(op.op.summary ?? "")}</h2>
        {op.op.description ? <p className="mt-1 max-w-prose text-sm font-medium text-muted-foreground">{String(op.op.description)}</p> : null}
        <p className="mt-2 text-xs font-bold">
          Scope: <code className="font-mono">{op.op["x-scope"] ? String(op.op["x-scope"]) : "any valid key"}</code>
        </p>
      </div>

      {params.length ? (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Parameters</h3>
          <ul className="flex flex-col gap-2">
            {params.map((p) => (
              <li key={`${p.in}:${p.name}`} className="text-[13px]">
                <code className="font-mono font-bold">{String(p.name)}</code>{" "}
                <span className="font-mono text-[12px] text-muted-foreground">{String(p.in)} · {typeLabel((p.schema as Json) ?? {}, doc)}</span>
                {p.required ? <span className="ml-2 text-[11px] font-bold text-destructive">required</span> : null}
                {p.description ? <p className="text-xs font-medium text-muted-foreground">{String(p.description)}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {bodySchema ? (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Request body</h3>
          <SchemaView schema={bodySchema} doc={doc} />
        </section>
      ) : null}

      {okSchema ? (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Response {okCode} · <code className="font-mono normal-case">data</code>: {typeLabel(okSchema, doc)}
          </h3>
          <SchemaView schema={okSchema} doc={doc} />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Example</h3>
        <div className="max-w-full overflow-x-auto pb-1">
          <Segmented
            ariaLabel="Language"
            value={lang}
            onChange={setLang}
            options={[
              { value: "curl", label: "curl" },
              { value: "javascript", label: "JavaScript" },
              { value: "php", label: "PHP" },
              { value: "python", label: "Python" },
            ]}
          />
        </div>
        <CodeBlock code={sample} />
      </section>

      <section className="flex flex-col gap-2 rounded-[14px] border-2 border-dashed border-border p-4">
        <h3 className="font-heading text-base">Try it</h3>
        <TryIt key={op.id} op={op} doc={doc} apiKey={apiKey} setApiKey={setApiKey} />
      </section>
    </div>
  );
}

function Guide({ doc, apiBase }: { doc: Doc; apiBase: string }) {
  const scopes = (doc["x-scopes"] ?? {}) as Record<string, string>;
  return (
    <div className="flex max-w-prose flex-col gap-4 text-sm font-medium">
      <h2 className="font-heading text-lg">Getting started</h2>
      <p>
        Base URL <code className="break-all font-mono font-bold">{apiBase}</code>. Authenticate every request with a key from the API keys tab:
      </p>
      <CodeBlock code={`curl ${apiBase}/me \\\n  -H "Authorization: Bearer $PRISMA_API_KEY"`} />
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Every response is <code className="font-mono">{"{ data, error, meta }"}</code>. Errors carry a stable <code className="font-mono">error.code</code>.</li>
        <li>Lists take <code className="font-mono">limit</code> (≤100), <code className="font-mono">cursor</code> (from <code className="font-mono">meta.nextCursor</code>), <code className="font-mono">updated_since</code> and <code className="font-mono">order</code>.</li>
        <li>Send an <code className="font-mono">Idempotency-Key</code> on POST, PUT and PATCH: a retry with the same key replays the first response for 24 hours.</li>
        <li>Each key has a per-minute limit; watch <code className="font-mono">X-RateLimit-Remaining</code>. Over it, you get 429 with <code className="font-mono">Retry-After</code>.</li>
        <li>Quote <code className="font-mono">X-Request-Id</code> when asking for help — it is in the Logs tab too.</li>
        <li>Sign learners in from your own portal with <code className="font-mono">POST /learners/{"{id}"}/login-link</code>, then redirect them to the returned URL.</li>
      </ul>
      <h3 className="mt-2 font-heading text-base">Scopes</h3>
      <ul className="flex flex-col gap-1">
        {Object.entries(scopes).map(([k, v]) => (
          <li key={k}>
            <code className="font-mono text-[12px] font-bold">{k}</code> <span className="text-muted-foreground">— {v}</span>
          </li>
        ))}
      </ul>
      <p>
        The machine-readable spec is at <a className="font-bold underline" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">/api/v1/openapi.json</a> (OpenAPI 3.1) — import it into Postman, Insomnia or a code generator.
      </p>
    </div>
  );
}

function Signatures({ doc }: { doc: Doc }) {
  const [lang, setLang] = useState<"node" | "php" | "python">("node");
  const events = (doc["x-webhook-events"] ?? []) as Array<{ type: string; description: string; live: boolean }>;
  return (
    <div className="flex flex-col gap-4 text-sm font-medium">
      <h2 className="font-heading text-lg">Webhook signatures</h2>
      <div className="max-w-prose space-y-2">
        <p>Every delivery is a POST with a JSON body <code className="font-mono">{"{ id, type, createdAt, tenantId, data }"}</code> and three headers:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><code className="font-mono">X-Prisma-Event</code> — the event type.</li>
          <li><code className="font-mono">X-Prisma-Delivery</code> — this delivery&apos;s id (a redelivery gets a new one; the body&apos;s <code className="font-mono">id</code> stays the same, so dedupe on that).</li>
          <li><code className="font-mono">X-Prisma-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code> — HMAC-SHA256 of <code className="font-mono">t + &quot;.&quot; + rawBody</code> with your endpoint secret. During a secret rotation there are two <code className="font-mono">v1</code> values; accept either.</li>
        </ul>
        <p>Reject timestamps more than 5 minutes old, compare in constant time, and answer 2xx within 10 seconds (do slow work afterwards). Anything else is retried after 1 m, 5 m, 30 m, 2 h, 6 h, 12 h and 24 h.</p>
      </div>
      <div className="max-w-full overflow-x-auto pb-1">
        <Segmented ariaLabel="Language" value={lang} onChange={setLang} options={[{ value: "node", label: "Node.js" }, { value: "php", label: "PHP" }, { value: "python", label: "Python" }]} />
      </div>
      <CodeBlock code={SIGNATURE_SAMPLES[lang]} />
      <h3 className="font-heading text-base">Events</h3>
      <ul className="flex flex-col gap-1">
        {events.map((e) => (
          <li key={e.type}>
            <code className="font-mono text-[12px] font-bold">{e.type}</code>
            {!e.live ? <span className="ml-1 text-[11px] font-bold text-muted-foreground">coming soon</span> : null}
            <span className="text-muted-foreground"> — {e.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DocsTab({ apiBase }: { apiBase: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("guide");
  const [apiKey, setApiKey] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/openapi.json", { credentials: "omit" })
      .then((r) => r.json())
      .then((d: Doc) => {
        if (!cancelled) setDoc(d);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the API reference.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ops = useMemo<Op[]>(() => {
    if (!doc) return [];
    return Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => ({ id: `${method} ${path}`, method, path, op }))
    );
  }, [doc]);

  const tags = useMemo(() => [...new Set(ops.map((o) => ((o.op.tags as string[]) ?? ["Other"])[0]))], [ops]);
  const needle = filter.trim().toLowerCase();
  const visible = (o: Op) => !needle || o.path.toLowerCase().includes(needle) || String(o.op.summary ?? "").toLowerCase().includes(needle);
  const current = ops.find((o) => o.id === selected);

  if (error) return <Card><p role="alert" className="text-sm font-bold text-destructive">{error}</p></Card>;
  if (!doc) return <Card><p className="text-sm font-medium text-muted-foreground">Loading the reference…</p></Card>;

  const navButton = (id: string, label: React.ReactNode) => (
    <button
      key={id}
      type="button"
      onClick={() => setSelected(id)}
      aria-current={selected === id ? "page" : undefined}
      className={cn(
        "w-full rounded-[8px] px-2 py-1.5 text-left text-[13px] font-medium outline-none focus-visible:outline-[3px] focus-visible:outline-ring",
        selected === id ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <nav aria-label="API reference" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            {navButton("guide", "Getting started")}
            {navButton("signatures", "Webhook signatures")}
          </div>
          <TextInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter endpoints" aria-label="Filter endpoints" className="py-1.5 text-[14px]" />
          {tags.map((tag) => {
            const items = ops.filter((o) => ((o.op.tags as string[]) ?? ["Other"])[0] === tag && visible(o));
            if (!items.length) return null;
            return (
              <div key={tag}>
                <p className="mb-1 px-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tag}</p>
                <div className="flex flex-col gap-0.5">
                  {items.map((o) =>
                    navButton(
                      o.id,
                      <span className="flex items-baseline gap-2">
                        <span className="w-11 shrink-0 font-mono text-[10px] font-bold uppercase">{o.method}</span>
                        <span className="min-w-0 break-all">{String(o.op.summary ?? o.path)}</span>
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </nav>
      </Card>
      <Card className="min-w-0">
        {selected === "guide" ? <Guide doc={doc} apiBase={apiBase} /> : null}
        {selected === "signatures" ? <Signatures doc={doc} /> : null}
        {current ? <OperationView key={current.id} op={current} doc={doc} apiBase={apiBase} apiKey={apiKey} setApiKey={setApiKey} /> : null}
      </Card>
    </div>
  );
}
