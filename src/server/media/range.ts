import type { ByteRange } from "~/server/storage/object-store";

export type RangeParseResult =
  | { kind: "none" }
  | { kind: "valid"; range: ByteRange }
  | { kind: "invalid" };

/** Returns null when a decimal position is greater than or equal to the cap. */
function decimalBelow(value: string, cap: number): number | null {
  const normalized = value.replace(/^0+(?=\d)/, "");
  const capText = String(cap);
  if (
    normalized.length > capText.length ||
    (normalized.length === capText.length && normalized >= capText)
  ) {
    return null;
  }
  return Number(normalized);
}

export function parseSingleByteRange(
  header: string | null,
  totalLength: number,
): RangeParseResult {
  if (header === null) return { kind: "none" };
  if (!Number.isSafeInteger(totalLength) || totalLength < 0)
    return { kind: "invalid" };
  // RFC 9110 requires an unsupported range unit to be ignored. Seedyn does not
  // implement multipart/byteranges, so a multiple-range request is ignored in
  // the same way and receives the complete representation.
  if (!header.startsWith("bytes=") || header.includes(","))
    return { kind: "none" };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  // Malformed byte-range syntax is also ignored. A 416 is reserved below for
  // syntactically valid ranges that the current representation cannot satisfy.
  if (!match) return { kind: "none" };
  const [, startText = "", endText = ""] = match;
  if (!startText && !endText) return { kind: "none" };
  if (totalLength === 0) return { kind: "invalid" };

  let start: number;
  let end: number;
  if (!startText) {
    if (/^0+$/.test(endText)) return { kind: "invalid" };
    const suffix = decimalBelow(endText, totalLength);
    start = suffix === null ? 0 : totalLength - suffix;
    end = totalLength - 1;
  } else {
    const parsedStart = decimalBelow(startText, totalLength);
    if (parsedStart === null) return { kind: "invalid" };
    start = parsedStart;
    if (!endText) {
      end = totalLength - 1;
    } else {
      const parsedEnd = decimalBelow(endText, totalLength);
      if (parsedEnd === null) {
        end = totalLength - 1;
      } else {
        if (parsedEnd < start) return { kind: "none" };
        end = parsedEnd;
      }
    }
  }

  return {
    kind: "valid",
    range: {
      start,
      end,
      length: end - start + 1,
    },
  };
}
