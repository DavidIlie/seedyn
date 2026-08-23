"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  CUSTOM_PUBLIC_SLUG_MAX_LENGTH,
  customPublicSlugError,
  normalizeCustomPublicSlug,
} from "~/lib/public-slug";

type Availability =
  | { status: "idle"; message: string }
  | { status: "checking"; message: string }
  | { status: "available"; message: string }
  | { status: "unavailable" | "invalid" | "error"; message: string };

export function SlugAvailabilityField({
  value,
  onChange,
  excludeUploadId,
  disabled = false,
  required = false,
  onAvailabilityChange,
}: {
  value: string;
  onChange: (value: string) => void;
  excludeUploadId?: string;
  disabled?: boolean;
  required?: boolean;
  onAvailabilityChange?: (available: boolean | null) => void;
}) {
  const inputId = useId();
  const statusId = `${inputId}-status`;
  const [availability, setAvailability] = useState<Availability>({
    status: "idle",
    message: required
      ? "Use lowercase letters, numbers, and hyphens."
      : "Leave blank for a random permanent URL.",
  });

  // The reporting callback is invoked from inside the debounced effect below.
  // Holding it in a ref keeps it out of that effect's dependencies, so a caller
  // passing an inline arrow gets one debounced check per keystroke instead of
  // an unbounded render loop that refetches on every pass.
  const report = useRef(onAvailabilityChange);
  useEffect(() => {
    report.current = onAvailabilityChange;
  }, [onAvailabilityChange]);

  useEffect(() => {
    const normalized = normalizeCustomPublicSlug(value);
    if (!normalized) {
      setAvailability({
        status: "idle",
        message: required
          ? "Use lowercase letters, numbers, and hyphens."
          : "Leave blank for a random permanent URL.",
      });
      report.current?.(required ? false : null);
      return undefined;
    }
    const validationError = customPublicSlugError(normalized);
    if (validationError) {
      setAvailability({ status: "invalid", message: validationError });
      report.current?.(false);
      return undefined;
    }

    const abort = new AbortController();
    const timeout = window.setTimeout(() => {
      setAvailability({
        status: "checking",
        message: "Checking availability…",
      });
      const params = new URLSearchParams({ slug: normalized });
      if (excludeUploadId) params.set("excludeUploadId", excludeUploadId);
      void fetch(`/api/slugs/check?${params}`, {
        headers: { Accept: "application/json" },
        signal: abort.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(String(response.status));
          return (await response.json()) as {
            available: boolean;
            message: string;
          };
        })
        .then((result) => {
          setAvailability({
            status: result.available ? "available" : "unavailable",
            message: result.message,
          });
          report.current?.(result.available);
          return undefined;
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return undefined;
          }
          setAvailability({
            status: "error",
            message: "Availability could not be checked.",
          });
          report.current?.(false);
          return undefined;
        });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      abort.abort();
    };
  }, [excludeUploadId, required, value]);

  const Icon =
    availability.status === "checking"
      ? LoaderCircle
      : availability.status === "available"
        ? Check
        : availability.status === "idle"
          ? null
          : X;
  const statusTone =
    availability.status === "available"
      ? "text-[var(--success)]"
      : availability.status === "invalid" ||
          availability.status === "unavailable" ||
          availability.status === "error"
        ? "text-danger"
        : "text-muted-foreground";

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>
        Custom URL slug{" "}
        {!required ? (
          <span className="text-muted-foreground font-normal">(optional)</span>
        ) : null}
      </Label>
      <Input
        id={inputId}
        name="slug"
        value={value}
        disabled={disabled}
        required={required}
        maxLength={CUSTOM_PUBLIC_SLUG_MAX_LENGTH}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={statusId}
        aria-invalid={
          availability.status === "invalid" ||
          availability.status === "unavailable" ||
          availability.status === "error"
        }
        placeholder="launch-screenshot"
        onChange={(event) =>
          onChange(event.target.value.toLocaleLowerCase("en-US"))
        }
        onBlur={() => {
          const normalized = normalizeCustomPublicSlug(value);
          if (normalized !== value) onChange(normalized);
        }}
        className="placeholder:text-muted-foreground/75 font-mono placeholder:font-sans"
      />
      <p
        id={statusId}
        aria-live="polite"
        className={`flex min-h-5 items-center gap-1.5 text-xs ${statusTone}`}
      >
        {Icon ? (
          <Icon
            aria-hidden="true"
            className={`size-3.5 ${availability.status === "checking" ? "animate-spin" : ""}`}
          />
        ) : null}
        {availability.message}
      </p>
    </div>
  );
}
