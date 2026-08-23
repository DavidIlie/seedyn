import {
  Code2Icon,
  ImagesIcon,
  KeyRoundIcon,
  PackageOpenIcon,
} from "lucide-react";

import type { ClientPresetId } from "./client-presets";

export type KeyPreset = Readonly<{
  id: ClientPresetId;
  name: string;
  detail: string;
  defaultName: string;
  icon: typeof Code2Icon;
}>;

/** The clients people actually connect, in the order they are usually wanted. */
export const KEY_PRESETS: readonly KeyPreset[] = [
  {
    id: "http",
    name: "HTTP API",
    detail: "curl, scripts, and the CLI",
    defaultName: "My API client",
    icon: Code2Icon,
  },
  {
    id: "sharex",
    name: "ShareX",
    detail: "Ready-to-import Windows config",
    defaultName: "ShareX on my PC",
    icon: ImagesIcon,
  },
  {
    id: "shottr",
    name: "Shottr",
    detail: "S3 setup for macOS",
    defaultName: "Shottr on my Mac",
    icon: KeyRoundIcon,
  },
  {
    id: "s3",
    name: "S3-compatible",
    detail: "Any path-style S3 client",
    defaultName: "My S3 client",
    icon: PackageOpenIcon,
  },
] as const;
