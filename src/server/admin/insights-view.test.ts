import { describe, expect, it } from "vitest";

import {
  adminRangeStart,
  buildDailyUploadSeries,
  parseAdminRange,
} from "./insights-view";

describe("admin insight view model", () => {
  it("accepts only the supported URL ranges", () => {
    expect(parseAdminRange("7")).toBe(7);
    expect(parseAdminRange(["90", "7"])).toBe(90);
    expect(parseAdminRange("30")).toBe(30);
    expect(parseAdminRange("365")).toBe(30);
    expect(parseAdminRange(undefined)).toBe(30);
  });

  it("starts an inclusive UTC range", () => {
    expect(
      adminRangeStart(new Date("2026-08-18T23:59:59.999Z"), 7).toISOString(),
    ).toBe("2026-08-12T00:00:00.000Z");
  });

  it("zero-fills days and combines typed aggregates without losing BigInts", () => {
    const points = buildDailyUploadSeries({
      now: new Date("2026-08-18T12:00:00.000Z"),
      days: 7,
      rows: [
        {
          day: new Date("2026-08-13T00:00:00.000Z"),
          kind: "IMAGE",
          count: BigInt(2),
          byteSize: BigInt(10),
        },
        {
          day: new Date("2026-08-13T00:00:00.000Z"),
          kind: "FILE",
          count: BigInt(1),
          byteSize: BigInt("9007199254740993"),
        },
      ],
    });

    expect(points).toHaveLength(7);
    expect(points[0]).toMatchObject({ date: "2026-08-12", total: 0 });
    expect(points[1]).toMatchObject({
      date: "2026-08-13",
      IMAGE: 2,
      FILE: 1,
      total: 3,
      byteSize: "9007199254741003",
    });
  });
});
