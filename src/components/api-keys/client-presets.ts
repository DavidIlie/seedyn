export const CLIENT_PRESET_IDS = ["http", "sharex", "shottr", "s3"] as const;

export type ClientPresetId = (typeof CLIENT_PRESET_IDS)[number];

export function isClientPresetId(value: unknown): value is ClientPresetId {
  return (
    typeof value === "string" &&
    CLIENT_PRESET_IDS.some((preset) => preset === value)
  );
}

export function presetNeedsS3(preset: ClientPresetId): boolean {
  return preset === "shottr" || preset === "s3";
}
