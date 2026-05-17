import { describe, it, expect } from "vitest";
import { parseDice } from "../src/dice/parser";

describe("parseDice", () => {
  it("parses 1d20", () => expect(parseDice("1d20")).toEqual({ count: 1, sides: 20, modifier: 0 }));

  it("parses 2d6+3", () => expect(parseDice("2d6+3")).toEqual({ count: 2, sides: 6, modifier: 3 }));

  it("parses 2d6-1", () =>
    expect(parseDice("2d6-1")).toEqual({ count: 2, sides: 6, modifier: -1 }));

  it("parses 2d20kh1 (advantage)", () =>
    expect(parseDice("2d20kh1")).toEqual({
      count: 2,
      sides: 20,
      modifier: 0,
      keep: { highest: 1 },
    }));

  it("parses 2d20kl1 (disadvantage)", () =>
    expect(parseDice("2d20kl1")).toEqual({
      count: 2,
      sides: 20,
      modifier: 0,
      keep: { lowest: 1 },
    }));

  it("parses 4d6kh3 (stat roll)", () =>
    expect(parseDice("4d6kh3")).toEqual({ count: 4, sides: 6, modifier: 0, keep: { highest: 3 } }));

  it("parses 5d6>=4 (pool)", () =>
    expect(parseDice("5d6>=4")).toEqual({
      count: 5,
      sides: 6,
      modifier: 0,
      threshold: { gte: 4 },
    }));

  it("parses 1d6! (exploding)", () =>
    expect(parseDice("1d6!")).toEqual({ count: 1, sides: 6, modifier: 0, explode: true }));

  it("parses 1d100", () =>
    expect(parseDice("1d100")).toEqual({ count: 1, sides: 100, modifier: 0 }));

  it("throws on 0dX", () => expect(() => parseDice("0d6")).toThrow());

  it("throws on invalid expression", () => {
    expect(() => parseDice("abc")).toThrow();
    expect(() => parseDice("d20")).toThrow();
    expect(() => parseDice("2d")).toThrow();
  });
});
