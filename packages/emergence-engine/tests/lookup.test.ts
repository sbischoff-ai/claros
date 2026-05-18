import { describe, it, expect } from "vitest";
import type { RNG } from "../src/dice/types";
import { lookup, matrixLookup, lookupWeightedArray, LookupError } from "../src/tables/lookup";
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
      { range: [2, 2], result: "Hostile" },
      { range: [3, 5], result: "Unfriendly" },
      { range: [6, 8], result: "Uncertain" },
      { range: [9, 11], result: "Friendly" },
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
    expect(() => lookup(table, 1)).toThrow(); // below minimum
    expect(() => lookup(table, 13)).toThrow(); // above maximum
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
        yes: "value <= sy",
        "exceptional-no": "value >= en",
        _default: "no",
      },
    },
    rows: [
      { key: "likely", columns: { 5: [3, 65, 94] } },
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

describe("lookupWeightedArray — inline generic weighted arrays (ADR-022 Delta B)", () => {
  /**
   * Helper RNG that always returns a fixed integer, ignoring min/max.
   * Used to drive deterministic weighted selection:
   * rng(1, totalWeight) → fixedValue, then roll ≤ cumulative selects the entry.
   */
  function fixedIntRNG(value: number): RNG {
    return () => value;
  }

  it("selects the only active entry when there is one", () => {
    const entries = [{ name: "North Gate" }];
    // totalWeight = 1; rng(1,1) = 1; cumulative = 1; 1 ≤ 1 → first entry.
    const result = lookupWeightedArray(entries, fixedIntRNG(1));
    expect(result.entry.name).toBe("North Gate");
    expect(result.index).toBe(0);
  });

  it("treats missing weight as 1 (default weight)", () => {
    // Two entries, no weight — each effectively weight 1; totalWeight = 2.
    // roll = 1; cumulative after first entry = 1; 1 ≤ 1 → first entry.
    const entries = [{ name: "Alpha" }, { name: "Beta" }];
    const result = lookupWeightedArray(entries, fixedIntRNG(1));
    expect(result.entry.name).toBe("Alpha");
    expect(result.index).toBe(0);
  });

  it("selects second entry when roll falls in second weight bucket (default weight)", () => {
    // roll = 2; cumulative after first = 1; 2 > 1; cumulative after second = 2; 2 ≤ 2 → second.
    const entries = [{ name: "Alpha" }, { name: "Beta" }];
    const result = lookupWeightedArray(entries, fixedIntRNG(2));
    expect(result.entry.name).toBe("Beta");
    expect(result.index).toBe(1);
  });

  it("respects explicit weights proportionally", () => {
    // weights: [1, 3] → totalWeight = 4.
    const entries = [
      { name: "Rare", weight: 1 },
      { name: "Common", weight: 3 },
    ];
    // roll = 1; cum after weight-1 entry = 1; 1 ≤ 1 → first ("Rare").
    expect(lookupWeightedArray(entries, fixedIntRNG(1)).entry.name).toBe("Rare");
    // roll = 2; cum after weight-1 = 1; 2 > 1; cum after weight-3 = 4; 2 ≤ 4 → second.
    expect(lookupWeightedArray(entries, fixedIntRNG(2)).entry.name).toBe("Common");
    // roll = 4; cum after weight-1 = 1; 4 > 1; cum after weight-3 = 4; 4 ≤ 4 → second.
    expect(lookupWeightedArray(entries, fixedIntRNG(4)).entry.name).toBe("Common");
  });

  it("excludes entries with active: false", () => {
    const entries = [
      { name: "Inactive", active: false },
      { name: "Active", active: true },
    ];
    // Only one active entry (weight 1, totalWeight = 1); roll = 1 ≤ 1 → active entry.
    const result = lookupWeightedArray(entries, fixedIntRNG(1));
    expect(result.entry.name).toBe("Active");
    expect(result.index).toBe(1); // original index preserved
  });

  it("excludes entries with active: false from weight calculation", () => {
    // Inactive entry has high weight but must not affect selection.
    const entries = [
      { name: "Inactive", weight: 99, active: false },
      { name: "A", weight: 1 },
      { name: "B", weight: 1 },
    ];
    // totalWeight = 2 (only active entries). roll = 1 ≤ cum 1 → first active (A, index 1).
    const result = lookupWeightedArray(entries, fixedIntRNG(1));
    expect(result.entry.name).toBe("A");
    expect(result.index).toBe(1);
  });

  it("treats absent active as true (included by default)", () => {
    const entries = [{ name: "NoActiveField" }]; // no active field — should be included
    const result = lookupWeightedArray(entries, fixedIntRNG(1));
    expect(result.entry.name).toBe("NoActiveField");
  });

  it("throws LookupError for empty array", () => {
    expect(() => lookupWeightedArray([])).toThrowError(LookupError);
  });

  it("throws LookupError when all entries are inactive", () => {
    const entries = [
      { name: "Inactive A", active: false },
      { name: "Inactive B", active: false },
    ];
    expect(() => lookupWeightedArray(entries, fixedIntRNG(1))).toThrowError(LookupError);
  });

  it("returns correct original index when entries before selected are inactive", () => {
    const entries = [
      { name: "Skip", active: false },
      { name: "Also Skip", active: false },
      { name: "Selected" },
    ];
    // Only entry: totalWeight = 1; roll = 1 ≤ 1 → Selected (index 2).
    const result = lookupWeightedArray(entries, fixedIntRNG(1));
    expect(result.entry.name).toBe("Selected");
    expect(result.index).toBe(2);
  });
});
