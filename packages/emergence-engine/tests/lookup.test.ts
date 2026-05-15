import { describe, it, expect } from "vitest";
import type { RNG } from "../src/dice/types";
import { lookup, matrixLookup, LookupError } from "../src/tables/lookup";
import type { RandomTable, MatrixTable } from "@claros/story-format";

function seqRNG(values: number[]): RNG {
  let i = 0;
  return () => values[i++];
}

describe("lookup — random table", () => {
  const table: RandomTable = {
    id: "osr.reaction",
    type: "random-table",
    dice: "2d6",
    rows: [
      { range: [2, 2],   result: "Hostile" },
      { range: [3, 5],   result: "Unfriendly" },
      { range: [6, 8],   result: "Uncertain" },
      { range: [9, 11],  result: "Friendly" },
      { range: [12, 12], result: "Enthusiastic" },
    ],
  };

  it("returns the matching row for an explicit value", () => {
    expect(lookup(table, 7).matched).toBe("Uncertain");
    expect(lookup(table, 2).matched).toBe("Hostile");
    expect(lookup(table, 12).matched).toBe("Enthusiastic");
  });

  it("auto-rolls when no value given", () => {
    const result = lookup(table);
    expect(["Hostile", "Unfriendly", "Uncertain", "Friendly", "Enthusiastic"]).toContain(
      result.matched
    );
  });

  it("uses the provided RNG for auto-roll", () => {
    // 2d6 with both dice = 3 and 4 → total 7 → "Uncertain"
    const result = lookup(table, undefined, seqRNG([3, 4]));
    expect(result.matched).toBe("Uncertain");
  });

  it("throws when value is out of all ranges", () => {
    expect(() => lookup(table, 1)).toThrow();   // below minimum
    expect(() => lookup(table, 13)).toThrow();  // above maximum
  });

  it("throws a typed LookupError for out-of-range values", () => {
    expect(() => lookup(table, 1)).toThrowError(LookupError);
  });

  it("returns the matched row object", () => {
    const result = lookup(table, 4);
    expect(result.row).toEqual({ range: [3, 5], result: "Unfriendly" });
  });
});

describe("matrixLookup", () => {
  const table: MatrixTable = {
    id: "test.fate-like",
    type: "matrix",
    "row-key": "odds",
    "column-key": "cf",
    "cell-format": {
      fields: ["ey", "sy", "en"],
      classify: {
        "exceptional-yes": "value <= ey",
        "yes":             "value <= sy",
        "exceptional-no":  "value >= en",
        "_default":        "no",
      },
    },
    rows: [
      { key: "likely",   columns: { 5: [3, 65, 94] } },
      { key: "unlikely", columns: { 5: [1, 35, 88] } },
    ],
  };

  it("returns the raw cell as named fields", () => {
    const result = matrixLookup(table, "likely", 5);
    expect(result.cell).toEqual({ ey: 3, sy: 65, en: 94 });
    expect(result.classified).toBeUndefined();
  });

  it("classifies a value in the exceptional-yes range", () => {
    // [3, 65, 94]: roll of 2 <= ey(3) → exceptional-yes
    const result = matrixLookup(table, "likely", 5, 2);
    expect(result.classified).toBe("exceptional-yes");
  });

  it("classifies a value in the yes range", () => {
    // roll of 40: > ey(3), <= sy(65) → yes
    const result = matrixLookup(table, "likely", 5, 40);
    expect(result.classified).toBe("yes");
  });

  it("classifies a value in the no range", () => {
    // roll of 80: > sy(65), < en(94) → no (default)
    const result = matrixLookup(table, "likely", 5, 80);
    expect(result.classified).toBe("no");
  });

  it("classifies a value in the exceptional-no range", () => {
    // roll of 95: >= en(94) → exceptional-no
    const result = matrixLookup(table, "likely", 5, 95);
    expect(result.classified).toBe("exceptional-no");
  });

  it("classifies the boundary values correctly", () => {
    // ey boundary: 3 → exceptional-yes
    expect(matrixLookup(table, "likely", 5, 3).classified).toBe("exceptional-yes");
    // sy boundary: 65 → yes
    expect(matrixLookup(table, "likely", 5, 65).classified).toBe("yes");
    // en boundary: 94 → exceptional-no
    expect(matrixLookup(table, "likely", 5, 94).classified).toBe("exceptional-no");
  });

  it("throws on unknown row key", () => {
    expect(() => matrixLookup(table, "certain", 5)).toThrow();
  });

  it("throws on unknown column key", () => {
    expect(() => matrixLookup(table, "likely", 9)).toThrow();
  });

  it("throws when classify is requested but no cell-format is defined", () => {
    const noFormat: MatrixTable = { ...table, "cell-format": undefined };
    expect(() => matrixLookup(noFormat, "likely", 5, 40)).toThrow();
  });

  it("accepts string column key matching a numeric key", () => {
    // column stored as number 5, accessed as string "5"
    const result = matrixLookup(table, "likely", "5");
    expect(result.cell).toEqual({ ey: 3, sy: 65, en: 94 });
  });

  it("works on the unlikely row", () => {
    const result = matrixLookup(table, "unlikely", 5);
    expect(result.cell).toEqual({ ey: 1, sy: 35, en: 88 });
  });
});
