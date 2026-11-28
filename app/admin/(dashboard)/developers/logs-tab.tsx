"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import { apiGet } from "@/lib/client/api";
import type { KeyView } from "@/lib/developers/admin";
import { when } from "./format";

type LogRow = {
  id: string;
  requestId: string;
  method: string;
  path: string;
  query: string | null;
  status: number;
  durationMs: number;
  errorCode: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  keyId: string;
  keyName: string;
  keyPrefix: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "2xx", label: "2xx success" },
  { value: "4xx", label: "4xx client error" },
  { value: "5xx", label: "5xx server error" },
  { value: "401", label: "401 unauthenticated" },
  { value: "403", label: "403 forbidden" },
  { value: "429", label: "429 rate limited" },
];

function statusColor(s: number): string | undefined {
  if (s >= 500) return "var(--destructive)";
  if (s >= 400) return "var(--warning)";
  if (s >= 200 && s < 300) return "var(--success)";
  return undefined;
}

export function LogsTab({ keys }: { keys: KeyView[] }) {
  const [keyId, setKeyId] = useState("");
  const [status, setStatus] = useState("");
  const [path, setPath] = useState("");
  const [applied, setApplied] = useState({ keyId: "", status: "", path: "" });
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (f: typeof applied, after: string | null) => {
    const qs = new URLSearchParams();
    if (f.keyId) qs.set("keyId", f.keyId);
    if (f.status) qs.set("status", f.status);
    if (f.path) qs.set("path", f.path);
    if (after) qs.set("cursor", after);
    return apiGet<LogRow[]>(`/api/tenant/developers/logs?${qs.toString()}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchPage(applied, null);
      if (cancelled) return;
      if (res.error || !res.data) {
        setError(res.error?.message ?? "Could not load the request log.");
        setRows([]);
        return;
      }
      setError(null);
      setRows(res.data);
      setCursor((res as { meta?: { nextCursor?: string | null } }).meta?.nextCursor ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [applied, fetchPage]);

  const more = async () => {
    if (!cursor) return;
    const res = await fetchPage(applied, cursor);
    if (res.error || !res.data) return setError(res.error?.message ?? "Could not load more.");
    setRows((cur) => [...(cur ?? []), ...res.data!]);
    setCursor((res as { meta?: { nextCursor?: string | null } }).meta?.nextCursor ?? null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setRows(null);
            setApplied({ keyId, status, path: path.trim() });
          }}
        >
          <FormField label="Key" htmlFor="log-key">
            <SelectInput
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="Any key"
              options={keys.map((k) => ({ value: k.id, label: `${k.name} (${k.prefix})` }))}
            />
          </FormField>
          <FormField label="Status" htmlFor="log-status">
            <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} allowEmpty={false} />
          </FormField>
          <FormField label="Path contains" htmlFor="log-path">
            <TextInput value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/v1/learners" />
          </FormField>
          <Button type="submit">Filter</Button>
        </form>
      </Card>

      <Card className="p-0">
        {error ? <p role="alert" className="p-4 text-sm font-bold text-destructive">{error}</p> : null}
        {rows === null ? (
          <p className="p-4 text-sm font-medium text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon="list" title="No requests">Requests made with your API keys appear here for 30 days.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="border-b-2 border-border text-xs font-bold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-2 py-2.5">Request</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5 text-right">ms</th>
                  <th className="px-4 py-2.5">Key</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      className="cursor-pointer border-b border-border hover:bg-accent/40"
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                      aria-expanded={open === r.id}
                    >
                      <td className="num whitespace-nowrap px-4 py-2 text-muted-foreground">{when(r.createdAt)}</td>
                      <td className="px-2 py-2">
                        <span className="font-mono">
                          <b>{r.method}</b> {r.path}
                          {r.query ? <span className="text-muted-foreground">?{r.query}</span> : null}
                        </span>
                      </td>
                      <td className="px-2 py-2"><Badge color={statusColor(r.status)}>{r.status}</Badge></td>
                      <td className="num px-2 py-2 text-right">{r.durationMs}</td>
                      <td className="px-4 py-2">{r.keyName}</td>
                    </tr>
                    {open === r.id ? (
                      <tr className="border-b border-border bg-background">
                        <td colSpan={5} className="px-4 py-3">
                          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
                            <dt className="font-bold">Request id</dt><dd className="font-mono">{r.requestId}</dd>
                            <dt className="font-bold">Key</dt><dd className="font-mono">{r.keyPrefix}</dd>
                            <dt className="font-bold">Error code</dt><dd className="font-mono">{r.errorCode ?? "—"}</dd>
                            <dt className="font-bold">IP</dt><dd className="font-mono">{r.ip ?? "—"}</dd>
                            <dt className="font-bold">User agent</dt><dd className="break-all font-mono">{r.userAgent ?? "—"}</dd>
                          </dl>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor ? (
          <div className="border-t-2 border-border p-3">
            <Button type="button" variant="outline" onClick={more}>Load more</Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
