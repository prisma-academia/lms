"use client";

import { useState } from "react";
import { apiDelete, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * "Subscribe to my calendar": create, replace or switch off a private ICS
 * link. The link is shown once — only its hash is stored — so replacing it is
 * how someone gets it again (and how a leaked one is killed).
 *
 * Used on the learner calendar (/api/client/calendar-feed) and in the admin
 * (/api/tenant/calendar-feed).
 */

export type FeedStatus = { active: boolean; createdAt: string | null; lastUsedAt: string | null };

type Urls = { https: string; webcal: string };

function when(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
}

export function CalendarFeedCard({
  endpoint,
  initial,
  title = "Subscribe to my calendar",
  description = "Add your sessions, deadlines and exams to Google Calendar, Apple Calendar or Outlook. It stays up to date by itself.",
  compact = false,
}: {
  endpoint: string;
  initial: FeedStatus;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<FeedStatus>(initial);
  const [urls, setUrls] = useState<Urls | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (status.active) {
      const yes = await confirm({
        title: "Replace your calendar link?",
        description: "The current link stops working. Calendars subscribed to it stop updating until you subscribe with the new one.",
        confirmLabel: "Replace link",
      });
      if (!yes) return;
    }
    setBusy(true);
    const res = await apiPost<{ urls: Urls; feed: FeedStatus }>(endpoint, {});
    setBusy(false);
    if (!res.data) return toast(res.error?.message ?? "Could not create the link.");
    setUrls(res.data.urls);
    setStatus(res.data.feed);
  }

  async function turnOff() {
    const yes = await confirm({
      title: "Turn off your calendar link?",
      description: "Calendars subscribed to it stop updating. You can create a new link at any time.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (!yes) return;
    setBusy(true);
    const res = await apiDelete<{ feed: FeedStatus }>(endpoint);
    setBusy(false);
    if (!res.data) return toast(res.error?.message ?? "Could not turn the link off.");
    setUrls(null);
    setStatus(res.data.feed);
    toast("Calendar link turned off.");
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Link copied.");
    } catch {
      toast("Copy failed — select the link and copy it yourself.");
    }
  }

  return (
    <section
      aria-labelledby="calendar-feed-title"
      className={compact ? "" : "rounded-[14px] border-2 border-border bg-card p-5 shadow-md"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="calendar-feed-title" className="flex items-center gap-2 font-heading text-base">
            <Icon name="calendar" className="size-4" />
            {title}
          </h2>
          <p className="mt-1 max-w-prose text-sm font-medium text-muted-foreground">{description}</p>
          {status.active ? (
            <p className="mt-1 text-xs font-bold text-muted-foreground">
              Link active since {when(status.createdAt)}
              {status.lastUsedAt ? ` · last fetched ${when(status.lastUsedAt)}` : " · not fetched yet"}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" size="sm" onClick={create} disabled={busy}>
            <Icon name={status.active ? "refresh" : "link"} />
            {status.active ? "Replace link" : "Create link"}
          </Button>
          {status.active ? (
            <Button type="button" size="sm" variant="outline" onClick={turnOff} disabled={busy}>
              Turn off
            </Button>
          ) : null}
        </div>
      </div>

      {urls ? (
        <div className="mt-4 space-y-3 rounded-[10px] border-2 border-dashed border-border p-3">
          <p className="text-xs font-bold">Copy this link now — it is shown only once. Keep it private: anyone with it can see your calendar.</p>
          <div className="flex gap-2">
            <input
              readOnly
              aria-label="Calendar subscription link"
              value={urls.https}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-[10px] border-2 border-border bg-background px-3 py-2 font-mono text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => copy(urls.https)}>
              Copy
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <a
              className="font-bold underline decoration-primary decoration-2 underline-offset-2"
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(urls.webcal)}`}
              target="_blank"
              rel="noreferrer"
            >
              Add to Google Calendar
            </a>
            <span aria-hidden>·</span>
            <a className="font-bold underline decoration-primary decoration-2 underline-offset-2" href={urls.webcal}>
              Open in Apple Calendar / Outlook
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
