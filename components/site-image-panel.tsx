"use client";

import { useCallback, useRef, useState } from "react";
import { uploadViaPresign } from "@/lib/client/upload";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * Upload an image and drop it into the page being edited.
 *
 * The site builder had no way to add a photograph at all: `SitePage.ogImageKey`
 * existed but nothing ever wrote it, there was no upload route, and the hero
 * section could show the tenant logo and nothing else. An author who wanted a
 * picture on their landing page had to host it somewhere else and paste a URL.
 *
 * Deliberately a "put an `<img>` at the cursor" tool rather than a hero-image
 * setting. One primitive covers the hero, an about section, a staff photo and a
 * gallery; a dedicated hero field would cover exactly one of those and leave
 * every other case still impossible.
 *
 * Uploads are remembered for the session only. Anything the author actually used
 * is referenced by the page source, which is the real record — a second store of
 * "images this tenant uploaded" would be a gallery to keep in sync with the
 * bucket, and the bucket already knows.
 */

type Uploaded = { url: string; name: string };

const ACCEPT = "image/png,image/jpeg,image/webp";

export function SiteImagePanel({
  onInsert,
  className,
}: {
  /** Receives the markup to place at the cursor. Absent when read-only. */
  onInsert?: (snippet: string) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    const res = await uploadViaPresign("/api/tenant/site/uploads/presign", file);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setImages((prev) => [{ url: res.publicUrl, name: file.name }, ...prev]);
  }, []);

  function insertImage(image: Uploaded) {
    // Alt text is the author's job, but shipping `alt=""` silently would make
    // every uploaded photo invisible to a screen reader. A filename is a poor
    // description and an obvious prompt to replace it.
    onInsert?.(`<img src="${image.url}" alt="${image.name.replace(/\.[^.]+$/, "")}">`);
  }

  return (
    <div className={cn("flex flex-col gap-3 overflow-y-auto", className)}>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Images</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload a photo, then insert it where the cursor is. PNG, JPEG or WebP, up to 8 MB.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          if (!onInsert) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!onInsert) return;
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={cn(
          "rounded-[10px] border-2 border-dashed p-3 text-center",
          dragging ? "border-foreground bg-muted" : "border-border"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!onInsert || busy}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="upload" />
          {busy ? "Uploading…" : "Choose an image"}
        </Button>
        <p className="mt-1.5 text-[11px] text-muted-foreground">or drop one here</p>
      </div>

      {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}

      {images.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {images.map((image) => (
            <li
              key={image.url}
              className="flex items-center gap-2 rounded-[10px] border-2 border-border p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- object-storage URL, no loader configured */}
              <img
                src={image.url}
                alt=""
                className="size-10 shrink-0 rounded object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-xs font-medium" title={image.name}>
                {image.name}
              </span>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={!onInsert}
                onClick={() => insertImage(image)}
              >
                Insert
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
