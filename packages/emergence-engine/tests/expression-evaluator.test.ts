import { describe, it, expect } from "vitest";
import { createEvaluator } from "../src/expression/evaluator";
import { matrixLookup } from "../src/tables/lookup";
import type { MatrixTable } from "@claros/story-format";

describe("ExpressionEvaluator", () => {
  const ev = createEvaluator();

  describe("arithmetic", () => {
    it("adds", () => expect(ev.evaluate("2 + 3", {})).toBe(5));
    it("subtracts", () => expect(ev.evaluate("10 - 4", {})).toBe(6));
    it("multiplies", () => expect(ev.evaluate("3 * 4", {})).toBe(12));
    it("divides", () => expect(ev.evaluate("10 / 4", {})).toBe(2.5));
    it("modulo", () => expect(ev.evaluate("11 % 11", {})).toBe(0));
    it("complex arithmetic", () => {
      expect(ev.evaluate("params.chaos + 1", { params: { chaos: 5 } })).toBe(6);
    });
  });

  describe("comparisons", () => {
    it("equals", () => expect(ev.evaluateBool("5 == 5", {})).toBe(true));
    it("not equals", () => expect(ev.evaluateBool("5 != 6", {})).toBe(true));
    it("less than", () => expect(ev.evaluateBool("3 < 5", {})).toBe(true));
    it("less than or equal", () => expect(ev.evaluateBool("5 <= 5", {})).toBe(true));
    it("greater than", () => expect(ev.evaluateBool("6 > 5", {})).toBe(true));
    it("greater than or equal", () => expect(ev.evaluateBool("5 >= 5", {})).toBe(true));
  });

  describe("boolean operators", () => {
    it("and — both true", () => expect(ev.evaluateBool("true and true", {})).toBe(true));
    it("and — one false", () => expect(ev.evaluateBool("true and false", {})).toBe(false));
    it("or — one true", () => expect(ev.evaluateBool("false or true", {})).toBe(true));
    it("or — both false", () => expect(ev.evaluateBool("false or false", {})).toBe(false));
    it("not", () => expect(ev.evaluateBool("not false", {})).toBe(true));
    it("compound", () => {
      const ctx = {
        steps: { roll: { is_double: true, double_digit: 4 } },
        params: { chaos: 5 },
      };
      expect(
        ev.evaluateBool("steps.roll.is_double and steps.roll.double_digit <= params.chaos", ctx)
      ).toBe(true);
    });
  });

  describe("member access", () => {
    it("accesses top-level property", () => {
      expect(ev.evaluate("params.chaos", { params: { chaos: 5 } })).toBe(5);
    });

    it("accesses nested property", () => {
      const ctx = { state: { story: { mythic: { chaos_factor: 7 } } } };
      expect(ev.evaluate("state.story.mythic.chaos_factor", ctx)).toBe(7);
    });

    it("returns undefined for missing path (does not throw)", () => {
      expect(ev.evaluate("params.missing", { params: {} })).toBeUndefined();
    });
  });

  describe("in operator", () => {
    it("detects membership in a literal list", () => {
      expect(ev.evaluateBool("44 in [11, 22, 33, 44, 55]", {})).toBe(true);
      expect(ev.evaluateBool("43 in [11, 22, 33, 44, 55]", {})).toBe(false);
    });

    it("works with context values", () => {
      const ctx = { steps: { roll: { total: 44 } } };
      expect(ev.evaluateBool("steps.roll.total in [11, 22, 33, 44, 55, 66, 77, 88, 99]", ctx)).toBe(
        true
      );
    });
  });

  describe("ternary", () => {
    it("returns true branch when condition is true", () => {
      expect(ev.evaluate("true ? 10 : 20", {})).toBe(10);
    });
    it("returns false branch when condition is false", () => {
      expect(ev.evaluate("false ? 10 : 20", {})).toBe(20);
    });
    it("works with context values", () => {
      const ctx = { steps: { roll: { total: 100 } } };
      expect(ev.evaluate("steps.roll.total == 100 ? 10 : steps.roll.total / 11", ctx)).toBe(10);
    });
  });

  describe("evaluateBool coercion", () => {
    it("treats truthy values as true", () => {
      expect(ev.evaluateBool("1", {})).toBe(true);
      expect(ev.evaluateBool("'hello'", {})).toBe(true);
    });
    it("treats falsy values as false", () => {
      expect(ev.evaluateBool("0", {})).toBe(false);
      expect(ev.evaluateBool("null", {})).toBe(false);
    });
  });
});

describe("cell-format classify integration (replaces Iter 02 stub)", () => {
  const table: MatrixTable = {
    id: "test.fate-like",
    type: "matrix",
    "row-key": "odds",
    "column-key": "cf",
    "cell-format": {
      fields: ["ey", "sy", "en"],
      classify: {
        "exceptional-yes": "value <= ey",
        yes: "value <= sy",
        "exceptional-no": "value >= en",
        _default: "no",
      },
    },
    rows: [{ key: "likely", columns: { 5: [3, 65, 94] } }],
  };

  const cases: [number, string][] = [
    [1, "exceptional-yes"], // <= ey(3)
    [3, "exceptional-yes"], // == ey(3), boundary
    [4, "yes"], // > ey, <= sy(65)
    [65, "yes"], // == sy(65), boundary
    [66, "no"], // > sy, < en(94)
    [93, "no"],
    [94, "exceptional-no"], // == en(94), boundary
    [99, "exceptional-no"], // > en
  ];

  it.each(cases)("classifies roll %i as %s", (roll, expected) => {
    const result = matrixLookup(table, "likely", 5, roll);
    expect(result.classified).toBe(expected);
  });
});
