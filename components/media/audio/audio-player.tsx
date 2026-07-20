"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/media/format";
import { Waveform } from "./waveform";
import { usePlaybackProgress, shouldOfferResume } from "../use-playback-progress";
import { displayTitle, type MediaPayload } from "../types";

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

export function AudioPlayer({ payload }: { payload: MediaPayload }) {
  const { item, playbackUrl, posterUrl, progress } = payload;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(item.durationSeconds ?? 0);
  const [rate, setRate] = useState(1);
  const [resumeAt, setResumeAt] = useState<number | null>(null);

  const { report, flush } = usePlaybackProgress(item.id, !!playbackUrl);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, []);

  const seekBy = useCallback((d: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d));
  }, []);

  const seekTo = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    setTime(t);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  // Lock-screen and headset controls. ~20 lines for a real win on a phone.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayTitle(item),
      artist: item.folder?.name ?? undefined,
      artwork: posterUrl ? [{ src: posterUrl }] : undefined,
    });
    navigator.mediaSession.setActionHandler("play", () => void audioRef.current?.play());
    navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => seekBy(-15));
    navigator.mediaSession.setActionHandler("seekforward", () => seekBy(15));
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    };
  }, [item, posterUrl, seekBy]);

  if (!playbackUrl) return null;

  return (
    <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-sm">
      <audio
        ref={audioRef}
        src={playbackUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          flush();
        }}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          setDuration(a.duration || item.durationSeconds || 0);
          a.playbackRate = rate;
          if (shouldOfferResume(progress?.positionSeconds, a.duration || item.durationSeconds)) {
            setResumeAt(progress!.positionSeconds);
          }
        }}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime);
          report(e.currentTarget.currentTime, e.currentTarget.duration || 0);
        }}
        onEnded={() => {
          setPlaying(false);
          flush({ completed: true });
        }}
      />

      {resumeAt != null ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[8px] border-2 border-border bg-background px-3 py-2">
          <span className="num text-sm font-bold">Resume from {formatDuration(resumeAt)}?</span>
          <button
            type="button"
            className="rounded-[6px] bg-primary px-2 py-1 text-xs font-bold text-primary-foreground"
            onClick={() => {
              seekTo(resumeAt);
              setResumeAt(null);
              void audioRef.current?.play().catch(() => {});
            }}
          >
            Resume
          </button>
          <button type="button" className="text-xs font-bold text-muted-foreground" onClick={() => setResumeAt(null)}>
            Start over
          </button>
        </div>
      ) : null}

      <Waveform peaks={item.peaks} currentTime={time} duration={duration} onSeek={seekTo} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Back 15 seconds"
          onClick={() => seekBy(-15)}
          className="flex size-11 items-center justify-center rounded-[8px] border-2 border-border bg-card sm:size-9"
        >
          <Icon name="rewind-15" />
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={toggle}
          className="flex size-12 items-center justify-center rounded-full border-2 border-border bg-primary text-primary-foreground shadow-sm transition-transform hover:-translate-y-px active:translate-y-px"
        >
          <Icon name={playing ? "pause" : "play"} className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Forward 15 seconds"
          onClick={() => seekBy(15)}
          className="flex size-11 items-center justify-center rounded-[8px] border-2 border-border bg-card sm:size-9"
        >
          <Icon name="forward-15" />
        </button>

        <span className="num text-sm font-bold tabular-nums">
          {formatDuration(time)} / {formatDuration(duration)}
        </span>

        <button
          type="button"
          onClick={() => setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length])}
          aria-label={`Playback speed ${rate}x`}
          className={cn(
            "num ml-auto rounded-[8px] border-2 border-border bg-card px-2.5 py-1.5 text-sm font-bold",
            rate !== 1 && "bg-primary text-primary-foreground"
          )}
        >
          {rate}×
        </button>
      </div>
    </div>
  );
}
