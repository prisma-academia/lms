"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * A same-origin iframe with device-width presets, used wherever an admin needs
 * to see what they are building the way the person receiving it will.
 *
 * An iframe rather than rendering the preview inline: the previewed surfaces are
 * whole pages with their own layout, theme variables and media queries. Rendered
 * into a corner of the editor they would inherit the admin chrome's styles and
 * report the admin window's width to every `@media` query — which makes a
 * responsive preview actively misleading, since the one thing an author checks a
 * narrow preview for is exactly what would be wrong.
 */

const DEVICES = [
  { id: "desktop", label: "Desktop", icon: "monitor", width: null },
  { id: "tablet", label: "Tablet", icon: "tablet", width: 820 },
  { id: "mobile", label: "Mobile", icon: "smartphone", width: 390 },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

export function PreviewFrame({
  src,
  title,
  /**
   * Bump to force a reload — e.g. after a save. Appended to the URL as `_v`,
   * because re-rendering with an unchanged `src` does not navigate the frame.
   */
  refreshToken,
  height = 620,
  openLabel = "Open in new tab",
  className,
}: {
  src: string;
  title: string;
  refreshToken?: string | number;
  height?: number;
  openLabel?: string;
  className?: string;
}) {
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [loading, setLoading] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Derived at render, and left RELATIVE on purpose. A relative iframe src
  // resolves against the parent document, so no `window.location` is needed —
  // which keeps the value identical on the server and the client, and avoids
  // the `about:blank` base a `contentWindow.location` assignment would hit on
  // the first pass, before the frame has a document of its own.
  //
  // The version parameter is what actually forces a reload: writing the same
  // URL back to `src` is a no-op in every browser.
  const frameSrc =
    refreshToken === undefined
      ? src
      : `${src}${src.includes("?") ? "&" : "?"}_v=${encodeURIComponent(String(refreshToken))}`;

  const width = DEVICES.find((d) => d.id === device)?.width ?? null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Preview width"
          className="flex items-center gap-1 rounded-[10px] border-2 border-border bg-card p-1"
        >
          {DEVICES.map((d) => (
            <Button
              key={d.id}
              type="button"
              size="xs"
              variant={device === d.id ? "default" : "ghost"}
              aria-pressed={device === d.id}
              onClick={() => setDevice(d.id)}
            >
              <Icon name={d.icon} />
              {d.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {loading ? (
            <span className="text-xs font-medium text-muted-foreground">Loading…</span>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              setLoading(true);
              frameRef.current?.contentWindow?.location.reload();
            }}
          >
            <Icon name="refresh" />
            Refresh
          </Button>
          <Button asChild size="xs" variant="outline">
            <a href={frameSrc} target="_blank" rel="noopener noreferrer">
              <Icon name="external-link" />
              {openLabel}
            </a>
          </Button>
        </div>
      </div>

      <div className="flex justify-center overflow-x-auto rounded-[14px] border-2 border-border bg-muted p-3">
        <iframe
          ref={frameRef}
          src={frameSrc}
          title={title}
          onLoad={() => setLoading(false)}
          // The preview is our own origin and must run the real page, so it is
          // not sandboxed away from scripts. It is same-origin content the admin
          // already has access to; the iframe is for layout isolation, not
          // privilege isolation.
          className="rounded-[10px] border-2 border-border bg-background shadow-sm"
          style={{
            width: width ? `${width}px` : "100%",
            maxWidth: "100%",
            height: `${height}px`,
            flex: "0 0 auto",
          }}
        />
      </div>
    </div>
  );
}
