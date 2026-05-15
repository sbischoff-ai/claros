export interface RandomTableRow {
  range: [number, number]; // [min, max] inclusive
  result: string;
}

export interface RandomTable {
  id: string;
  type: "random-table";
  dice: string; // default dice expression for auto-roll
  rows: RandomTableRow[];
}

export interface CellFormat {
  fields: string[]; // positional names for cell tuple values
  classify: Record<string, string>; // label → expression string (evaluated against cell fields + "value")
                                    // "_default" key = fallback label
}

export interface MatrixTable {
  id: string;
  type: "matrix";
  "row-key": string;    // semantic name for rows (e.g. "odds")
  "column-key": string; // semantic name for columns (e.g. "chaos")
  "cell-format"?: CellFormat;
  rows: MatrixRow[];
}

export interface MatrixRow {
  key: string;
  columns: Record<string | number, number[]>; // column key → cell tuple
}

export type AnyTable = RandomTable | MatrixTable;
