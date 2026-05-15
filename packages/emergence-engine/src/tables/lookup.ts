import type { RandomTable, MatrixTable } from "@claros/story-format";
import { rollDice } from "../dice/evaluator.js";
import type { RNG } from "../dice/types.js";
import type { LookupResult, CellResult } from "./types.js";

export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupError";
  }
}

export function lookup(
  table: RandomTable,
  value?: number,
  rng?: RNG
): LookupResult {
  const roll =
    value !== undefined ? value : rollDice(table.dice, rng).total;

  const row = table.rows.find(
    (r) => roll >= r.range[0] && roll <= r.range[1]
  );

  if (row === undefined) {
    throw new LookupError(
      `value ${roll} is out of range for table "${table.id}"`
    );
  }

  return { matched: row.result, row };
}

// TODO(iter-03): replace with expression evaluator
// Stub: evaluates only "value <= fieldName" and "value >= fieldName" patterns.
function evaluateClassifyExpr(
  expr: string,
  value: number,
  fields: Record<string, number>
): boolean {
  const leMatch = expr.match(/^value\s*<=\s*(\w+)$/);
  if (leMatch) {
    const fieldName = leMatch[1];
    if (!(fieldName in fields)) {
      throw new LookupError(`classify expression references unknown field "${fieldName}"`);
    }
    return value <= fields[fieldName];
  }

  const geMatch = expr.match(/^value\s*>=\s*(\w+)$/);
  if (geMatch) {
    const fieldName = geMatch[1];
    if (!(fieldName in fields)) {
      throw new LookupError(`classify expression references unknown field "${fieldName}"`);
    }
    return value >= fields[fieldName];
  }

  // Unrecognised pattern — never matches (iter-03 will fix this)
  return false;
}

export function matrixLookup(
  table: MatrixTable,
  row: string,
  column: string | number,
  classify?: number
): CellResult {
  const matrixRow = table.rows.find((r) => r.key === row);
  if (matrixRow === undefined) {
    throw new LookupError(
      `row key "${row}" not found in matrix table "${table.id}"`
    );
  }

  // Accept both exact key type and numeric-string equivalents
  let cell = matrixRow.columns[column];
  if (cell === undefined) {
    // Try numeric coercion: column "5" should match stored key 5 and vice versa
    const numericColumn =
      typeof column === "string" ? Number(column) : String(column);
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
      throw new LookupError(
        `classify requested but table "${table.id}" has no cell-format`
      );
    }

    let classified: string | undefined;
    let defaultLabel: string | undefined;

    for (const [label, expr] of Object.entries(cellFormat.classify)) {
      if (label === "_default") {
        defaultLabel = expr; // "_default" value is the fallback label string
        continue;
      }
      // TODO(iter-03): replace with expression evaluator
      if (evaluateClassifyExpr(expr, classify, fieldMap)) {
        classified = label;
        break;
      }
    }

    cellResult.classified = classified ?? defaultLabel;
  }

  return cellResult;
}
