"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Slider } from "~/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

import {
  GIF_FRAME_RATES,
  GIF_MAX_FRAMES,
  GIF_SIZES,
  GIF_SPEEDS,
  gifFrameCount,
  gifMaxSourceSeconds,
  gifPlaybackSeconds,
  type VideoGifSettings,
} from "./options";

/**
 * Pick the part of a video that becomes the GIF, and how it plays.
 *
 * The preview loops the selected range at the chosen speed, so what plays here
 * is what the GIF will be. Every change is clamped to the server's frame
 * budget as it happens; there is no setting the encoder would then refuse.
 */

const STEP = 0.1;
/** Used only when this browser cannot read the video's duration. */
const FALLBACK_SECONDS = 5;

export function VideoGifEditor({
  previewSrc,
  settings,
  onChange,
  disabled,
}: {
  previewSrc: string;
  settings: VideoGifSettings;
  onChange: (next: VideoGifSettings) => void;
  disabled: boolean;
}) {
  const id = useId();
  const video = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  // The latest range, readable from media event handlers without rebinding.
  const range = useRef(settings);
  useEffect(() => {
    range.current = settings;
  }, [settings]);

  const maxSpan = gifMaxSourceSeconds(settings);
  const limit = duration ?? Number.POSITIVE_INFINITY;

  function update(patch: Partial<VideoGifSettings>, anchor: "start" | "end") {
    const next = { ...settings, ...patch };
    const span = gifMaxSourceSeconds(next);
    next.start = clamp(next.start, 0, limit - STEP);
    next.end = clamp(next.end, next.start + STEP, limit);
    // Keep the edge the user is holding; move the other one to fit.
    if (next.end - next.start > span) {
      if (anchor === "start") next.end = next.start + span;
      else next.start = Math.max(0, next.end - span);
    }
    next.start = round(next.start);
    next.end = round(next.end);
    onChange(next);
  }

  function seek(seconds: number) {
    const element = video.current;
    if (element && Number.isFinite(seconds)) element.currentTime = seconds;
  }

  function onLoadedMetadata() {
    const element = video.current;
    if (!element) return;
    const seconds = element.duration;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      fallBackToManualRange();
      return;
    }
    setDuration(seconds);
    if (range.current.end <= 0) {
      onChange({
        ...range.current,
        start: 0,
        end: round(Math.min(seconds, gifMaxSourceSeconds(range.current))),
      });
    }
  }

  function fallBackToManualRange() {
    setPreviewFailed(true);
    if (range.current.end <= 0) {
      onChange({
        ...range.current,
        start: 0,
        end: Math.min(FALLBACK_SECONDS, gifMaxSourceSeconds(range.current)),
      });
    }
  }

  // Loop the preview inside the selection.
  function onTimeUpdate() {
    const element = video.current;
    if (!element) return;
    const { start, end } = range.current;
    if (element.currentTime >= end || element.currentTime < start - 0.25) {
      element.currentTime = start;
    }
  }

  useEffect(() => {
    if (video.current) video.current.playbackRate = settings.speed;
  }, [settings.speed]);

  const frames = gifFrameCount(settings);
  const ready = settings.end > settings.start;

  return (
    <div className="space-y-4">
      {previewFailed ? (
        <p className="text-muted-foreground text-sm">
          This browser cannot preview the video, so enter the start and end by
          hand. The converter may still read it.
        </p>
      ) : (
        <video
          ref={video}
          src={previewSrc}
          controls
          muted
          playsInline
          loop={false}
          preload="metadata"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onError={fallBackToManualRange}
          className="border-border bg-sunken max-h-64 w-full rounded-lg border object-contain"
        />
      )}

      {duration !== null ? (
        <div className="space-y-2">
          <Slider
            min={0}
            max={round(duration)}
            step={STEP}
            minStepsBetweenThumbs={1}
            value={[settings.start, settings.end]}
            disabled={disabled}
            thumbLabels={["GIF start", "GIF end"]}
            onValueChange={(values) => {
              const [start = settings.start, end = settings.end] = values;
              const anchor = start !== settings.start ? "start" : "end";
              update({ start, end }, anchor);
              seek(anchor === "start" ? start : end);
            }}
          />
          <div className="text-muted-foreground flex justify-between font-mono text-xs">
            <span>0:00</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <TimeField
          id={`${id}-start`}
          label="Start (s)"
          value={settings.start}
          disabled={disabled}
          onCommit={(start) => {
            update({ start }, "start");
            seek(start);
          }}
          onUseCurrent={
            duration === null
              ? undefined
              : () =>
                  update({ start: video.current?.currentTime ?? 0 }, "start")
          }
          currentLabel="Start here"
        />
        <TimeField
          id={`${id}-end`}
          label="End (s)"
          value={settings.end}
          disabled={disabled}
          onCommit={(end) => update({ end }, "end")}
          onUseCurrent={
            duration === null
              ? undefined
              : () =>
                  update({ end: video.current?.currentTime ?? limit }, "end")
          }
          currentLabel="End here"
        />
      </div>

      <Choice
        label="Frame rate"
        values={GIF_FRAME_RATES}
        value={settings.fps}
        format={(fps) => `${fps} fps`}
        disabled={disabled}
        onChange={(fps) => update({ fps }, "start")}
      />
      <Choice
        label="Size (longest edge)"
        values={GIF_SIZES}
        value={settings.maxEdge}
        format={(edge) => `${edge}px`}
        disabled={disabled}
        onChange={(maxEdge) => update({ maxEdge }, "start")}
      />
      <Choice
        label="Speed"
        values={GIF_SPEEDS}
        value={settings.speed}
        format={(speed) => `${speed}×`}
        disabled={disabled}
        onChange={(speed) => update({ speed }, "start")}
      />

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-loop`}
          checked={settings.loop}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({ ...settings, loop: checked === true })
          }
        />
        <Label htmlFor={`${id}-loop`}>Loop forever</Label>
      </div>

      {ready ? (
        <p className="text-muted-foreground text-sm">
          {formatSeconds(settings.end - settings.start)} of video, plays for{" "}
          {formatSeconds(gifPlaybackSeconds(settings))}. {frames} of{" "}
          {GIF_MAX_FRAMES} frames
          {settings.end - settings.start >= maxSpan - STEP
            ? " — the longest clip these settings allow. Lower the frame rate or raise the speed for more."
            : "."}
        </p>
      ) : null}
    </div>
  );
}

function TimeField({
  id,
  label,
  value,
  disabled,
  onCommit,
  onUseCurrent,
  currentLabel,
}: {
  id: string;
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
  onUseCurrent: (() => void) | undefined;
  currentLabel: string;
}) {
  // A draft, so typing "1." is not immediately clamped back to "1".
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (Number.isFinite(parsed)) onCommit(parsed);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={STEP}
        disabled={disabled}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {onUseCurrent ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onUseCurrent}
        >
          {currentLabel}
        </Button>
      ) : null}
    </div>
  );
}

function Choice<T extends number>({
  label,
  values,
  value,
  format,
  disabled,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: number;
  format: (value: T) => string;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <ToggleGroup
        type="single"
        variant="segmented"
        size="sm"
        value={String(value)}
        disabled={disabled}
        aria-label={label}
        className="flex-wrap"
        // Radix reports "" when the selected item is pressed again; every
        // setting here is required, so that is a no-op.
        onValueChange={(next) => {
          const match = values.find((candidate) => String(candidate) === next);
          if (match !== undefined) onChange(match);
        }}
      >
        {values.map((candidate) => (
          <ToggleGroupItem key={candidate} value={String(candidate)}>
            {format(candidate)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}${
    seconds < 60 ? `.${Math.floor((seconds % 1) * 10)}` : ""
  }`;
}
