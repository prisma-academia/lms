"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/form-field";

type Workspace = { slug: string; name: string };

export function WorkspaceJumpForm() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/workspaces")
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const list: Workspace[] = j?.data?.tenants ?? [];
        setWorkspaces(list);
        if (list.length > 0) setSlug(list[0].slug);
      })
      .catch(() => {
        if (active) setError("Could not load workspaces.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function apexHost(): string {
    const host = window.location.host;
    const prefix = "platform.";
    if (host.startsWith(prefix)) return host.slice(prefix.length);
    return host;
  }

  function jump() {
    if (!slug) {
      setError("Select a workspace.");
      return;
    }
    if (typeof window === "undefined") return;
    const { protocol } = window.location;
    window.location.assign(`${protocol}//${slug}.${apexHost()}/admin/auth/login`);
  }

  const empty = !loading && workspaces.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <FormField label="Workspace" htmlFor="ws-slug" error={error ?? undefined}>
        <select
          id="ws-slug"
          value={slug}
          disabled={loading || empty}
          onChange={(e) => {
            setSlug(e.target.value);
            setError(null);
          }}
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-stone-500 disabled:opacity-60"
        >
          {loading ? (
            <option value="">Loading…</option>
          ) : empty ? (
            <option value="">No workspaces available</option>
          ) : (
            workspaces.map((w) => (
              <option key={w.slug} value={w.slug}>
                {w.name}
              </option>
            ))
          )}
        </select>
      </FormField>
      <Button variant="outline" onClick={jump} disabled={loading || empty}>
        Go to workspace
      </Button>
    </div>
  );
}
