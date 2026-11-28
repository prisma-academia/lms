"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import type { EndpointView, KeyView } from "@/lib/developers/admin";
import { KeysTab } from "./keys-tab";
import { WebhooksTab } from "./webhooks-tab";
import { LogsTab } from "./logs-tab";
import { UsageTab } from "./usage-tab";
import { DocsTab } from "./docs-tab";

export type PortalTab = "keys" | "webhooks" | "logs" | "usage" | "docs";

const OPTIONS: { value: PortalTab; label: string }[] = [
  { value: "keys", label: "API keys" },
  { value: "webhooks", label: "Webhooks" },
  { value: "logs", label: "Logs" },
  { value: "usage", label: "Usage" },
  { value: "docs", label: "Docs" },
];

export function DevelopersPortal(props: {
  initialTab: PortalTab;
  initialKeys: KeyView[];
  initialEndpoints: EndpointView[];
  canWrite: boolean;
  apiBase: string;
  webhooksAvailable: boolean;
}) {
  const [tab, setTab] = useState<PortalTab>(props.initialTab);
  const [keys, setKeys] = useState(props.initialKeys);

  const choose = (next: PortalTab) => {
    setTab(next);
    // Remembered in the URL so a reload (or a shared link) opens the same tab.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-full overflow-x-auto pb-1">
        <Segmented ariaLabel="Developer sections" options={OPTIONS} value={tab} onChange={choose} />
      </div>
      {tab === "keys" ? <KeysTab keys={keys} onKeysChange={setKeys} canWrite={props.canWrite} /> : null}
      {tab === "webhooks" ? (
        <WebhooksTab initialEndpoints={props.initialEndpoints} canWrite={props.canWrite} available={props.webhooksAvailable} />
      ) : null}
      {tab === "logs" ? <LogsTab keys={keys} /> : null}
      {tab === "usage" ? <UsageTab keys={keys} /> : null}
      {tab === "docs" ? <DocsTab apiBase={props.apiBase} /> : null}
    </div>
  );
}
