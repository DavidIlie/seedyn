/**
 * `gifenc` ships as plain JavaScript with no type declarations. This describes
 * only the surface the still-image worker uses; it is not a full binding.
 */
declare module "gifenc" {
  export type PaletteFormat = "rgb565" | "rgb444" | "rgba4444";

  export type WriteFrameOptions = {
    palette?: number[][];
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    dispose?: number;
    first?: boolean;
  };

  export type GifEncoderInstance = {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  };

  export function GIFEncoder(options?: {
    auto?: boolean;
    initialCapacity?: number;
  }): GifEncoderInstance;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: PaletteFormat;
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      clearAlphaColor?: number;
    },
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: PaletteFormat,
  ): Uint8Array;
}
