import type { RandomTableRow } from "@claros/story-format";

export interface LookupResult {
  matched: string; // the result string from the matched row
  row: RandomTableRow; // the matched row
}

export interface CellResult {
  cell: Record<string, number>; // field names → values (e.g. {ey: 2, sy: 50, en: 91})
  classified?: string; // classification label, if classify was requested
}

export type WeightedArrayEntry = Record<string, unknown> & {
  weight?: number;
  active?: boolean;
};

export interface WeightedArrayResult<T extends WeightedArrayEntry = WeightedArrayEntry> {
  entry: T; // the selected weighted-array entry
  index: number; // index of the entry in the original (unfiltered) array
}
