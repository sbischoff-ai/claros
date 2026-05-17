import { describe, it, expect } from "vitest";
import { getAtPath, setAtPath } from "../src/state/paths.js";
import type { StateData } from "../src/state/types.js";

describe("getAtPath", () => {
  const data: StateData = {
    mythic: { chaos_factor: 5, npcs: ["kareth", "the-priest"] },
    ironsworn: { momentum: 3 },
  };

  it("reads a top-level key", () => {
    expect(getAtPath(data, "ironsworn")).toEqual({ momentum: 3 });
  });

  it("reads a nested key via dot-path", () => {
    expect(getAtPath(data, "mythic.chaos_factor")).toBe(5);
  });

  it("reads a deeply nested value", () => {
    expect(getAtPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("returns undefined for a missing top-level key", () => {
    expect(getAtPath(data, "missing")).toBeUndefined();
  });

  it("returns undefined for a missing nested key — does not throw", () => {
    expect(getAtPath(data, "mythic.missing.deep")).toBeUndefined();
  });

  it("returns undefined when an intermediate value is not an object", () => {
    expect(getAtPath(data, "mythic.chaos_factor.impossible")).toBeUndefined();
  });
});

describe("setAtPath", () => {
  it("sets a top-level key on an empty object", () => {
    expect(setAtPath({}, "counter", 1).counter).toBe(1);
  });

  it("sets a nested key, creating intermediate objects", () => {
    const result = setAtPath({}, "mythic.chaos_factor", 7);
    expect((result.mythic as any).chaos_factor).toBe(7);
  });

  it("sets a deeply nested key", () => {
    expect((setAtPath({}, "a.b.c.d", 99) as any).a.b.c.d).toBe(99);
  });

  it("updates an existing nested key", () => {
    const result = setAtPath({ mythic: { chaos_factor: 5 } }, "mythic.chaos_factor", 6);
    expect((result.mythic as any).chaos_factor).toBe(6);
  });

  it("does not mutate the original — top level", () => {
    const data: StateData = { counter: 1 };
    setAtPath(data, "counter", 2);
    expect(data.counter).toBe(1);
  });

  it("does not mutate the original — nested", () => {
    const data: StateData = { mythic: { chaos_factor: 5 } };
    setAtPath(data, "mythic.chaos_factor", 6);
    expect((data.mythic as any).chaos_factor).toBe(5);
  });

  it("preserves sibling keys at all levels", () => {
    const data: StateData = {
      mythic: { chaos_factor: 5, npcs: ["kareth"] },
      other: { x: 1 },
    };
    const result = setAtPath(data, "mythic.chaos_factor", 6);
    expect((result.mythic as any).npcs).toEqual(["kareth"]);
    expect((result.other as any).x).toBe(1);
  });
});
