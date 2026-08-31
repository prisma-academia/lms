/**
 * Parse an author-supplied video URL into something that will actually play.
 *
 * A `VIDEO_URL` lesson used to store whatever string was pasted and render it
 * as `<video src={url}>`. That only works for a progressive file URL: a YouTube
 * watch link renders a black box, and — because `content-gate.ts` treats
 * VIDEO_URL as timed media — the lesson then emits no playback signal and can
 * never be completed. Parsing here is what lets the player pick a real
 * embed, and what lets the API reject a link before it becomes that trap.
 *
 * `hasProgressSignal` is the load-bearing field. Only providers we can actually
 * observe playback on may gate completion on watching; everything else has to
 * fall back to the dwell clock, or the learner is stuck. Adding a provider
 * without a progress API means adding it with `hasProgressSignal: false`.
 */

export type VideoProvider = "youtube" | "vimeo" | "file";

export type VideoEmbed = {
  provider: VideoProvider;
  /** Provider video id; empty for `file`. */
  id: string;
  /** What to put in the iframe (`youtube`/`vimeo`) or the `<video>` (`file`). */
  src: string;
  /** Deep-link offset in seconds, 0 when none was given. */
  startSeconds: number;
  /** Whether playback progress can be observed and used to gate completion. */
  hasProgressSignal: boolean;
  /** Poster image, when the provider exposes one from the id alone. */
  thumbnailUrl: string | null;
  /** For display: "YouTube", "Vimeo", "Direct video file". */
  label: string;
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

/** Extensions the browser can hand to a bare `<video>` element. */
const FILE_EXTENSIONS = /\.(mp4|m4v|webm|ogv|ogg|mov)$/i;

const YOUTUBE_ID = /^[\w-]{11}$/;

/**
 * `t` / `start` accept `90`, `90s`, `1m30s`, `1h2m3s`. Returns 0 for anything
 * unparseable — a bad timestamp should not invalidate an otherwise good URL.
 */
export function parseTimeParam(value: string | null): number {
  if (!value) return 0;
  const raw = value.trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(raw);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function youtubeIdFrom(url: URL): string | null {
  const host = url.hostname.toLowerCase();

  // youtu.be/<id>
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && YOUTUBE_ID.test(id) ? id : null;
  }

  if (!YOUTUBE_HOSTS.has(host)) return null;

  // /watch?v=<id>
  const v = url.searchParams.get("v");
  if (v && YOUTUBE_ID.test(v)) return v;

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && ["embed", "shorts", "live", "v"].includes(segments[0])) {
    return YOUTUBE_ID.test(segments[1]) ? segments[1] : null;
  }
  return null;
}

function vimeoIdFrom(url: URL): string | null {
  if (!VIMEO_HOSTS.has(url.hostname.toLowerCase())) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  // vimeo.com/<id>, vimeo.com/channels/x/<id>, player.vimeo.com/video/<id>
  const last = segments[segments.length - 1];
  return last && /^\d+$/.test(last) ? last : null;
}

/**
 * Returns null for anything we cannot play. Callers treat null as "reject" —
 * never as "fall through to a raw <video>", which is the behaviour this
 * replaces.
 */
export function parseVideoUrl(raw: string): VideoEmbed | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const start = parseTimeParam(url.searchParams.get("t") ?? url.searchParams.get("start"));

  const youtubeId = youtubeIdFrom(url);
  if (youtubeId) {
    // -nocookie, and only the params we chose: `si`, `pp` and `list` are
    // tracking/playlist noise that changes what plays. `enablejsapi` is not
    // optional — it is how the player reports progress, which is what makes the
    // lesson completable.
    const params = new URLSearchParams({ enablejsapi: "1", rel: "0", modestbranding: "1" });
    if (start > 0) params.set("start", String(start));
    return {
      provider: "youtube",
      id: youtubeId,
      src: `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`,
      startSeconds: start,
      hasProgressSignal: true,
      thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      label: "YouTube",
    };
  }

  const vimeoId = vimeoIdFrom(url);
  if (vimeoId) {
    const params = new URLSearchParams();
    if (start > 0) params.set("#t", `${start}s`);
    return {
      provider: "vimeo",
      id: vimeoId,
      src: `https://player.vimeo.com/video/${vimeoId}${params.size ? `?${params}` : ""}`,
      startSeconds: start,
      // No player API is loaded for Vimeo, so playback cannot be observed.
      // Gating completion on it would strand the learner.
      hasProgressSignal: false,
      thumbnailUrl: null,
      label: "Vimeo",
    };
  }

  if (FILE_EXTENSIONS.test(url.pathname)) {
    return {
      provider: "file",
      id: "",
      src: trimmed,
      startSeconds: start,
      hasProgressSignal: true,
      thumbnailUrl: null,
      label: "Direct video file",
    };
  }

  return null;
}

export function isPlayableVideoUrl(raw: string): boolean {
  return parseVideoUrl(raw) !== null;
}

/** One message, shown by the lesson dialog and returned by the API. */
export const VIDEO_URL_HELP =
  "Paste a YouTube link (watch, youtu.be, or shorts), a Vimeo link, or a direct link to a video file (.mp4, .webm, .mov).";
