import { formatBytes as formatBytesBigInt } from "@/lib/tenant/plan";

/**
 * Formatting helpers for media metadata.
 *
 * `formatBytes` wraps the existing lib/tenant/plan.ts implementation so there
 * is one rendering of a byte count in the app, but accepts `number` too:
 * everything client-side carries sizes as numbers (BigInt does not survive
 * JSON), and every call site would otherwise repeat the conversion.
 */
export function formatBytes(bytes: number | bigint): string {
  return formatBytesBigInt(typeof bytes === "bigint" ? bytes : BigInt(Math.max(0, Math.round(bytes))));
}

/** 132 -> "2:12", 3725 -> "1:02:05". Used for durations and player timestamps. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/**
 * Spoken form for screen readers. A scrub bar announcing "1:02:05" reads as
 * gibberish, so aria-valuetext gets this instead.
 */
export function spokenDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "0 seconds";
  }
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s > 0 || parts.length === 0) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** Bytes/second -> "4.2 MB/s". */
export function formatRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "—";
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 ** 2) return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSecond / 1024 ** 2).toFixed(1)} MB/s`;
}

/** Seconds remaining -> "about 3 min left". Coarse on purpose: upload ETAs are noisy. */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return "a few seconds left";
  const m = Math.round(seconds / 60);
  if (m < 60) return `about ${m} min left`;
  const h = Math.round(m / 60);
  return `about ${h} hr left`;
}

/** 1280x720 -> "1280 x 720". */
export function formatDimensions(width?: number | null, height?: number | null): string | null {
  if (!width || !height) return null;
  return `${width} × ${height}`;
}
