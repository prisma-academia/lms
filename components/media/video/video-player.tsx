"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/media/format";
import { ScrubBar } from "./scrub-bar";
import { useMediaKeys } from "./use-media-keys";
import { usePlaybackProgress, shouldOfferResume } from "../use-playback-progress";
import type { MediaPayload } from "../types";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const RATE_KEY = "mt-player-rate";

/**
 * Custom video player built on <video>.
 *
 * No hls.js: there is no transcoding pipeline in this app, so every item is a
 * single progressive file, and S3 presigned GETs honour Range requests — which
 * is what gives seeking and buffering for free. `sources` is accepted anyway so
 * adaptive streaming later is a backend change, not a rewrite here.
 */
export function VideoPlayer({
  payload,
  autoPlay,
  compact,
}: {
  payload: MediaPayload;
  autoPlay?: boolean;
  compact?: boolean;
}) {
  const { item, playbackUrl, posterUrl, tracks = [], progress } = payload;
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(item.durationSeconds ?? 0);
  const [buffered, setBuffered] = useState<{ start: number; end: number }[]>([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [cue, setCue] = useState<string>("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { report, flush } = usePlaybackProgress(item.id, !!playbackUrl);

  // Restore the saved playback rate; a learner who prefers 1.5x means it.
  // Deliberately an effect rather than a lazy useState initializer: localStorage
  // does not exist during SSR, so initializing from it would render 1x on the
  // server and 1.5x on the client and trip a hydration mismatch.
  useEffect(() => {
    const saved = Number(localStorage.getItem(RATE_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && RATES.includes(saved)) setRate(saved);
  }, []);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    localStorage.setItem(RATE_KEY, String(rate));
  }, [rate]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  }, []);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setTime(t);
  }, []);

  const adjustVolume = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Math.max(0, Math.min(1, v.volume + delta));
    v.volume = next;
    setVolume(next);
    if (next > 0) {
      v.muted = false;
      setMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const wrap = wrapRef.current;
    const v = videoRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (wrap.requestFullscreen) {
      void wrap.requestFullscreen().catch(() => {});
      return;
    }
    // iOS Safari does not support fullscreen on arbitrary elements — only the
    // video itself, which then shows Apple's NATIVE controls rather than ours.
    // That is the platform's behaviour, not a bug to route around.
    const webkitVideo = v as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    webkitVideo?.webkitEnterFullscreen?.();
  }, []);

  const toggleCaptions = useCallback(() => {
    setCaptionsOn((on) => !on);
  }, []);

  const togglePip = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    else void v.requestPictureInPicture?.().catch(() => {});
  }, []);

  const cycleRate = useCallback((dir: 1 | -1) => {
    setRate((r) => RATES[Math.max(0, Math.min(RATES.length - 1, RATES.indexOf(r) + dir))] ?? r);
  }, []);

  useMediaKeys(wrapRef, {
    togglePlay,
    seekBy,
    seekToFraction: (f) => seekTo((videoRef.current?.duration ?? 0) * f),
    adjustVolume,
    toggleMute,
    toggleFullscreen,
    toggleCaptions,
    togglePip,
    cycleRate,
    showHelp: () => setHelpOpen((v) => !v),
  });

  // Captions are rendered by us, not the browser: native cue boxes sit at the
  // bottom of the video and would be covered by our control bar. Tracks stay
  // "hidden" (not "disabled") so cues still fire and stay exposed to AT.
  //
  // The cue is always tracked; whether it is DISPLAYED is derived from
  // captionsOn at render time. Clearing it here instead would be a synchronous
  // setState in an effect for something that is a pure derivation.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const list = v.textTracks;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      t.mode = "hidden";
      t.oncuechange = () => {
        const active = t.activeCues?.[0] as VTTCue | undefined;
        setCue(active?.text ?? "");
      };
    }
  }, [tracks.length]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Auto-hide the control bar during playback; reveal on any pointer activity.
  const nudgeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !settingsOpen) setControlsVisible(false);
    }, 3000);
  }, [settingsOpen]);

  function readBuffered(v: HTMLVideoElement) {
    const out: { start: number; end: number }[] = [];
    for (let i = 0; i < v.buffered.length; i++) {
      out.push({ start: v.buffered.start(i), end: v.buffered.end(i) });
    }
    setBuffered(out);
  }

  if (!playbackUrl) return null;

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onMouseMove={nudgeControls}
      onPointerDown={nudgeControls}
      className={cn(
        "group relative overflow-hidden rounded-[14px] border-2 border-border bg-black outline-none",
        "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
        compact ? "aspect-video" : "aspect-video w-full"
      )}
    >
      <video
        ref={videoRef}
        src={playbackUrl}
        poster={posterUrl ?? undefined}
        playsInline
        autoPlay={autoPlay}
        preload="metadata"
        crossOrigin="anonymous"
        className="size-full bg-black"
        onClick={togglePlay}
        onPlay={() => {
          setPlaying(true);
          nudgeControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
          flush();
        }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration || item.durationSeconds || 0);
          v.playbackRate = rate;
          // Offer the resume rather than silently jumping — a video that starts
          // four minutes in with no explanation looks broken.
          if (shouldOfferResume(progress?.positionSeconds, v.duration || item.durationSeconds)) {
            setResumeAt(progress!.positionSeconds);
          }
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          report(v.currentTime, v.duration || 0);
        }}
        onProgress={(e) => readBuffered(e.currentTarget)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onEnded={() => {
          setPlaying(false);
          setControlsVisible(true);
          flush({ completed: true });
        }}
      >
        {tracks.map((t) => (
          <track key={t.src} src={t.src} srcLang={t.srclang} label={t.label} kind={t.kind} default={t.default} />
        ))}
      </video>

      {waiting ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      ) : null}

      {captionsOn && cue ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center px-4">
          <span className="num max-w-[90%] rounded-[6px] bg-black/80 px-3 py-1.5 text-center text-sm font-medium text-white">
            {cue}
          </span>
        </div>
      ) : null}

      {resumeAt != null ? (
        <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 py-2 shadow-lg">
          <span className="num text-sm font-bold">Resume from {formatDuration(resumeAt)}?</span>
          <button
            type="button"
            className="rounded-[6px] bg-primary px-2 py-1 text-xs font-bold text-primary-foreground"
            onClick={() => {
              seekTo(resumeAt);
              setResumeAt(null);
              void videoRef.current?.play().catch(() => {});
            }}
          >
            Resume
          </button>
          <button
            type="button"
            className="px-1 text-xs font-bold text-muted-foreground"
            onClick={() => setResumeAt(null)}
          >
            Start over
          </button>
        </div>
      ) : null}

      {!playing && !waiting ? (
        <button
          type="button"
          aria-label="Play"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex size-16 items-center justify-center rounded-full border-2 border-white bg-black/60">
            <Icon name="play" className="size-7 translate-x-0.5 text-white" />
          </span>
        </button>
      ) : null}

      {/* Gradient, not a theme surface: a light card behind white controls over
          video is unreadable. Accents inside still use theme tokens. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 transition-opacity",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <ScrubBar
          currentTime={time}
          duration={duration}
          buffered={buffered}
          onSeek={seekTo}
          onScrubEnd={() => flush()}
        />

        <div className="mt-1 flex items-center gap-1 text-white">
          <CtrlButton label={playing ? "Pause" : "Play"} onClick={togglePlay}>
            <Icon name={playing ? "pause" : "play"} />
          </CtrlButton>
          <CtrlButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
            <Icon name="rewind-15" />
          </CtrlButton>
          <CtrlButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
            <Icon name="forward-15" />
          </CtrlButton>

          <CtrlButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
            <Icon name={muted || volume === 0 ? "volume-x" : "volume"} />
          </CtrlButton>
          {/* Volume slider is desktop-only: phones have hardware volume and the
              OS owns it, so a slider here just steals space from the scrub bar. */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => adjustVolume(Number(e.target.value) - volume)}
            aria-label="Volume"
            className="hidden h-1 w-20 cursor-pointer accent-[var(--primary)] sm:block"
          />

          <span className="num ml-1 text-xs font-bold tabular-nums">
            {formatDuration(time)} / {formatDuration(duration)}
          </span>

          <span className="ml-auto flex items-center gap-1">
            {tracks.length > 0 ? (
              <CtrlButton label={captionsOn ? "Hide captions" : "Show captions"} pressed={captionsOn} onClick={toggleCaptions}>
                <Icon name="captions" />
              </CtrlButton>
            ) : null}

            <span className="relative">
              <CtrlButton label="Playback speed" pressed={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
                <span className="num text-xs font-bold">{rate}×</span>
              </CtrlButton>
              {settingsOpen ? (
                <span className="absolute bottom-full right-0 mb-2 flex w-28 flex-col rounded-[10px] border-2 border-border bg-card p-1 shadow-lg">
                  {RATES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setRate(r);
                        setSettingsOpen(false);
                      }}
                      className={cn(
                        "num rounded-[6px] px-2 py-1 text-left text-sm font-bold",
                        r === rate ? "bg-primary text-primary-foreground" : "text-card-foreground hover:bg-accent"
                      )}
                    >
                      {r}×
                    </button>
                  ))}
                </span>
              ) : null}
            </span>

            {typeof document !== "undefined" && document.pictureInPictureEnabled ? (
              <CtrlButton label="Picture in picture" onClick={togglePip}>
                <Icon name="pip" />
              </CtrlButton>
            ) : null}

            <CtrlButton label={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen}>
              <Icon name={fullscreen ? "minimize" : "maximize"} />
            </CtrlButton>
          </span>
        </div>
      </div>

      {helpOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4" onClick={() => setHelpOpen(false)}>
          <div className="max-w-sm rounded-[12px] border-2 border-border bg-card p-4">
            <h3 className="font-heading text-base">Keyboard shortcuts</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {[
                ["Space / K", "Play or pause"],
                ["← / →", "Back / forward 5s"],
                ["J / L", "Back / forward 10s"],
                ["↑ / ↓", "Volume"],
                ["0–9", "Jump to 0–90%"],
                ["M", "Mute"],
                ["C", "Captions"],
                ["F", "Fullscreen"],
                ["P", "Picture in picture"],
                [", / .", "Slower / faster"],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="num font-bold">{k}</dt>
                  <dd className="text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CtrlButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      /* 44px targets on touch, tighter with a mouse. */
      className={cn(
        "flex size-11 items-center justify-center rounded-[8px] text-white transition-colors sm:size-9",
        "hover:bg-white/20 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
        pressed && "bg-white/25"
      )}
    >
      {children}
    </button>
  );
}
