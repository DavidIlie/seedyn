import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GIF_DEFAULT_SETTINGS,
  GIF_FRAME_RATES,
  GIF_MAX_FRAMES,
  GIF_SPEEDS,
  gifFrameCount,
  gifMaxSourceSeconds,
} from "./options";

void describe("video GIF frame budget", () => {
  void it("counts frames after speed is applied", () => {
    const settings = { ...GIF_DEFAULT_SETTINGS, start: 2, end: 6, fps: 10 };
    assert.equal(gifFrameCount({ ...settings, speed: 1 }), 40);
    assert.equal(gifFrameCount({ ...settings, speed: 2 }), 20);
  });

  void it("never allows a clip the server would refuse", () => {
    for (const fps of GIF_FRAME_RATES) {
      for (const speed of GIF_SPEEDS) {
        const span = gifMaxSourceSeconds({ fps, speed });
        const settings = {
          ...GIF_DEFAULT_SETTINGS,
          fps,
          speed,
          start: 0,
          end: span,
        };
        assert.ok(gifFrameCount(settings) <= GIF_MAX_FRAMES, `${fps}@${speed}`);
        assert.ok(span / speed <= 60, `${fps}@${speed}`);
      }
    }
  });
});

void describe("video GIF rounding", () => {
  void it("does not tip a full clip over the budget", () => {
    const settings = {
      ...GIF_DEFAULT_SETTINGS,
      fps: 25,
      start: 0.3,
      end: 0.3 + 4.8,
    };
    assert.equal(gifFrameCount(settings), GIF_MAX_FRAMES);
  });
});
