import { describe, it, expect } from "vitest";
import { detectDirection, defaultMessage, DEFAULT_MESSAGE } from "./message";

describe("detectDirection", () => {
  it("detects Hebrew as rtl", () => {
    expect(detectDirection("שלום")).toBe("rtl");
    expect(detectDirection("שלום עולם")).toBe("rtl");
  });

  it("detects Arabic as rtl", () => {
    expect(detectDirection("مرحبا")).toBe("rtl");
  });

  it("detects Latin as ltr", () => {
    expect(detectDirection("Hello")).toBe("ltr");
    expect(detectDirection("Café résumé")).toBe("ltr");
  });

  it("uses the FIRST strong character, ignoring leading neutrals", () => {
    expect(detectDirection("  123 — שלום")).toBe("rtl");
    expect(detectDirection('"!? Hello שלום')).toBe("ltr");
  });

  it("returns undefined when there is no directional signal", () => {
    expect(detectDirection("")).toBeUndefined();
    expect(detectDirection("123 456")).toBeUndefined();
    expect(detectDirection(" :) — !? ")).toBeUndefined();
  });
});

describe("defaultMessage", () => {
  it("defaults direction to rtl (Hebrew-first) and merges overrides", () => {
    expect(DEFAULT_MESSAGE.direction).toBe("rtl");
    expect(defaultMessage({ text: "hi" }).text).toBe("hi");
    expect(defaultMessage({ direction: "ltr" }).direction).toBe("ltr");
  });
});
