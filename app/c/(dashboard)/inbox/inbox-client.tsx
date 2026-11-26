"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Spinner } from "@/components/spinner";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { useApiError } from "@/components/use-api-error";
import { formatDateTime, type FormatContext } from "@/lib/format";
import { cn } from "@/lib/utils";
import { categoryLabel } from "../_lib/labels";

type Receipt = {
  id: string;
  readAt: string | null;
  message: { subject: string; body: string; category: string; createdAt: string };
};

export function InboxClient({ format }: { format: FormatContext }) {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const report = useApiError();
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  const load = useCallback(async () => {
    const res = await apiGet<{ receipts: Receipt[] }>("/api/client/inbox");
    if (!report(res, () => void loadRef.current?.())) return;
    if (res.data) setReceipts(res.data.receipts);
  }, [report]);

  useEffect(() => {
    loadRef.current = load;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state after await
    void load();
  }, [load]);

  async function markRead(r: Receipt) {
    const res = await apiPost("/api/client/inbox", { recipientId: r.id });
    if (!report(res, () => markRead(r))) return;
    setReceipts((prev) =>
      prev ? prev.map((x) => (x.id === r.id ? { ...x, readAt: new Date().toISOString() } : x)) : prev
    );
  }

  function open(r: Receipt) {
    setOpenId((prev) => (prev === r.id ? null : r.id));
    if (!r.readAt) void markRead(r);
  }

  if (!receipts) return <Spinner label="Loading messages…" />;
  if (receipts.length === 0) {
    return (
      <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
        <EmptyState icon="mail" title="No messages yet">
          Announcements and messages from your instructors will appear here.
        </EmptyState>
      </div>
    );
  }

  const unreadCount = receipts.filter((r) => !r.readAt).length;

  return (
    <div>
      <p className="mb-3 text-[13px] font-bold text-muted-foreground" aria-live="polite">
        {unreadCount > 0
          ? `${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`
          : "You've read everything"}
      </p>
      <ul className="flex flex-col gap-2">
        {receipts.map((r) => {
          const unread = !r.readAt;
          const isOpen = openId === r.id;
          const panelId = `message-${r.id}`;
          return (
            <li key={r.id} className="overflow-hidden rounded-[12px] border-2 border-border bg-card shadow-sm">
              <h2 className="m-0">
                <button
                  type="button"
                  onClick={() => open(r)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none [touch-action:manipulation] hover:bg-muted focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring"
                >
                  {/* The dot is decoration; "Unread" is said in words below. */}
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 shrink-0 rounded-full border-2 border-border",
                      unread ? "bg-primary" : "bg-transparent"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block break-words text-sm", unread ? "font-bold" : "font-medium")}>
                      {r.message.subject}
                    </span>
                    <span className="block text-xs font-medium text-muted-foreground">
                      {unread ? <span className="font-bold text-foreground">Unread · </span> : null}
                      {formatDateTime(r.message.createdAt, format)}
                    </span>
                  </span>
                  <Badge className="hidden sm:inline-flex">{categoryLabel(r.message.category)}</Badge>
                  <Icon
                    name={isOpen ? "chevron-down" : "chevron-right"}
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </button>
              </h2>
              {isOpen ? (
                <div
                  id={panelId}
                  className="border-t-2 border-dashed border-border px-4 py-3 text-sm leading-relaxed text-foreground"
                >
                  <p className="mb-2 sm:hidden">
                    <Badge>{categoryLabel(r.message.category)}</Badge>
                  </p>
                  <p className="whitespace-pre-wrap break-words">{r.message.body}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
