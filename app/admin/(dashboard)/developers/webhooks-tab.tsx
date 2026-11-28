"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { FormField, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client/api";
import { WEBHOOK_EVENTS } from "@/lib/integrations/webhook-catalogue";
import type { EndpointView } from "@/lib/developers/admin";
import { SecretDialog } from "./secret-dialog";
import { pretty, when } from "./format";

type DeliveryRow = {
  id: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "DEAD";
  attempt: number;
  responseStatus: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
  eventId: string;
  eventType: string;
};

type DeliveryDetail = {
  id: string;
  status: string;
  attempt: number;
  url: string;
  eventType: string;
  requestHeaders: Record<string, string> | null;
  requestBody: string;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  nextAttemptAt: string | null;
  createdAt: string;
};

const DELIVERY_BADGE: Record<DeliveryRow["status"], { label: string; color?: string }> = {
  SUCCEEDED: { label: "Delivered", color: "var(--success)" },
  PENDING: { label: "Pending", color: "var(--info)" },
  FAILED: { label: "Retrying", color: "var(--warning)" },
  DEAD: { label: "Gave up", color: "var(--destructive)" },
};

const GROUPS = [...new Set(WEBHOOK_EVENTS.map((e) => e.group))];

export function WebhooksTab({ initialEndpoints, canWrite, available }: { initialEndpoints: EndpointView[]; canWrite: boolean; available: boolean }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [editing, setEditing] = useState<EndpointView | "new" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<EndpointView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const replace = (ep: EndpointView) => setEndpoints((cur) => cur.map((x) => (x.id === ep.id ? ep : x)));

  const test = async (ep: EndpointView) => {
    setBusy(ep.id);
    const res = await apiPost<{ ok: boolean; status: number | null; error: string | null; durationMs: number | null }>(`/api/tenant/developers/webhooks/${ep.id}/test`, {});
    setBusy(null);
    if (res.error || !res.data) return toast(res.error?.message ?? "Could not send the test event.");
    toast(res.data.ok ? `Test delivered: ${res.data.status} in ${res.data.durationMs} ms.` : `Test failed: ${res.data.error ?? res.data.status}`);
  };

  const rotate = async (ep: EndpointView) => {
    const yes = await confirm({
      title: "Rotate the signing secret?",
      description: "A new secret is shown once. For 24 hours every delivery is signed with both the old and the new secret, so you can switch your receiver over without dropping events.",
      confirmLabel: "Rotate secret",
    });
    if (!yes) return;
    setBusy(ep.id);
    const res = await apiPost<{ endpoint: EndpointView; secret: string }>(`/api/tenant/developers/webhooks/${ep.id}/rotate-secret`, {});
    setBusy(null);
    if (res.error || !res.data) return toast(res.error?.message ?? "Could not rotate the secret.");
    replace(res.data.endpoint);
    setSecret(res.data.secret);
  };

  const setStatus = async (ep: EndpointView, status: "ACTIVE" | "DISABLED") => {
    setBusy(ep.id);
    const res = await apiPatch<{ endpoint: EndpointView }>(`/api/tenant/developers/webhooks/${ep.id}`, { status });
    setBusy(null);
    if (res.error || !res.data) return toast(res.error?.message ?? "Could not update the endpoint.");
    replace(res.data.endpoint);
  };

  const remove = async (ep: EndpointView) => {
    const yes = await confirm({
      title: "Delete this endpoint?",
      description: `${ep.url} stops receiving events, and its delivery log is deleted.`,
      confirmLabel: "Delete endpoint",
      destructive: true,
    });
    if (!yes) return;
    setBusy(ep.id);
    const res = await apiDelete(`/api/tenant/developers/webhooks/${ep.id}`);
    setBusy(null);
    if (res.error) return toast(res.error.message);
    setEndpoints((cur) => cur.filter((x) => x.id !== ep.id));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-prose">
            <h2 className="font-heading text-lg">Webhooks</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              We POST a signed JSON event to your https URL when something happens. Failed deliveries are retried for about two days; an endpoint that fails for three days straight is switched off and the owner is emailed.
            </p>
          </div>
          {canWrite && available ? (
            <Button type="button" onClick={() => setEditing("new")}>
              <Icon name="plus" /> Add endpoint
            </Button>
          ) : null}
        </div>
        {!available ? (
          <p className="mt-3 flex items-start gap-2 rounded-[10px] border-2 border-dashed border-border px-3 py-2 text-sm font-medium">
            <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0" />
            Webhooks are unavailable until the server&apos;s APP_ENCRYPTION_KEY is configured.
          </p>
        ) : null}
      </Card>

      {endpoints.length === 0 ? (
        <Card>
          <EmptyState icon="link" title="No endpoints yet">Add one, or let Zapier, Make or n8n subscribe through the API.</EmptyState>
        </Card>
      ) : (
        endpoints.map((ep) => (
          <Card key={ep.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="break-all font-mono text-[13px] font-bold">{ep.url}</code>
                  <Badge color={ep.status === "ACTIVE" ? "var(--success)" : undefined}>{ep.status === "ACTIVE" ? "Active" : "Disabled"}</Badge>
                  {ep.source === "rest_hook" ? <Badge>REST hook</Badge> : null}
                  {ep.rotatingUntil ? <Badge color="var(--info)">Rotating secret</Badge> : null}
                </div>
                {ep.description ? <p className="mt-1 text-sm font-medium">{ep.description}</p> : null}
                <p className="mt-1 text-xs font-medium text-muted-foreground">{ep.events.includes("*") ? "All events" : ep.events.join(" · ")}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  Last success {when(ep.lastSuccessAt)}
                  {ep.consecutiveFailures ? ` · ${ep.consecutiveFailures} failure(s) in a row since ${when(ep.failingSince)}` : ""}
                  {ep.disabledReason ? ` · ${ep.disabledReason}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setLogFor(ep)}>
                  <Icon name="list" /> Deliveries
                </Button>
                {canWrite ? (
                  <>
                    <Button type="button" variant="outline" size="sm" disabled={busy === ep.id || ep.status !== "ACTIVE"} onClick={() => test(ep)}>
                      <Icon name="play" /> Send test event
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy === ep.id} onClick={() => setEditing(ep)}>
                      <Icon name="settings" /> Edit
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy === ep.id || !available} onClick={() => rotate(ep)}>
                      <Icon name="refresh" /> Rotate secret
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy === ep.id} onClick={() => setStatus(ep, ep.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}>
                      <Icon name={ep.status === "ACTIVE" ? "pause" : "play"} /> {ep.status === "ACTIVE" ? "Disable" : "Enable"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy === ep.id} onClick={() => remove(ep)} aria-label="Delete endpoint">
                      <Icon name="trash" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        ))
      )}

      <EndpointDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(ep, newSecret) => {
          setEditing(null);
          setEndpoints((cur) => (cur.some((x) => x.id === ep.id) ? cur.map((x) => (x.id === ep.id ? ep : x)) : [ep, ...cur]));
          if (newSecret) setSecret(newSecret);
        }}
      />
      <DeliveriesSheet endpoint={logFor} canWrite={canWrite} onClose={() => setLogFor(null)} />
      <SecretDialog
        secret={secret}
        title="Signing secret"
        description="Use it to verify the X-Prisma-Signature header on every delivery (see Docs → Webhook signatures)."
        onClose={() => setSecret(null)}
      />
    </div>
  );
}

function EndpointDialog({ target, onClose, onSaved }: { target: EndpointView | "new" | null; onClose: () => void; onSaved: (ep: EndpointView, secret?: string) => void }) {
  const editing = target && target !== "new" ? target : null;
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Reset the form whenever a different target opens it.
  const key = target === null ? null : target === "new" ? "new" : target.id;
  if (key !== openedFor) {
    setOpenedFor(key);
    setUrl(editing?.url ?? "");
    setDescription(editing?.description ?? "");
    setEvents(editing?.events ?? []);
    setError(null);
  }

  const all = events.includes("*");
  const toggle = (type: string, on: boolean) => setEvents((cur) => (on ? [...new Set([...cur.filter((e) => e !== "*"), type])] : cur.filter((e) => e !== type)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (events.length === 0) return setError("Choose at least one event.");
    setSaving(true);
    const body = { url: url.trim(), events, description: description.trim() || null };
    const res = editing
      ? await apiPatch<{ endpoint: EndpointView; secret?: string }>(`/api/tenant/developers/webhooks/${editing.id}`, body)
      : await apiPost<{ endpoint: EndpointView; secret?: string }>("/api/tenant/developers/webhooks", body);
    setSaving(false);
    if (res.error || !res.data) return setError(res.error?.message ?? "Could not save the endpoint.");
    onSaved(res.data.endpoint, res.data.secret);
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogTitle>{editing ? "Edit endpoint" : "Add a webhook endpoint"}</DialogTitle>
        <DialogDescription>https only, and it must be reachable on the public internet.</DialogDescription>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <FormField label="Endpoint URL" htmlFor="wh-url" required>
            <TextInput type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/prisma" required />
          </FormField>
          <FormField label="Description" htmlFor="wh-desc">
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </FormField>
          <fieldset className="flex flex-col gap-3 rounded-[10px] border-2 border-border p-3">
            <legend className="px-1 text-xs font-bold text-muted-foreground">Events</legend>
            <label className="flex items-center gap-2 text-sm font-bold">
              <Checkbox checked={all} onCheckedChange={(v) => setEvents(v === true ? ["*"] : [])} /> Every event, including ones added later
            </label>
            {GROUPS.map((g) => (
              <div key={g}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {WEBHOOK_EVENTS.filter((ev) => ev.group === g).map((ev) => (
                    <label key={ev.type} className="flex items-start gap-2 text-sm" title={ev.description}>
                      <Checkbox
                        className="mt-0.5"
                        disabled={all || !ev.live}
                        checked={all || events.includes(ev.type)}
                        onCheckedChange={(v) => toggle(ev.type, v === true)}
                      />
                      <span>
                        <code className="font-mono text-[12px] font-bold">{ev.type}</code>
                        {!ev.live ? <span className="ml-1 text-[11px] font-bold text-muted-foreground">coming soon</span> : null}
                        <span className="block text-xs font-medium text-muted-foreground">{ev.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Add endpoint"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeliveriesSheet({ endpoint, canWrite, onClose }: { endpoint: EndpointView | null; canWrite: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<DeliveryRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (epId: string, after: string | null) => {
    setLoading(true);
    const res = await apiGet<DeliveryRow[]>(`/api/tenant/developers/webhooks/${epId}/deliveries${after ? `?cursor=${after}` : ""}`);
    setLoading(false);
    if (res.error || !res.data) return toast(res.error?.message ?? "Could not load deliveries.");
    const meta = (res as { meta?: { nextCursor?: string | null } }).meta;
    setRows((cur) => (after && cur ? [...cur, ...res.data!] : res.data!));
    setCursor(meta?.nextCursor ?? null);
  };

  // A different endpoint opened the sheet: forget the previous one's log.
  if (endpoint && endpoint.id !== loadedFor) {
    setLoadedFor(endpoint.id);
    setRows(null);
    setCursor(null);
    setDetail(null);
  }

  const endpointId = endpoint?.id ?? null;
  useEffect(() => {
    if (!endpointId) return;
    let cancelled = false;
    (async () => {
      const res = await apiGet<DeliveryRow[]>(`/api/tenant/developers/webhooks/${endpointId}/deliveries`);
      if (cancelled) return;
      if (res.error || !res.data) {
        setRows([]);
        return;
      }
      setRows(res.data);
      setCursor((res as { meta?: { nextCursor?: string | null } }).meta?.nextCursor ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [endpointId]);

  const open = async (id: string) => {
    const res = await apiGet<DeliveryDetail>(`/api/tenant/developers/deliveries/${id}`);
    if (res.error || !res.data) return toast(res.error?.message ?? "Could not load the delivery.");
    setDetail(res.data);
  };

  const redeliver = async (id: string) => {
    const res = await apiPost<{ ok: boolean; status: number | null; error: string | null }>(`/api/tenant/developers/deliveries/${id}/redeliver`, {});
    if (res.error || !res.data) return toast(res.error?.message ?? "Could not redeliver.");
    toast(res.data.ok ? `Redelivered: ${res.data.status}.` : `Redelivery failed: ${res.data.error ?? res.data.status}`);
    if (endpoint) void load(endpoint.id, null);
  };

  return (
    <Sheet
      open={endpoint !== null}
      onOpenChange={(o) => {
        if (!o) {
          setLoadedFor(null);
          onClose();
        }
      }}
    >
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{detail ? `Delivery · ${detail.eventType}` : "Delivery log"}</SheetTitle>
          <SheetDescription className="break-all">{endpoint?.url}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {detail ? (
            <div className="flex flex-col gap-4 text-sm">
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setDetail(null)}>
                <Icon name="arrow-left" /> All deliveries
              </Button>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                <dt className="font-bold">Status</dt>
                <dd>{detail.status} · attempt {detail.attempt}</dd>
                <dt className="font-bold">Response</dt>
                <dd>{detail.responseStatus ?? "—"}{detail.durationMs != null ? ` in ${detail.durationMs} ms` : ""}</dd>
                {detail.errorMessage ? (<><dt className="font-bold">Error</dt><dd>{detail.errorMessage}</dd></>) : null}
                {detail.nextAttemptAt ? (<><dt className="font-bold">Next retry</dt><dd>{when(detail.nextAttemptAt)}</dd></>) : null}
                <dt className="font-bold">Created</dt>
                <dd>{when(detail.createdAt)}</dd>
              </dl>
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Request headers</h3>
                <pre className="overflow-x-auto rounded-[10px] border-2 border-border bg-background p-3 font-mono text-[12px]">
                  {detail.requestHeaders ? Object.entries(detail.requestHeaders).map(([k, v]) => `${k}: ${v}`).join("\n") : "Not sent yet."}
                </pre>
              </section>
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Request body</h3>
                <pre className="max-h-80 overflow-auto rounded-[10px] border-2 border-border bg-background p-3 font-mono text-[12px]">{pretty(detail.requestBody)}</pre>
              </section>
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Response body (first 2 KB)</h3>
                <pre className="max-h-60 overflow-auto rounded-[10px] border-2 border-border bg-background p-3 font-mono text-[12px]">{pretty(detail.responseBody) || "—"}</pre>
              </section>
            </div>
          ) : rows === null ? (
            <p className="text-sm font-medium text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState icon="mail" title="Nothing delivered yet">Send a test event to see one here.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y-2 divide-border">
              {rows.map((d) => {
                const b = DELIVERY_BADGE[d.status];
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <button type="button" className="min-w-0 text-left outline-none focus-visible:outline-[3px] focus-visible:outline-ring" onClick={() => open(d.id)}>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge color={b.color}>{b.label}</Badge>
                        <code className="font-mono text-[12px] font-bold">{d.eventType}</code>
                        <span className="num text-xs text-muted-foreground">{d.responseStatus ?? "—"}</span>
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                        {when(d.createdAt)} · {d.attempt} attempt(s){d.nextAttemptAt ? ` · retry ${when(d.nextAttemptAt)}` : ""}
                        {d.errorMessage ? ` · ${d.errorMessage}` : ""}
                      </span>
                    </button>
                    {canWrite ? (
                      <Button type="button" variant="outline" size="xs" onClick={() => redeliver(d.id)}>
                        <Icon name="refresh" /> Redeliver
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SheetBody>
        {!detail && cursor && endpoint ? (
          <SheetFooter>
            <Button type="button" variant="outline" disabled={loading} onClick={() => load(endpoint.id, cursor)}>Load more</Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
