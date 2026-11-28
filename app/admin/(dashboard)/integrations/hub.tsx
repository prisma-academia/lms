"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { CATEGORY_LABELS, PROVIDERS, type IntegrationCategory, type ProviderField, type ProviderInfo } from "@/lib/integrations/registry";
import { DEFAULT_ALERT_EVENTS } from "@/lib/integrations/registry";
import { WEBHOOK_EVENTS } from "@/lib/integrations/webhook-catalogue";
import type { IntegrationView } from "@/lib/integrations/store";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CalendarFeedCard, type FeedStatus } from "@/components/calendar-feed-card";

type Props = {
  initial: IntegrationView[];
  canWrite: boolean;
  encryptionReady: boolean;
  googleReady: boolean;
  ssoRedirectUri: string;
  googleRedirectUri: string;
  staffFeed: FeedStatus | null;
  googleOutcome: string | null;
};

const CATEGORIES: IntegrationCategory[] = ["alerts", "automation", "calendar", "sso"];

const GOOGLE_OUTCOMES: Record<string, string> = {
  connected: "Google Calendar connected.",
  denied: "Google access was not granted.",
  expired: "That Google sign-in expired. Try Connect again.",
  browser_mismatch: "Finish connecting Google in the same browser you started in.",
  wrong_user: "The Google connection was started by another staff member.",
  failed: "Google did not complete the connection. Try again.",
};

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function StatusBadge({ rows }: { rows: IntegrationView[] }) {
  if (rows.length === 0) return <Badge>Not connected</Badge>;
  const failing = rows.some((r) => r.lastError);
  const label = rows.length > 1 ? `${rows.length} connected` : rows[0].status === "DISABLED" ? "Switched off" : "Connected";
  return <Badge color={failing ? "var(--warning)" : rows[0].status === "DISABLED" && rows.length === 1 ? "var(--muted)" : "var(--success)"}>{failing ? `${label} · error` : label}</Badge>;
}

export function IntegrationsHub(props: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<IntegrationView[]>(props.initial);
  const [open, setOpen] = useState<ProviderInfo | null>(null);

  // Once, on arrival back from the Google consent screen.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    if (props.googleOutcome && GOOGLE_OUTCOMES[props.googleOutcome]) toast(GOOGLE_OUTCOMES[props.googleOutcome]);
  }, [props.googleOutcome, toast]);

  const byProvider = useMemo(() => {
    const m = new Map<string, IntegrationView[]>();
    for (const r of rows) m.set(r.provider, [...(m.get(r.provider) ?? []), r]);
    return m;
  }, [rows]);

  const upsertRow = (row: IntegrationView) => setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row]));
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  // Turning auto-create on for one meeting provider turns it off for the other.
  const refreshMeetingExclusivity = (row: IntegrationView) => {
    if ((row.provider === "zoom" || row.provider === "google_calendar") && row.config.autoCreate === true) {
      setRows((prev) => prev.map((r) => (r.id !== row.id && (r.provider === "zoom" || r.provider === "google_calendar") ? { ...r, config: { ...r.config, autoCreate: false } } : r)));
    }
  };

  return (
    <div className="space-y-10">
      {!props.encryptionReady ? (
        <Card className="border-destructive">
          <p className="text-sm font-bold">
            Integrations are unavailable until the platform operator sets APP_ENCRYPTION_KEY — credentials are never stored unencrypted.
          </p>
        </Card>
      ) : null}

      {CATEGORIES.map((cat) => {
        const providers = PROVIDERS.filter((p) => p.category === cat);
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="font-heading text-lg">
              {CATEGORY_LABELS[cat].title}
            </h2>
            <p className="mb-4 max-w-prose text-sm font-medium text-muted-foreground">{CATEGORY_LABELS[cat].blurb}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {providers.map((p) =>
                p.id === "ics" ? (
                  <Card key={p.id} className="sm:col-span-2">
                    <ProviderHeading p={p} badge={<Badge color="var(--success)">Always on</Badge>} />
                    <Steps steps={p.steps} />
                    {props.staffFeed ? (
                      <div className="mt-4 border-t-2 border-border pt-4">
                        <CalendarFeedCard
                          compact
                          endpoint="/api/tenant/calendar-feed"
                          initial={props.staffFeed}
                          title="Your staff calendar link"
                          description="Every event and published exam in the academy, in your own calendar app."
                        />
                      </div>
                    ) : null}
                  </Card>
                ) : p.id === "automation" ? (
                  <Card key={p.id} className="sm:col-span-2">
                    <ProviderHeading p={p} badge={<Badge>Uses API keys</Badge>} />
                    <Steps steps={p.steps} />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href="/admin/developers" className={buttonVariants({ size: "sm" })}>
                        <Icon name="code" />
                        Open Developers
                      </Link>
                      <a href="https://zapier.com/apps/webhook/integrations" target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
                        Zapier webhooks <Icon name="external-link" />
                      </a>
                      <a href="https://www.make.com/en/help/tools/webhooks" target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
                        Make webhooks <Icon name="external-link" />
                      </a>
                      <a href="https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/" target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
                        n8n Webhook node <Icon name="external-link" />
                      </a>
                    </div>
                  </Card>
                ) : (
                  <ProviderCard key={p.id} p={p} rows={byProvider.get(p.id) ?? []} onOpen={() => setOpen(p)} canWrite={props.canWrite} googleReady={props.googleReady} />
                )
              )}
            </div>
          </section>
        );
      })}

      <Sheet open={open !== null} onOpenChange={(v) => (!v ? setOpen(null) : undefined)}>
        {open ? (
          <ProviderSheet
            key={open.id}
            p={open}
            rows={byProvider.get(open.id) ?? []}
            canWrite={props.canWrite && props.encryptionReady}
            googleReady={props.googleReady}
            redirectUri={open.category === "sso" ? props.ssoRedirectUri : props.googleRedirectUri}
            onSaved={(row) => {
              upsertRow(row);
              refreshMeetingExclusivity(row);
            }}
            onRemoved={removeRow}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function ProviderHeading({ p, badge }: { p: ProviderInfo; badge: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-heading text-base">{p.name}</h3>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">{p.description}</p>
      </div>
      <div className="shrink-0">{badge}</div>
    </div>
  );
}

function Steps({ steps, redirectUri }: { steps: string[]; redirectUri?: string }) {
  return (
    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm font-medium">
      {steps.map((s) => {
        if (redirectUri && s.includes("{redirectUri}")) {
          const [before, after] = s.split("{redirectUri}");
          return (
            <li key={s}>
              {before}
              <code className="break-all rounded bg-muted px-1 py-0.5 text-xs font-bold">{redirectUri}</code>
              {after}
            </li>
          );
        }
        return <li key={s}>{s.replace("{redirectUri}", "(shown when you open it)")}</li>;
      })}
    </ol>
  );
}

function ProviderCard({ p, rows, onOpen, canWrite, googleReady }: { p: ProviderInfo; rows: IntegrationView[]; onOpen: () => void; canWrite: boolean; googleReady: boolean }) {
  const error = rows.find((r) => r.lastError);
  const unavailable = p.id === "google_calendar" && !googleReady && rows.length === 0;
  return (
    <Card className="flex flex-col">
      <ProviderHeading p={p} badge={<StatusBadge rows={rows} />} />
      {rows.length > 0 && p.multiple ? (
        <ul className="mt-3 space-y-1 text-sm font-bold">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="truncate">{r.name || p.name}</span>
              {r.status === "DISABLED" ? <span className="text-xs text-muted-foreground">(off)</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {p.id === "google_calendar" && rows[0]?.config.email ? (
        <p className="mt-2 text-sm font-medium">Account: {String(rows[0].config.email)}</p>
      ) : null}
      {error?.lastError ? (
        <p className="mt-2 text-xs font-bold text-destructive">
          Last error{error.lastErrorAt ? ` (${timeAgo(error.lastErrorAt)})` : ""}: {error.lastError}
        </p>
      ) : null}
      {unavailable ? <p className="mt-2 text-xs font-bold text-muted-foreground">Not available yet: the platform&rsquo;s Google OAuth client is not configured.</p> : null}
      <div className="mt-auto pt-4">
        <Button type="button" size="sm" variant={rows.length > 0 ? "outline" : "default"} onClick={onOpen} disabled={unavailable && !canWrite}>
          {rows.length > 0 ? "Manage" : canWrite ? "Set up" : "View"}
        </Button>
      </div>
    </Card>
  );
}

type FormState = { name: string; config: Record<string, unknown>; secrets: Record<string, string>; enabled: boolean };

function blankForm(p: ProviderInfo): FormState {
  const config: Record<string, unknown> = {};
  for (const f of p.fields) {
    if (f.type === "events") config[f.key] = DEFAULT_ALERT_EVENTS.filter((e) => WEBHOOK_EVENTS.some((w) => w.type === e && w.live));
    if (f.type === "toggle") config[f.key] = false;
    if (f.type === "select") config[f.key] = f.options?.[0]?.value ?? "";
  }
  return { name: "", config, secrets: {}, enabled: true };
}

function formFor(row: IntegrationView): FormState {
  const config = { ...row.config };
  if (Array.isArray(config.allowedDomains)) config.allowedDomains = (config.allowedDomains as string[]).join(", ");
  return { name: row.name, config, secrets: {}, enabled: row.status !== "DISABLED" };
}

function ProviderSheet({
  p,
  rows,
  canWrite,
  googleReady,
  redirectUri,
  onSaved,
  onRemoved,
}: {
  p: ProviderInfo;
  rows: IntegrationView[];
  canWrite: boolean;
  googleReady: boolean;
  redirectUri: string;
  onSaved: (row: IntegrationView) => void;
  onRemoved: (id: string) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  // Which connection the form edits: an id, "new", or null (list only).
  const [editing, setEditing] = useState<string | "new" | null>(rows.length === 0 && p.kind === "connection" ? "new" : !p.multiple && rows[0] ? rows[0].id : null);
  const current = rows.find((r) => r.id === editing) ?? null;
  const [form, setForm] = useState<FormState>(() => (current ? formFor(current) : blankForm(p)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(target: string | "new") {
    const row = rows.find((r) => r.id === target);
    setEditing(target);
    setForm(row ? formFor(row) : blankForm(p));
    setError(null);
  }

  const setConfig = (key: string, value: unknown) => setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));

  async function save() {
    setBusy(true);
    setError(null);
    const body = { provider: p.id, name: form.name, config: form.config, secrets: form.secrets, enabled: form.enabled };
    const res = current
      ? await apiPatch<{ integration: IntegrationView }>(`/api/tenant/integrations/${current.id}`, body)
      : await apiPost<{ integration: IntegrationView }>("/api/tenant/integrations", body);
    setBusy(false);
    if (!res.data) {
      setError(res.error?.message ?? "Could not save.");
      return;
    }
    onSaved(res.data.integration);
    setEditing(res.data.integration.id);
    setForm(formFor(res.data.integration));
    toast(current ? "Saved." : `${p.name} connected.`);
  }

  async function test(row: IntegrationView) {
    setBusy(true);
    const res = await apiPost<{ success: boolean; message: string; integration: IntegrationView | null }>(`/api/tenant/integrations/${row.id}/test`, {});
    setBusy(false);
    if (!res.data) return toast(res.error?.message ?? "The test failed.");
    if (res.data.integration) onSaved(res.data.integration);
    toast(res.data.message);
  }

  async function disconnect(row: IntegrationView) {
    const yes = await confirm({
      title: `Disconnect ${row.name || p.name}?`,
      description:
        p.category === "sso"
          ? "People can no longer sign in with it. Their accounts stay; they can still use a password or email code."
          : p.id === "google_calendar"
            ? "Access is revoked at Google too. Meetings already created keep their links."
            : "The saved credentials are deleted. You can connect again at any time.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!yes) return;
    setBusy(true);
    const res = await apiDelete<{ deleted: boolean }>(`/api/tenant/integrations/${row.id}`);
    setBusy(false);
    if (!res.data) return toast(res.error?.message ?? "Could not disconnect.");
    onRemoved(row.id);
    setEditing(p.multiple ? null : "new");
    setForm(blankForm(p));
    toast("Disconnected.");
  }

  async function connectGoogle() {
    setBusy(true);
    const res = await apiPost<{ url: string }>("/api/tenant/integrations/google/start", {});
    if (!res.data) {
      setBusy(false);
      return toast(res.error?.message ?? "Could not start the Google connection.");
    }
    window.location.assign(res.data.url);
  }

  const fields = p.fields.filter((f) => f.key !== "name");
  const nameField = p.fields.find((f) => f.key === "name");
  const showForm = p.kind === "connection" ? editing !== null : p.id === "google_calendar" && current !== null;

  return (
    <SheetContent className="sm:max-w-lg">
      <SheetHeader>
        <SheetTitle>{p.name}</SheetTitle>
        <SheetDescription>{p.description}</SheetDescription>
      </SheetHeader>
      <SheetBody className="space-y-5">
        <div>
          <h3 className="text-sm font-bold">How to set it up</h3>
          <Steps steps={p.steps} redirectUri={redirectUri} />
          {p.category === "sso" || p.id === "google_calendar" ? (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {p.category === "sso" ? "Redirect URI for your identity provider:" : "The platform's redirect URI (set by the operator):"}{" "}
              <code className="break-all font-bold">{redirectUri}</code>
            </p>
          ) : null}
          {p.docsUrl ? (
            <a href={p.docsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-bold underline decoration-primary decoration-2 underline-offset-2">
              {p.name} documentation <Icon name="external-link" className="size-3.5" />
            </a>
          ) : null}
        </div>

        {p.multiple && rows.length > 0 ? (
          <div>
            <h3 className="text-sm font-bold">Connections</h3>
            <ul className="mt-2 divide-y-2 divide-border rounded-[10px] border-2 border-border">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {r.name || p.name} {r.status === "DISABLED" ? <span className="text-xs text-muted-foreground">(off)</span> : null}
                    </p>
                    {r.lastError ? <p className="text-xs font-bold text-destructive">{r.lastError}</p> : r.lastSyncAt ? <p className="text-xs text-muted-foreground">Last OK {timeAgo(r.lastSyncAt)}</p> : null}
                  </div>
                  <Button type="button" size="xs" variant="outline" onClick={() => edit(r.id)} disabled={busy}>
                    Edit
                  </Button>
                  {canWrite ? (
                    <Button type="button" size="xs" variant="outline" onClick={() => test(r)} disabled={busy}>
                      {p.category === "alerts" ? "Send test" : "Test"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {canWrite && editing !== "new" ? (
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => edit("new")}>
                <Icon name="plus" /> Add another
              </Button>
            ) : null}
          </div>
        ) : null}

        {p.id === "google_calendar" && !current ? (
          <div className="rounded-[10px] border-2 border-dashed border-border p-4">
            {googleReady ? (
              <Button type="button" onClick={connectGoogle} disabled={busy || !canWrite}>
                <Icon name="calendar" /> Connect Google Calendar
              </Button>
            ) : (
              <p className="text-sm font-bold">
                The platform operator has not configured Google OAuth yet (GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, redirect URI <code className="break-all">{redirectUri}</code>).
              </p>
            )}
          </div>
        ) : null}

        {p.id === "google_calendar" && current?.config.email ? (
          <p className="text-sm font-medium">
            Connected as <strong>{String(current.config.email)}</strong>
            {current.lastSyncAt ? ` · last OK ${timeAgo(current.lastSyncAt)}` : ""}
          </p>
        ) : null}

        {showForm ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h3 className="text-sm font-bold">{current ? `Settings${p.multiple ? ` — ${current.name}` : ""}` : "New connection"}</h3>
            {nameField ? (
              <FormField label={nameField.label} htmlFor="int-name" hint={nameField.hint} required={nameField.required}>
                <TextInput value={form.name} placeholder={nameField.placeholder} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={!canWrite} />
              </FormField>
            ) : null}
            {fields.map((f) => (
              <Field key={f.key} field={f} form={form} current={current} canWrite={canWrite} setConfig={setConfig} setSecret={(k, v) => setForm((s) => ({ ...s, secrets: { ...s.secrets, [k]: v } }))} />
            ))}
            {current ? (
              <label className="flex items-center gap-2 text-sm font-bold">
                <Checkbox checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v === true }))} disabled={!canWrite} />
                Switched on
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm font-bold text-destructive">
                {error}
              </p>
            ) : null}
            {canWrite ? (
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : current ? "Save" : "Connect"}
              </Button>
            ) : null}
          </form>
        ) : null}
      </SheetBody>
      {current && canWrite ? (
        <SheetFooter className="flex flex-wrap gap-2">
          {!p.multiple ? (
            <Button type="button" variant="outline" onClick={() => test(current)} disabled={busy}>
              Test connection
            </Button>
          ) : null}
          <Button type="button" variant="destructive" onClick={() => disconnect(current)} disabled={busy}>
            Disconnect{p.multiple ? ` ${current.name}` : ""}
          </Button>
        </SheetFooter>
      ) : null}
    </SheetContent>
  );
}

function Field({
  field: f,
  form,
  current,
  canWrite,
  setConfig,
  setSecret,
}: {
  field: ProviderField;
  form: FormState;
  current: IntegrationView | null;
  canWrite: boolean;
  setConfig: (key: string, value: unknown) => void;
  setSecret: (key: string, value: string) => void;
}) {
  const id = `int-${f.key}`;
  if (f.type === "secret") {
    const hint = current?.secretHints[f.key];
    return (
      <FormField label={f.label} htmlFor={id} required={f.required && !hint} hint={hint ? `Saved (${hint}). Leave blank to keep it.` : f.hint}>
        <TextInput
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={hint ? "••••••••" : f.placeholder}
          value={form.secrets[f.key] ?? ""}
          onChange={(e) => setSecret(f.key, e.target.value)}
          disabled={!canWrite}
        />
      </FormField>
    );
  }
  if (f.type === "toggle") {
    return (
      <div>
        <label className="flex items-start gap-2 text-sm font-bold">
          <Checkbox id={id} checked={form.config[f.key] === true} onCheckedChange={(v) => setConfig(f.key, v === true)} disabled={!canWrite} className="mt-0.5" />
          <span>{f.label}</span>
        </label>
        {f.hint ? <p className="ml-7 mt-1 text-xs font-medium text-muted-foreground">{f.hint}</p> : null}
      </div>
    );
  }
  if (f.type === "select") {
    return (
      <FormField label={f.label} htmlFor={id} required={f.required}>
        <SelectInput allowEmpty={false} options={f.options ?? []} value={String(form.config[f.key] ?? "")} onChange={(e) => setConfig(f.key, e.target.value)} disabled={!canWrite} />
      </FormField>
    );
  }
  if (f.type === "events") {
    const picked = Array.isArray(form.config[f.key]) ? (form.config[f.key] as string[]) : [];
    const groups = [...new Set(WEBHOOK_EVENTS.map((e) => e.group))];
    const toggle = (type: string, on: boolean) => setConfig(f.key, on ? [...new Set([...picked, type])] : picked.filter((t) => t !== type));
    return (
      <fieldset>
        <legend className="text-[13px] font-bold">{f.label}</legend>
        <div className="mt-2 space-y-3">
          {groups.map((g) => (
            <div key={g}>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{g}</p>
              <div className="mt-1 space-y-1">
                {WEBHOOK_EVENTS.filter((e) => e.group === g).map((e) => (
                  <label key={e.type} className="flex items-start gap-2 text-sm">
                    <Checkbox checked={picked.includes(e.type)} onCheckedChange={(v) => toggle(e.type, v === true)} disabled={!canWrite || (!e.live && !picked.includes(e.type))} className="mt-0.5" />
                    <span>
                      <span className="font-bold">{e.type}</span>
                      {e.live ? null : <span className="text-xs text-muted-foreground"> · coming soon</span>}
                      <span className="block text-xs text-muted-foreground">{e.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    );
  }
  // text, url, domains
  return (
    <FormField label={f.label} htmlFor={id} required={f.required} hint={f.hint}>
      <TextInput
        type={f.type === "url" ? "url" : "text"}
        placeholder={f.placeholder}
        value={String(form.config[f.key] ?? "")}
        onChange={(e) => setConfig(f.key, e.target.value)}
        disabled={!canWrite}
        spellCheck={false}
      />
    </FormField>
  );
}
