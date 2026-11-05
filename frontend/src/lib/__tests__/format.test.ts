import { describe, expect, it } from "vitest";
import { duration, fromUnits, fromUnitsFixed, toUnits } from "../format";

describe("units", () => {
  it("round-trips decimal strings to stroops", () => {
    expect(toUnits("1")).toBe(10_000_000n);
    expect(toUnits("0.0000001")).toBe(1n);
    expect(toUnits("12.5")).toBe(125_000_000n);
    expect(fromUnits(125_000_000n)).toBe("12.5");
    expect(fromUnits(1n)).toBe("0.0000001");
    expect(fromUnits(12_345_678_900_000n)).toBe("1,234,567.89");
  });
  it("rejects bad input", () => {
    expect(() => toUnits("abc")).toThrow();
    expect(() => toUnits("1.12345678")).toThrow();
    expect(() => toUnits("")).toThrow();
    expect(() => toUnits("-1")).toThrow();
  });
  it("formats fixed width", () => {
    expect(fromUnitsFixed(10_000_000n, 7, 4)).toBe("1.0000");
  });
  it("formats durations", () => {
    expect(duration(59)).toBe("59s");
    expect(duration(3_700)).toBe("1h 1m");
    expect(duration(90_000)).toBe("1d 1h");
  });
});
