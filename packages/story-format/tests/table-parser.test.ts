import { describe, it, expect } from "vitest";
import { parseTable, TableParseError } from "../src/tables/parser";
import type { RandomTable, MatrixTable } from "../src/tables/types";

describe("parseTable — random-table", () => {
  const yaml = `
id: osr.reaction
type: random-table
dice: 2d6
rows:
  - range: [2, 2]
    result: "Hostile"
  - range: [3, 5]
    result: "Unfriendly"
  - range: [6, 8]
    result: "Uncertain"
  - range: [9, 11]
    result: "Friendly"
  - range: [12, 12]
    result: "Enthusiastic"
`;

  it("parses id and type", () => {
    const table = parseTable(yaml) as RandomTable;
    expect(table.id).toBe("osr.reaction");
    expect(table.type).toBe("random-table");
    expect(table.dice).toBe("2d6");
  });

  it("parses all rows", () => {
    const table = parseTable(yaml) as RandomTable;
    expect(table.rows).toHaveLength(5);
    expect(table.rows[0]).toEqual({ range: [2, 2], result: "Hostile" });
    expect(table.rows[4]).toEqual({ range: [12, 12], result: "Enthusiastic" });
  });

  it("throws on missing required fields", () => {
    expect(() => parseTable(`type: random-table\ndice: 2d6\nrows: []`)).toThrow(); // no id
    expect(() => parseTable(`id: x\ntype: random-table\nrows: []`)).toThrow(); // no dice
  });

  it("throws a typed TableParseError", () => {
    expect(() => parseTable(`type: random-table\ndice: 2d6\nrows: []`)).toThrowError(
      TableParseError
    );
  });
});

describe("parseTable — matrix", () => {
  const yaml = `
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

  it("parses matrix structure", () => {
    const table = parseTable(yaml) as MatrixTable;
    expect(table.type).toBe("matrix");
    expect(table["row-key"]).toBe("odds");
    expect(table["column-key"]).toBe("cf");
  });

  it("parses cell-format", () => {
    const table = parseTable(yaml) as MatrixTable;
    expect(table["cell-format"]?.fields).toEqual(["ey", "sy", "en"]);
    expect(table["cell-format"]?.classify["exceptional-yes"]).toBe("value <= ey");
    expect(table["cell-format"]?.classify["_default"]).toBe("no");
  });

  it("parses rows and cells", () => {
    const table = parseTable(yaml) as MatrixTable;
    expect(table.rows[0].key).toBe("likely");
    expect(table.rows[0].columns[5]).toEqual([3, 65, 94]);
  });

  it("accepts integer column keys from YAML", () => {
    const table = parseTable(yaml) as MatrixTable;
    // YAML integer keys should be stored as numbers
    const colKeys = Object.keys(table.rows[0].columns).map(Number);
    expect(colKeys).toContain(5);
  });

  it("throws on unknown type", () => {
    expect(() => parseTable(`id: x\ntype: unknown-type`)).toThrow(TableParseError);
  });

  it("throws on invalid YAML", () => {
    expect(() => parseTable(`{bad yaml: [`)).toThrow(TableParseError);
  });
});

describe("parseTable — minimal matrix (no cell-format)", () => {
  const yaml = `
id: test.simple-matrix
type: matrix
row-key: category
column-key: level
rows:
  - key: low
    columns:
      1: [10, 50, 80]
      2: [15, 60, 85]
  - key: high
    columns:
      1: [5, 30, 70]
      2: [8, 40, 75]
`;

  it("parses without cell-format", () => {
    const table = parseTable(yaml) as MatrixTable;
    expect(table["cell-format"]).toBeUndefined();
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].columns[1]).toEqual([10, 50, 80]);
    expect(table.rows[1].columns[2]).toEqual([8, 40, 75]);
  });
});
