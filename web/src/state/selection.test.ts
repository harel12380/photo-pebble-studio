import { describe, expect, it } from "vitest";
import { adjacentId } from "./selection";

describe("adjacentId", () => {
  const ids = ["a", "b", "c"];

  it("moves forward and backward one step", () => {
    expect(adjacentId(ids, "a", 1)).toBe("b");
    expect(adjacentId(ids, "b", 1)).toBe("c");
    expect(adjacentId(ids, "c", -1)).toBe("b");
  });

  it("clamps at the ends instead of wrapping", () => {
    expect(adjacentId(ids, "c", 1)).toBe("c");
    expect(adjacentId(ids, "a", -1)).toBe("a");
  });

  it("starts at the first item moving forward from no selection", () => {
    expect(adjacentId(ids, null, 1)).toBe("a");
  });

  it("starts at the last item moving backward from no selection", () => {
    expect(adjacentId(ids, null, -1)).toBe("c");
  });

  it("treats an unknown current id like no selection", () => {
    expect(adjacentId(ids, "zzz", 1)).toBe("a");
  });

  it("returns null for an empty list", () => {
    expect(adjacentId([], "a", 1)).toBeNull();
    expect(adjacentId([], null, -1)).toBeNull();
  });
});
