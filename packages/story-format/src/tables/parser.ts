import { load } from "js-yaml";
import { readFile } from "node:fs/promises";
import type {
  AnyTable,
  RandomTable,
  MatrixTable,
  RandomTableRow,
  MatrixRow,
  CellFormat,
} from "./types.js";

export class TableParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableParseError";
  }
}

function parseRandomTable(raw: Record<string, unknown>): RandomTable {
  if (typeof raw["id"] !== "string" || raw["id"].length === 0) {
    throw new TableParseError("random-table: missing required field 'id'");
  }
  if (typeof raw["dice"] !== "string" || raw["dice"].length === 0) {
    throw new TableParseError("random-table: missing required field 'dice'");
  }
  if (!Array.isArray(raw["rows"])) {
    throw new TableParseError("random-table: 'rows' must be an array");
  }

  const rows: RandomTableRow[] = (raw["rows"] as unknown[]).map((row, i): RandomTableRow => {
    if (typeof row !== "object" || row === null) {
      throw new TableParseError(`random-table row[${i}]: must be an object`);
    }
    const r = row as Record<string, unknown>;
    if (
      !Array.isArray(r["range"]) ||
      r["range"].length !== 2 ||
      typeof r["range"][0] !== "number" ||
      typeof r["range"][1] !== "number"
    ) {
      throw new TableParseError(`random-table row[${i}]: 'range' must be [number, number]`);
    }
    if (typeof r["result"] !== "string") {
      throw new TableParseError(`random-table row[${i}]: 'result' must be a string`);
    }
    return {
      range: [r["range"][0] as number, r["range"][1] as number],
      result: r["result"] as string,
    };
  });

  return {
    id: raw["id"] as string,
    type: "random-table",
    dice: raw["dice"] as string,
    rows,
  };
}

function parseCellFormat(raw: unknown): CellFormat {
  if (typeof raw !== "object" || raw === null) {
    throw new TableParseError("matrix: 'cell-format' must be an object");
  }
  const cf = raw as Record<string, unknown>;
  if (!Array.isArray(cf["fields"])) {
    throw new TableParseError("matrix: 'cell-format.fields' must be an array");
  }
  const fields = (cf["fields"] as unknown[]).map((f, i) => {
    if (typeof f !== "string") {
      throw new TableParseError(`matrix: 'cell-format.fields[${i}]' must be a string`);
    }
    return f as string;
  });

  if (typeof cf["classify"] !== "object" || cf["classify"] === null) {
    throw new TableParseError("matrix: 'cell-format.classify' must be an object");
  }
  const classify: Record<string, string> = {};
  for (const [label, expr] of Object.entries(cf["classify"] as Record<string, unknown>)) {
    if (typeof expr !== "string") {
      throw new TableParseError(`matrix: 'cell-format.classify["${label}"]' must be a string`);
    }
    classify[label] = expr as string;
  }

  return { fields, classify };
}

function parseMatrixTable(raw: Record<string, unknown>): MatrixTable {
  if (typeof raw["id"] !== "string" || raw["id"].length === 0) {
    throw new TableParseError("matrix: missing required field 'id'");
  }
  if (typeof raw["row-key"] !== "string") {
    throw new TableParseError("matrix: missing required field 'row-key'");
  }
  if (typeof raw["column-key"] !== "string") {
    throw new TableParseError("matrix: missing required field 'column-key'");
  }
  if (!Array.isArray(raw["rows"])) {
    throw new TableParseError("matrix: 'rows' must be an array");
  }

  const cellFormat =
    raw["cell-format"] !== undefined ? parseCellFormat(raw["cell-format"]) : undefined;

  const rows: MatrixRow[] = (raw["rows"] as unknown[]).map((row, i): MatrixRow => {
    if (typeof row !== "object" || row === null) {
      throw new TableParseError(`matrix row[${i}]: must be an object`);
    }
    const r = row as Record<string, unknown>;
    if (typeof r["key"] !== "string") {
      throw new TableParseError(`matrix row[${i}]: 'key' must be a string`);
    }
    if (typeof r["columns"] !== "object" || r["columns"] === null) {
      throw new TableParseError(`matrix row[${i}]: 'columns' must be an object`);
    }
    const columns: Record<string | number, number[]> = {};
    for (const [colKey, cell] of Object.entries(r["columns"] as Record<string, unknown>)) {
      if (!Array.isArray(cell)) {
        throw new TableParseError(`matrix row[${i}].columns["${colKey}"]: must be an array`);
      }
      // Accept numeric string keys as numbers when possible
      const key = /^\d+$/.test(colKey) ? Number(colKey) : colKey;
      columns[key] = (cell as unknown[]).map((v, vi) => {
        if (typeof v !== "number") {
          throw new TableParseError(
            `matrix row[${i}].columns["${colKey}"][${vi}]: must be a number`
          );
        }
        return v as number;
      });
    }
    return { key: r["key"] as string, columns };
  });

  const result: MatrixTable = {
    id: raw["id"] as string,
    type: "matrix",
    "row-key": raw["row-key"] as string,
    "column-key": raw["column-key"] as string,
    rows,
  };
  if (cellFormat !== undefined) {
    result["cell-format"] = cellFormat;
  }
  return result;
}

export function parseTable(yaml: string): AnyTable {
  let raw: unknown;
  try {
    raw = load(yaml);
  } catch (e) {
    throw new TableParseError(`YAML parse error: ${(e as Error).message}`);
  }

  if (typeof raw !== "object" || raw === null) {
    throw new TableParseError("table definition must be a YAML object");
  }

  const obj = raw as Record<string, unknown>;
  const type = obj["type"];

  if (type === "random-table") {
    return parseRandomTable(obj);
  } else if (type === "matrix") {
    return parseMatrixTable(obj);
  } else {
    throw new TableParseError(
      `unknown table type: ${String(type)}; expected "random-table" or "matrix"`
    );
  }
}

export async function parseTableFile(path: string): Promise<AnyTable> {
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch (e) {
    throw new TableParseError(`could not read file "${path}": ${(e as Error).message}`);
  }
  return parseTable(content);
}
