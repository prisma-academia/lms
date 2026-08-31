"use client";

import { useEffect, useRef, useState } from "react";
import { parseVideoUrl, type VideoEmbed } from "@/lib/media/video-embed";

/**
 * Plays a VIDEO_URL lesson and, where it can, reports playback progress.
 *
 * The progress callback is not cosmetic. `content-gate.ts` treats VIDEO_URL as
 * timed media, so a player that never reports leaves "Mark complete" disabled
 * forever. That is why:
 *
 *  - YouTube is embedded through the IFrame Player API rather than as a plain
 *    iframe: the API is the only way to read currentTime out of a cross-origin
 *    player, and therefore the only way a YouTube lesson can ever be finished.
 *  - Vimeo is a plain iframe and reports nothing. The caller must not treat it
 *    as timed media (see `hasProgressSignal`), or the learner is stranded.
 *
 * `onProgress` receives a 0..1 fraction and is expected to latch — seeking
 * backwards must never un-satisfy a gate that was already met.
 */

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

/** Minimal shape of the bits of the YT player we use. */
type YTPlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: { PLAYING: number; ENDED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/**
 * Load the IFrame API once per page. YouTube's loader calls a single global
 * callback, so a second <script> tag would clobber the first player's ready
 * handler — hence the module-level promise rather than a per-component effect.
 */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube IFrame API loaded without a Player."));
    };
    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      script.async = true;
      script.onerror = () => reject(new Error("Could not load the YouTube player."));
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

const FRAME_CLASS =
  "aspect-video w-full rounded-[10px] border-2 border-border bg-black";

function YouTubeEmbed({
  embed,
  title,
  onProgress,
}: {
  embed: VideoEmbed;
  title: string;
  onProgress: (fraction: number) => void;
}) {
  const hostRef = useRef<HTMLIFrameElement | null>(null);
  // Held in a ref so the polling interval always calls the current callback
  // without tearing down and rebuilding the player on every parent render.
  const progressRef = useRef(onProgress);
  useEffect(() => {
    progressRef.current = onProgress;
  }, [onProgress]);

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    function stopPolling() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    loadYouTubeApi()
      .then((YT) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        player = new YT.Player(host, {
          events: {
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.ENDED) {
                stopPolling();
                progressRef.current(1);
                return;
              }
              if (e.data !== YT.PlayerState.PLAYING) {
                stopPolling();
                return;
              }
              // Poll rather than rely on state changes: YouTube emits no
              // per-second event, and a learner who watches straight through
              // would otherwise only report at the very end.
              stopPolling();
              timer = setInterval(() => {
                if (!player) return;
                const total = player.getDuration();
                if (total > 0) progressRef.current(player.getCurrentTime() / total);
              }, 1000);
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      stopPolling();
      try {
        player?.destroy();
      } catch {
        // The iframe may already be gone with the unmounted subtree.
      }
    };
  }, [embed.src]);

  if (failed) {
    // Falling back to a bare iframe keeps the video watchable; the lesson then
    // relies on the dwell clock alone rather than becoming uncompletable.
    return (
      <iframe
        src={embed.src}
        title={title}
        className={FRAME_CLASS}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <div className={FRAME_CLASS}>
      {/* The API replaces this element with the player iframe. */}
      <iframe
        ref={hostRef}
        src={embed.src}
        title={title}
        className="h-full w-full rounded-[8px]"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

const NO_PROGRESS = () => {};

/**
 * `onProgress` is optional so a server component can render this without
 * passing a function across the boundary — the admin preview has no gate to
 * satisfy, and a preview that had to become a client island to show a video
 * would be weight for nothing.
 */
export function VideoLessonPlayer({
  url,
  title,
  onProgress = NO_PROGRESS,
}: {
  url: string;
  title: string;
  onProgress?: (fraction: number) => void;
}) {
  const embed = parseVideoUrl(url);

  if (!embed) {
    // Lessons saved before URL validation existed can still hold anything.
    return (
      <p className="text-sm font-medium text-muted-foreground">
        This video link cannot be played. Ask an administrator to replace it with a YouTube,
        Vimeo, or direct video file link.
      </p>
    );
  }

  if (embed.provider === "youtube") {
    return <YouTubeEmbed embed={embed} title={title} onProgress={onProgress} />;
  }

  if (embed.provider === "vimeo") {
    return (
      <iframe
        src={embed.src}
        title={title}
        className={FRAME_CLASS}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <video
      src={embed.src}
      controls
      playsInline
      preload="metadata"
      className="w-full rounded-[10px] border-2 border-border bg-black"
      onTimeUpdate={(e) => {
        const total = e.currentTarget.duration || 0;
        if (total > 0) onProgress(e.currentTarget.currentTime / total);
      }}
      onEnded={() => onProgress(1)}
    />
  );
}
