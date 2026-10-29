import { describe, expect, it } from "vitest";
import { parseNumberInput, formatAttendanceValue } from "./number-input";

describe("attendance input never rounds or merges work and hours", () => {
  it.each(["3,5", "3.5"])(
    "parses %s as exactly 3.5 and displays a comma",
    (raw) => {
      expect(parseNumberInput(raw, "work")).toEqual({
        valid: true,
        value: { type: "number", value: 3.5 },
      });
      expect(formatAttendanceValue({ type: "number", value: 3.5 })).toBe("3,5");
    },
  );
  it.each(["0", "0,0", "0.0", "F"])("normalizes work %s to F only", (raw) => {
    expect(parseNumberInput(raw, "work")).toEqual({
      valid: true,
      value: { type: "absence" },
    });
    expect(parseNumberInput(raw, "overtime").valid).toBe(false);
  });
  it.each([
    "3,25",
    "3.25",
    "-1",
    "1e1",
    "3,5.0",
    "Infinity",
    "1 000",
    "30.5",
    "0.50000000000000001",
  ])("rejects %s without rounding", (raw) => {
    expect(parseNumberInput(raw, "work")).toMatchObject({
      valid: false,
      message: expect.any(String),
    });
  });
  it("applies separate inclusive caps, blank and F remain distinct", () => {
    expect(parseNumberInput("30", "work").valid).toBe(true);
    expect(parseNumberInput("24", "overtime").valid).toBe(true);
    expect(parseNumberInput("24,5", "overtime").valid).toBe(false);
    expect(parseNumberInput("", "work")).toEqual({ valid: true, value: null });
    expect(formatAttendanceValue(null)).toBe("");
    expect(formatAttendanceValue({ type: "absence" })).toBe("F");
  });
});
