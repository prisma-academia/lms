import type { MediaKind } from "@/lib/generated/prisma/enums";

export type MediaSource = { url: string; type: string; label: string; height?: number };

export type MediaTrack = {
  src: string;
  srclang: string;
  label: string;
  kind: "captions" | "subtitles";
  default?: boolean;
};

export type MediaAccess =
  | { state: "open"; via?: string; canDownload: boolean }
  | { state: "locked-paid"; purchasable: true; priceCents: number | null; currency: string | null }
  | { state: "locked-assign"; purchasable: false; priceCents: null; currency: null };

export type MediaResource = {
  id: string;
  name: string;
  title: string | null;
  description: string | null;
  contentType: string;
  mediaKind: MediaKind;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** Pre-computed waveform buckets; absent means the audio player falls back. */
  peaks?: number[] | null;
  tags: { id: string; name: string }[];
  folder: { id: string; name: string } | null;
  isFree: boolean;
  priceCents: number | null;
  currency: string | null;
  createdAt: string;
};

export type MediaPayload = {
  item: MediaResource;
  access: MediaAccess;
  playbackUrl: string | null;
  posterUrl: string | null;
  /**
   * Extra renditions. Empty today — there is no transcoding pipeline, so each
   * item has exactly one file. The player takes the array anyway so adding
   * adaptive streaming later is a backend change, not a player rewrite.
   */
  sources?: MediaSource[];
  tracks?: MediaTrack[];
  progress?: { positionSeconds: number; completed: boolean } | null;
};

export function displayTitle(r: MediaResource): string {
  return r.title || r.name;
}
