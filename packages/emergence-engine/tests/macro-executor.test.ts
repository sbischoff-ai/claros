import { describe, it, expect } from "vitest";
import { parseMacro } from "../src/macro/parser.js";
import { executeMacro } from "../src/macro/executor.js";
import { parseTable } from "@claros/story-format";
import type { RandomTable, MatrixTable } from "@claros/story-format";
import { fixedRNG } from "../src/dice/types.js";
import { createRegistry } from "../src/registry/types.js";
import { createInMemoryStateAdapter } from "../src/state/adapter.js";

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
      const result = await executeMacro(
        macro,
        {},
        createRegistry(),
        createInMemoryStateAdapter(),
        undefined,
        fixedRNG(14)
      );
      expect(result.output.total).toBe(14);
      expect((result.steps["my-roll"] as any).total).toBe(14);
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
      const result = await executeMacro(
        macro,
        {},
        createRegistry(),
        createInMemoryStateAdapter(),
        undefined,
        fixedRNG(44)
      );
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
      const result = await executeMacro(
        macro,
        { flag: false },
        createRegistry(),
        createInMemoryStateAdapter(),
        undefined,
        fixedRNG(3)
      );
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
      const result = await executeMacro(
        macro,
        { flag: true },
        createRegistry(),
        createInMemoryStateAdapter(),
        undefined,
        fixedRNG(3)
      );
      expect(result.steps["ran"]).toBeDefined();
      expect((result.steps["ran"] as any).total).toBe(3);
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
      const registry = createRegistry();
      registry.registerTable(table);

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
      const result = await executeMacro(
        macro,
        {},
        registry,
        createInMemoryStateAdapter(),
        undefined,
        fixedRNG(3)
      );
      expect(result.output.result).toBe("High");
    });

    it("auto-rolls using the table's dice expression when no roll: is given", async () => {
      const tableYaml = `
id: test.autoroll
type: random-table
dice: 1d4
rows:
  - range: [1, 2]
    result: "Low"
  - range: [3, 4]
    result: "High"
`;
      const table = parseTable(tableYaml) as RandomTable;
      const registry = createRegistry();
      registry.registerTable(table);

      const macro = parseMacro(`
id: test.lookup-auto
name: "Lookup Auto Roll"
params: {}
steps:
  - id: result
    lookup:
      table: test.autoroll
output:
  result: "steps.result.matched"
`);
      const result = await executeMacro(
        macro,
        {},
        registry,
        createInMemoryStateAdapter(),
        undefined,
        fixedRNG(4)
      );
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
      const registry = createRegistry();
      registry.registerTable(table);

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
        registry,
        createInMemoryStateAdapter(),
        undefined,
        fixedRNG(40)
      );
      expect(result.output.result).toBe("yes");
    });
  });

  describe("lookup steps — inline generic weighted-array source (ADR-022 Delta B)", () => {
    it("selects from a state expression that resolves to a weighted array", async () => {
      const state = createInMemoryStateAdapter({
        story: {
          example: {
            lists: {
              targets: [
                {
                  name: "North Gate",
                  weight: 2,
                  active: true,
                  kind: "location",
                },
                { name: "Rusted Beacon", active: true, kind: "landmark" },
              ],
            },
          },
        },
      });

      const macro = parseMacro(`
id: test.weighted-target
name: "Pick Target"
params: {}
steps:
  - id: pick
    lookup:
      table: state.story.example.lists.targets
output:
  target_name: "steps.pick.entry.name"
  target_index: "steps.pick.index"
`);

      // fixedRNG(1): rng(1, totalWeight) clamps to max(1, min(totalWeight, 1)) = 1.
      // totalWeight = 3 (weight 2 + default 1). roll=1 <= cum 2 → first entry.
      const result = await executeMacro(macro, {}, createRegistry(), state, undefined, fixedRNG(1));
      expect(result.output.target_name).toBe("North Gate");
      expect(result.output.target_index).toBe(0);
    });

    it("respects active: false by excluding inactive entries", async () => {
      const state = createInMemoryStateAdapter({
        story: {
          example: {
            lists: {
              targets: [
                { name: "Dormant Marker", active: false },
                { name: "Open Passage", active: true },
              ],
            },
          },
        },
      });

      const macro = parseMacro(`
id: test.active-filter
name: "Active Filter"
params: {}
steps:
  - id: pick
    lookup:
      table: state.story.example.lists.targets
output:
  target_name: "steps.pick.entry.name"
`);

      // Only one active entry; any roll selects it.
      const result = await executeMacro(macro, {}, createRegistry(), state, undefined, fixedRNG(1));
      expect(result.output.target_name).toBe("Open Passage");
    });

    it("throws when the expression does not resolve to an array", async () => {
      const state = createInMemoryStateAdapter({ story: { example: { priority: 5 } } });

      const macro = parseMacro(`
id: test.bad-source
name: "Bad Source"
params: {}
steps:
  - id: pick
    lookup:
      table: state.story.example.priority
output: {}
`);

      await expect(
        executeMacro(macro, {}, createRegistry(), state, undefined, fixedRNG(1))
      ).rejects.toThrow();
    });

    it("falls back to static table when table ID matches a registered table", async () => {
      // Ensure that adding an expression-like path does not break the static path.
      const tableYaml = `
id: test.fallback
type: random-table
dice: 1d2
rows:
  - range: [1, 1]
    result: One
  - range: [2, 2]
    result: Two
`;
      const registry = createRegistry();
      registry.registerTable(parseTable(tableYaml));

      const macro = parseMacro(`
id: test.static-fallback
name: "Static"
params: {}
steps:
  - id: r
    lookup:
      table: test.fallback
output:
  result: "steps.r.matched"
`);

      const result = await executeMacro(
        macro,
        {},
        registry,
        createInMemoryStateAdapter(),
        undefined,
        fixedRNG(2)
      );
      expect(result.output.result).toBe("Two");
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
      const result = await executeMacro(
        macro,
        { x: 3, y: 4 },
        createRegistry(),
        createInMemoryStateAdapter()
      );
      expect(result.output.sum).toBe(7);
    });
  });
});
