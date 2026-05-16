import { describe, it, expect } from "vitest";
import { parseMacro } from "../src/macro/parser.js";
import { executeMacro } from "../src/macro/executor.js";
import { parseTable } from "@claros/story-format";
import type { RandomTable, MatrixTable } from "@claros/story-format";
import { fixedRNG } from "../src/dice/types.js";

describe("executeMacro", () => {
  describe("roll steps", () => {
    it("executes a roll step and exposes the result", async () => {
      const macro = parseMacro(`
id: test.roll
name: "Roll"
params: {}
steps:
  - id: my-roll
    roll: 1d20
output:
  total: "steps.my-roll.total"
`);
      const result = await executeMacro(macro, {}, new Map(), fixedRNG(14));
      expect(result.output.total).toBe(14);
      expect(result.steps["my-roll"].total).toBe(14);
    });

    it("roll result includes all RollResult fields", async () => {
      const macro = parseMacro(`
id: test.d100
name: "D100"
params: {}
steps:
  - id: r
    roll: 1d100
output:
  is_double: "steps.r.is_double"
  double_digit: "steps.r.double_digit"
`);
      const result = await executeMacro(macro, {}, new Map(), fixedRNG(44));
      expect(result.output.is_double).toBe(true);
      expect(result.output.double_digit).toBe(4);
    });
  });

  describe("when conditions", () => {
    it("skips a step when condition is false", async () => {
      const macro = parseMacro(`
id: test.conditional
name: "Conditional"
params:
  flag:
    type: bool
    source: user
steps:
  - id: skipped
    when: "params.flag"
    roll: 1d6
output:
  ran: "steps.skipped != null"
`);
      const result = await executeMacro(macro, { flag: false }, new Map(), fixedRNG(3));
      expect(result.steps["skipped"]).toBeUndefined();
    });

    it("runs a step when condition is true", async () => {
      const macro = parseMacro(`
id: test.conditional
name: "Conditional"
params:
  flag:
    type: bool
    source: user
steps:
  - id: ran
    when: "params.flag"
    roll: 1d6
output: {}
`);
      const result = await executeMacro(macro, { flag: true }, new Map(), fixedRNG(3));
      expect(result.steps["ran"]).toBeDefined();
      expect(result.steps["ran"].total).toBe(3);
    });
  });

  describe("lookup steps", () => {
    it("executes a lookup step against a table", async () => {
      const tableYaml = `
id: test.table
type: random-table
dice: 1d4
rows:
  - range: [1, 2]
    result: "Low"
  - range: [3, 4]
    result: "High"
`;
      const table = parseTable(tableYaml) as RandomTable;
      const tables = new Map([["test.table", table]]);

      const macro = parseMacro(`
id: test.lookup
name: "Lookup"
params: {}
steps:
  - id: roll
    roll: 1d4
  - id: result
    lookup:
      table: test.table
      roll: "steps.roll.total"
output:
  result: "steps.result.matched"
`);
      const result = await executeMacro(macro, {}, tables, fixedRNG(3));
      expect(result.output.result).toBe("High");
    });
  });

  describe("matrix-lookup steps", () => {
    it("executes a matrix-lookup with classify", async () => {
      const tableYaml = `
id: test.matrix
type: matrix
row-key: odds
column-key: cf
cell-format:
  fields: [ey, sy, en]
  classify:
    exceptional-yes: "value <= ey"
    yes: "value <= sy"
    exceptional-no: "value >= en"
    _default: no
rows:
  - key: likely
    columns:
      5: [3, 65, 94]
`;
      const table = parseTable(tableYaml) as MatrixTable;
      const tables = new Map([["test.matrix", table]]);

      const macro = parseMacro(`
id: test.matrix-lookup
name: "Matrix Lookup"
params:
  odds:
    type: string
    source: user
  cf:
    type: int
    source: user
steps:
  - id: roll
    roll: 1d100
  - id: outcome
    matrix-lookup:
      table: test.matrix
      row: "params.odds"
      column: "params.cf"
      classify: "steps.roll.total"
output:
  result: "steps.outcome.classified"
`);
      const result = await executeMacro(
        macro,
        { odds: "likely", cf: 5 },
        tables,
        fixedRNG(40)
      );
      expect(result.output.result).toBe("yes");
    });
  });

  describe("params in output expressions", () => {
    it("exposes params to output expressions", async () => {
      const macro = parseMacro(`
id: test.params-out
name: "Params Out"
params:
  x:
    type: int
    source: user
  y:
    type: int
    source: user
steps: []
output:
  sum: "params.x + params.y"
`);
      const result = await executeMacro(macro, { x: 3, y: 4 }, new Map());
      expect(result.output.sum).toBe(7);
    });
  });
});
