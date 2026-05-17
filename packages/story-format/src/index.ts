export { parseTable, parseTableFile, TableParseError } from "./tables/parser.js";
export type { AnyTable, RandomTable, RandomTableRow, MatrixTable, MatrixRow, CellFormat } from "./tables/types.js";

export type {
  StateData,
  StateFile,
  ProjectStateSnapshot,
  StateAdapter,
} from "./state/types.js";
export type { NoteFrontmatter } from "./frontmatter/types.js";
export { parseStateFile, serializeStateFile } from "./state/parser.js";
export {
  parseNoteFrontmatter,
  serializeNoteFrontmatter,
} from "./frontmatter/parser.js";
export { getAtPath, setAtPath } from "./state/paths.js";
