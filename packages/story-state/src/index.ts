export { FileStateAdapter, StateAdapterError } from "./state/adapter.js";
export type { FileStateAdapterOptions } from "./state/adapter.js";
export { advanceScene } from "./state/scene.js";
export type { SceneAdvanceOptions } from "./state/scene.js";
export {
  NoteNotFoundError,
  getNoteFrontmatter,
  setNoteFrontmatter,
  getNoteFrontmatterPath,
  setNoteFrontmatterPath,
} from "./entity/state.js";
export {
  appendMacroRun,
  getMacroRun,
  listMacroRuns,
  appendMacroRunLedgerEntry,
  readMacroRunLedger,
} from "./runs/ledger.js";
export { executeMacroInDocument, renderMacroDisplayBlock } from "./runs/document.js";
export type {
  SourceRange,
  DocumentInsertionPoint,
  MacroRunFilter,
  MacroRunRoll,
  MacroRunDisplay,
  MacroRunEffect,
  MacroRunLedgerEntry,
  MacroRunLedgerEntryInput,
  ExecuteMacroInDocumentOptions,
  ExecuteMacroInDocumentResult,
  UserPromptFn,
} from "./runs/types.js";
