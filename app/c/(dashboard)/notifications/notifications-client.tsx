"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/shell";
import { Spinner } from "@/components/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";
import { formatDateTime, type FormatContext } from "@/lib/format";
import { cn } from "@/lib/utils";
import { categoryLabel } from "../_lib/labels";

type Notif = { id: string; category: string; title: string; body: string | null; readAt: string | null; createdAt: string };
type Pref = { category: string; inApp: boolean; email: boolean };

const SECTION_HEADING = "text-[13px] font-bold text-foreground";

export function NotificationsClient({ format }: { format: FormatContext }) {
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [prefs, setPrefs] = useState<Pref[] | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();
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
    toast("All notifications marked as read.");
  }

  function togglePref(category: string, channel: "inApp" | "email") {
    setPrefs((prev) => (prev ? prev.map((p) => (p.category === category ? { ...p, [channel]: !p[channel] } : p)) : prev));
    setDirty(true);
    setSaved(false);
  }

  async function savePrefs() {
    if (!prefs) return;
    setSavingPrefs(true);
    const res = await apiPost("/api/client/notification-preferences", { prefs });
    setSavingPrefs(false);
    if (!report(res, () => savePrefs())) return;
    setDirty(false);
    setSaved(true);
  }

  if (!notifs || !prefs) return <Spinner label="Loading notifications…" />;

  const unread = notifs.filter((n) => !n.readAt).length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={SECTION_HEADING}>
            Recent
            {unread > 0 ? <span className="num font-medium text-muted-foreground"> · {unread} unread</span> : null}
          </h2>
          {unread > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={markAll}>
              Mark all as read
            </Button>
          ) : null}
        </div>
        {notifs.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon="bell" title="Nothing new">
              Reminders and announcements will appear here as they arrive.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 flex max-h-[28rem] flex-col gap-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            {notifs.map((n) => (
              <li
                key={n.id}
                className={cn("rounded-[10px] border-2 border-border px-3 py-2.5", n.readAt ? "bg-card" : "bg-muted")}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("min-w-0 break-words text-sm", n.readAt ? "font-medium" : "font-bold")}>
                    {/* Read state in words, not only in the weight and tint. */}
                    {n.readAt ? null : <span className="sr-only">Unread: </span>}
                    {n.title}
                  </span>
                  <Badge>{categoryLabel(n.category)}</Badge>
                </div>
                {n.body ? (
                  <p className="mt-1 whitespace-pre-line break-words text-[13px] font-medium text-muted-foreground">
                    {n.body}
                  </p>
                ) : null}
                <p className="num mt-1 text-[11px] font-medium text-muted-foreground">
                  {formatDateTime(n.createdAt, format)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className={SECTION_HEADING}>How you hear about things</h2>
        <p className="mt-1 text-[13px] font-medium text-muted-foreground">
          Choose where each kind of notification reaches you.
        </p>
        <div className="mt-3 max-h-[24rem] overflow-auto overscroll-contain rounded-[10px] border-2 border-border [scrollbar-gutter:stable]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[12px] font-bold text-muted-foreground">
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-muted px-3 py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-border"
                >
                  Kind
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-muted px-3 py-2 text-center after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-border"
                >
                  In the app
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-muted px-3 py-2 text-center after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-border"
                >
                  Email
                </th>
              </tr>
            </thead>
            <tbody>
              {prefs.map((p) => {
                const name = categoryLabel(p.category);
                return (
                  <tr key={p.category} className="border-t-2 border-dashed border-border">
                    <th scope="row" className="px-3 py-2 text-left font-bold">
                      {name}
                    </th>
                    {(["inApp", "email"] as const).map((channel) => (
                      <td key={channel} className="p-0 text-center">
                        {/* The label is the whole cell, so the tap target is 44px
                            even though the box itself is small. */}
                        <label className="flex min-h-11 cursor-pointer items-center justify-center px-3">
                          <input
                            type="checkbox"
                            aria-label={`${channel === "inApp" ? "In the app" : "Email"}: ${name}`}
                            checked={p[channel]}
                            onChange={() => togglePref(p.category, channel)}
                            className="size-5 accent-[var(--primary)]"
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={savePrefs} disabled={savingPrefs}>
            {savingPrefs ? "Saving…" : "Save preferences"}
          </Button>
          {/* Always in the page, so the result is announced when it changes. */}
          <span role="status" className="text-[13px] font-medium text-muted-foreground">
            {dirty ? "You have unsaved changes." : saved ? "Preferences saved." : ""}
          </span>
        </div>
      </Card>
    </div>
  );
}
