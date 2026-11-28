"use client";

import { useState } from "react";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { apiDelete, apiPost } from "@/lib/client/api";
import { API_SCOPES, SCOPE_PRESETS, type ApiScope } from "@/lib/api/v1/scopes";
import type { KeyView } from "@/lib/developers/admin";
import { SecretDialog } from "./secret-dialog";
import { when } from "./format";

type Preset = keyof typeof SCOPE_PRESETS | "custom";

const STATE_BADGE: Record<KeyView["state"], { label: string; color?: string }> = {
  active: { label: "Active", color: "var(--success)" },
  expiring: { label: "Expiring soon", color: "var(--warning)" },
  expired: { label: "Expired" },
  revoked: { label: "Revoked" },
};

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In 1 year" },
];

export function KeysTab({ keys, onKeysChange, canWrite }: { keys: KeyView[]; onKeysChange: (k: KeyView[]) => void; canWrite: boolean }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const rotate = async (k: KeyView) => {
    const yes = await confirm({
      title: `Rotate “${k.name}”?`,
      description: "A new key with the same scopes is created and shown once. The current key keeps working for 24 hours, then stops — swap it in your integration before then.",
      confirmLabel: "Rotate key",
    });
    if (!yes) return;
    setBusy(k.id);
    const res = await apiPost<{ key: string; apiKey: KeyView; previous: KeyView }>(`/api/tenant/developers/keys/${k.id}/rotate`, {});
    setBusy(null);
    if (res.error || !res.data) return toast(res.error?.message ?? "Could not rotate the key.");
    const { apiKey, previous } = res.data;
    onKeysChange([apiKey, ...keys.map((x) => (x.id === k.id ? previous : x))]);
    setSecret(res.data.key);
  };

  const revoke = async (k: KeyView) => {
    const yes = await confirm({
      title: `Revoke “${k.name}”?`,
      description: "Every request made with this key fails from now on. This cannot be undone.",
      confirmLabel: "Revoke key",
      destructive: true,
    });
    if (!yes) return;
    setBusy(k.id);
    const res = await apiDelete<{ apiKey: KeyView }>(`/api/tenant/developers/keys/${k.id}`);
    setBusy(null);
    if (res.error || !res.data) return toast(res.error?.message ?? "Could not revoke the key.");
    onKeysChange(keys.map((x) => (x.id === k.id ? res.data!.apiKey : x)));
    toast("Key revoked.");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-prose">
            <h2 className="font-heading text-lg">API keys</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Send a key as <code className="font-mono">Authorization: Bearer plms_live_…</code>. Each key has scopes, an optional IP allowlist and expiry, and its own rate limit.
            </p>
          </div>
          {canWrite ? (
            <Button type="button" onClick={() => setCreating(true)}>
              <Icon name="plus" /> Create key
            </Button>
          ) : null}
        </div>
      </Card>

      {keys.length === 0 ? (
        <Card>
          <EmptyState icon="lock" title="No API keys yet">
            {canWrite ? "Create a key to connect another system." : "An owner or admin can create one."}
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {keys.map((k) => {
            const badge = STATE_BADGE[k.state];
            const live = k.state === "active" || k.state === "expiring";
            return (
              <Card key={k.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-base">{k.name}</span>
                      <Badge color={badge.color}>{badge.label}</Badge>
                      {k.rotatedFromId ? <Badge>Rotated</Badge> : null}
                    </div>
                    <code className="mt-1 block font-mono text-[13px] text-muted-foreground">{k.prefix}_••••••••</code>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      {k.scopes.length === Object.keys(API_SCOPES).length ? "All scopes" : k.scopes.join(" · ")}
                    </p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      Created {when(k.createdAt)} · Last used {k.lastUsedAt ? `${when(k.lastUsedAt)}${k.lastUsedIp ? ` from ${k.lastUsedIp}` : ""}` : "never"}
                      {k.expiresAt ? ` · ${k.state === "expired" ? "Expired" : "Expires"} ${when(k.expiresAt)}` : ""}
                      {k.revokedAt ? ` · Revoked ${when(k.revokedAt)}` : ""}
                      {` · ${k.rateLimitPerMin}/min`}
                      {k.ipAllowlist.length ? ` · IPs: ${k.ipAllowlist.join(", ")}` : ""}
                    </p>
                  </div>
                  {canWrite && live ? (
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={busy === k.id} onClick={() => rotate(k)}>
                        <Icon name="refresh" /> Rotate
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={busy === k.id} onClick={() => revoke(k)}>
                        <Icon name="trash" /> Revoke
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateKeyDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(view, key) => {
          onKeysChange([view, ...keys]);
          setCreating(false);
          setSecret(key);
        }}
      />
      <SecretDialog
        secret={secret}
        title="Your new API key"
        description="Copy it into the system that will call the API. Only its prefix is kept on our side."
        onClose={() => setSecret(null)}
      />
    </div>
  );
}

function CreateKeyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (view: KeyView, key: string) => void }) {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<Preset>("readonly");
  const [scopes, setScopes] = useState<ApiScope[]>(SCOPE_PRESETS.readonly.scopes);
  const [ips, setIps] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [rate, setRate] = useState("120");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setScopes([...SCOPE_PRESETS[p].scopes]);
  };
  const toggle = (s: ApiScope, on: boolean) => {
    setPreset("custom");
    setScopes((cur) => (on ? [...new Set([...cur, s])] : cur.filter((x) => x !== s)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Give the key a name, e.g. the system that will use it.");
    if (scopes.length === 0) return setError("Choose at least one scope.");
    setSaving(true);
    const res = await apiPost<{ key: string; apiKey: KeyView }>("/api/tenant/developers/keys", {
      name: name.trim(),
      scopes,
      ipAllowlist: ips.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
      expiresAt: expiry === "never" ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString(),
      rateLimitPerMin: Number(rate) || 120,
    });
    setSaving(false);
    if (res.error || !res.data) return setError(res.error?.message ?? "Could not create the key.");
    setName("");
    setIps("");
    pick("readonly");
    onCreated(res.data.apiKey, res.data.key);
  };

  const presetOptions = [
    ...Object.entries(SCOPE_PRESETS).map(([value, p]) => ({ value: value as Preset, label: p.label })),
    { value: "custom" as Preset, label: "Custom" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogTitle>Create an API key</DialogTitle>
        <DialogDescription>Give it only the scopes the integration needs.</DialogDescription>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <FormField label="Name" htmlFor="key-name" required hint="Who or what uses it, e.g. “School portal sync”.">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
          </FormField>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">Access</span>
            <div className="max-w-full overflow-x-auto pb-1">
              <Segmented ariaLabel="Scope preset" options={presetOptions} value={preset} onChange={pick} />
            </div>
            {preset !== "custom" ? <p className="text-xs font-medium text-muted-foreground">{SCOPE_PRESETS[preset].description}</p> : null}
            <fieldset className="grid gap-2 rounded-[10px] border-2 border-border p-3 sm:grid-cols-2">
              <legend className="px-1 text-xs font-bold text-muted-foreground">Scopes</legend>
              {(Object.keys(API_SCOPES) as ApiScope[]).map((s) => (
                <label key={s} className="flex items-start gap-2 text-sm">
                  <Checkbox checked={scopes.includes(s)} onCheckedChange={(v) => toggle(s, v === true)} className="mt-0.5" />
                  <span>
                    <code className="font-mono text-[12px] font-bold">{s}</code>
                    <span className="block text-xs font-medium text-muted-foreground">{API_SCOPES[s]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          <FormField label="IP allowlist" htmlFor="key-ips" hint="Optional. Addresses or CIDR ranges, one per line or comma-separated. Empty = any address.">
            <TextArea value={ips} onChange={(e) => setIps(e.target.value)} rows={2} placeholder={"41.58.0.0/16\n102.89.12.7"} className="font-mono text-[14px]" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Expires" htmlFor="key-expiry">
              <SelectInput options={EXPIRY_OPTIONS} allowEmpty={false} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </FormField>
            <FormField label="Rate limit (requests / minute)" htmlFor="key-rate" hint="10–1000.">
              <TextInput type="number" min={10} max={1000} value={rate} onChange={(e) => setRate(e.target.value)} />
            </FormField>
          </div>
          {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create key"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
