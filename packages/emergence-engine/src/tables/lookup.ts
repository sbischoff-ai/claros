import type { RandomTable, MatrixTable } from "@claros/story-format";
import { rollDice } from "../dice/evaluator.js";
import type { RNG } from "../dice/types.js";
import type { LookupResult, CellResult, WeightedArrayResult, WeightedArrayEntry } from "./types.js";
import { createEvaluator } from "../expression/evaluator.js";

export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupError";
  }
}

export function lookup(table: RandomTable, value?: number, rng?: RNG): LookupResult {
  const roll = value !== undefined ? value : rollDice(table.dice, rng).total;

  const row = table.rows.find((r) => roll >= r.range[0] && roll <= r.range[1]);

  if (row === undefined) {
    throw new LookupError(`value ${roll} is out of range for table "${table.id}"`);
  }

  return { matched: row.result, row };
}

export function matrixLookup(
  table: MatrixTable,
  row: string,
  column: string | number,
  classify?: number
): CellResult {
  const matrixRow = table.rows.find((r) => r.key === row);
  if (matrixRow === undefined) {
    throw new LookupError(`row key "${row}" not found in matrix table "${table.id}"`);
  }

  // Accept both exact key type and numeric-string equivalents
  let cell = matrixRow.columns[column];
  if (cell === undefined) {
    // Try numeric coercion: column "5" should match stored key 5 and vice versa
    const numericColumn = typeof column === "string" ? Number(column) : String(column);
    cell = matrixRow.columns[numericColumn as string | number];
  }

  if (cell === undefined) {
    throw new LookupError(
      `column key "${String(column)}" not found in row "${row}" of matrix table "${table.id}"`
    );
  }

  const cellFormat = table["cell-format"];

  // Build named field map
  const fieldMap: Record<string, number> = {};
  if (cellFormat !== undefined) {
    for (let i = 0; i < cellFormat.fields.length; i++) {
      fieldMap[cellFormat.fields[i]] = cell[i];
    }
  }

  const cellResult: CellResult = {
    cell: cellFormat !== undefined ? fieldMap : Object.fromEntries(cell.map((v, i) => [i, v])),
  };

  if (classify !== undefined) {
    if (cellFormat === undefined) {
      throw new LookupError(`classify requested but table "${table.id}" has no cell-format`);
    }

    let classified: string | undefined;
    let defaultLabel: string | undefined;
    const evaluator = createEvaluator();

    for (const [label, expr] of Object.entries(cellFormat.classify)) {
      if (label === "_default") {
        defaultLabel = expr; // "_default" value is the fallback label string
        continue;
      }
      if (evaluator.evaluateBool(expr, { value: classify, ...fieldMap })) {
        classified = label;
        break;
      }
    }

    cellResult.classified = classified ?? defaultLabel;
  }

  return cellResult;
}

/**
 * Select a random entry from a generic weighted array.
 *
 * - Only entries where `active !== false` are considered.
 * - Missing `weight` defaults to `1`.
 * - Selection is proportional to effective weights using the provided RNG
 *   (or `Math.random` when omitted).
 * - Throws `LookupError` when the array is empty or all entries are inactive.
 *
 * This function does NOT use range-based logic; that remains exclusive to
 * static `random-table` files.
 */
export function lookupWeightedArray<T extends WeightedArrayEntry>(
  entries: T[],
  rng?: RNG
): WeightedArrayResult<T> {
  // Build index of active entries with their original positions
  type Candidate = { entry: T; index: number; weight: number };
  const candidates: Candidate[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.active === false) continue;
    candidates.push({ entry: e, index: i, weight: e.weight !== undefined ? e.weight : 1 });
  }

  if (candidates.length === 0) {
    throw new LookupError("lookupWeightedArray: no active entries in weighted array");
  }

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);

  // Roll an integer in [1, totalWeight] using the provided RNG, or fall back to Math.random.
  const roll =
    rng !== undefined ? rng(1, totalWeight) : Math.floor(Math.random() * totalWeight) + 1;

  let cumulative = 0;
  for (const candidate of candidates) {
    cumulative += candidate.weight;
    if (roll <= cumulative) {
      return { entry: candidate.entry, index: candidate.index };
    }
  }

  // Should be unreachable; return the last candidate as a safety fallback.
  const last = candidates[candidates.length - 1];
  return { entry: last.entry, index: last.index };
}
