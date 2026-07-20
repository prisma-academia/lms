"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client/api";
import { Spinner } from "@/components/spinner";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useApiError } from "@/components/use-api-error";
import { cn } from "@/lib/utils";

type Receipt = {
  id: string;
  readAt: string | null;
  message: { subject: string; body: string; category: string; createdAt: string };
};

export function InboxClient() {
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

  if (!receipts) return <Spinner label="Loading inbox…" />;
  if (receipts.length === 0) {
    return (
      <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
        <EmptyState icon="mail" title="No messages">
          You have no messages yet.
        </EmptyState>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {receipts.map((r) => {
        const unread = !r.readAt;
        const isOpen = openId === r.id;
        return (
          <li key={r.id} className="overflow-hidden rounded-[12px] border-2 border-border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => open(r)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className={cn("size-2.5 shrink-0 rounded-full border-2 border-border", unread ? "bg-primary" : "bg-transparent")} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate", unread ? "font-bold" : "font-medium")}>{r.message.subject}</span>
                <span className="block text-xs text-muted-foreground">{new Date(r.message.createdAt).toLocaleString()}</span>
              </span>
              <Badge>{r.message.category}</Badge>
            </button>
            {isOpen ? (
              <div className="border-t-2 border-dashed border-border px-4 py-3 text-sm whitespace-pre-wrap text-foreground">
                {r.message.body}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
