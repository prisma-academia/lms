"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/shell";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useApiError } from "@/components/use-api-error";
import { cn } from "@/lib/utils";

type Notif = { id: string; category: string; title: string; body: string | null; readAt: string | null; createdAt: string };
type Pref = { category: string; inApp: boolean; email: boolean };

export function NotificationsClient() {
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [prefs, setPrefs] = useState<Pref[] | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const report = useApiError();
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  const load = useCallback(async () => {
    const [n, p] = await Promise.all([
      apiGet<{ notifications: Notif[] }>("/api/client/notifications"),
      apiGet<{ prefs: Pref[] }>("/api/client/notification-preferences"),
    ]);
    if (!report(n, () => void loadRef.current?.())) return;
    if (!report(p, () => void loadRef.current?.())) return;
    if (n.data) setNotifs(n.data.notifications);
    if (p.data) setPrefs(p.data.prefs);
  }, [report]);

  useEffect(() => {
    loadRef.current = load;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state after await
    void load();
  }, [load]);

  async function markAll() {
    const res = await apiPost("/api/client/notifications", {});
    if (!report(res, () => markAll())) return;
    setNotifs((prev) => (prev ? prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev));
  }

  function togglePref(category: string, channel: "inApp" | "email") {
    setPrefs((prev) => (prev ? prev.map((p) => (p.category === category ? { ...p, [channel]: !p[channel] } : p)) : prev));
  }

  async function savePrefs() {
    if (!prefs) return;
    setSavingPrefs(true);
    setInfo(null);
    const res = await apiPost("/api/client/notification-preferences", { prefs });
    setSavingPrefs(false);
    if (!report(res, () => savePrefs())) return;
    setInfo("Preferences saved.");
  }

  if (!notifs || !prefs) return <Spinner label="Loading…" />;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase text-stone-500">Notifications</h2>
          {notifs.some((n) => !n.readAt) ? (
            <Button type="button" variant="outline" size="sm" onClick={markAll}>Mark all read</Button>
          ) : null}
        </div>
        {notifs.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon="bell" title="No notifications">You are all caught up.</EmptyState>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {notifs.map((n) => (
              <li key={n.id} className={cn("rounded-[10px] border-2 border-border px-3 py-2", n.readAt ? "bg-card" : "bg-muted")}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-sm", n.readAt ? "font-medium" : "font-bold")}>{n.title}</span>
                  <Badge>{n.category}</Badge>
                </div>
                {n.body ? <p className="mt-1 text-xs text-muted-foreground">{n.body}</p> : null}
                <p className="mt-1 text-[11px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Preferences</h2>
        <p className="mt-1 text-xs text-stone-500">Choose how you receive each type of notification.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2">Category</th>
                <th className="py-2 text-center">In-app</th>
                <th className="py-2 text-center">Email</th>
              </tr>
            </thead>
            <tbody>
              {prefs.map((p) => (
                <tr key={p.category} className="border-t border-border">
                  <td className="py-2 font-semibold">{p.category}</td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={p.inApp} onChange={() => togglePref(p.category, "inApp")} className="size-4" />
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={p.email} onChange={() => togglePref(p.category, "email")} className="size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {info ? <p className="mt-2 text-sm text-muted-foreground">{info}</p> : null}
        <div className="mt-3">
          <Button type="button" onClick={savePrefs} disabled={savingPrefs}>
            {savingPrefs ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
