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
export type { NoteFrontmatterIOOptions } from "./entity/state.js";

export {
  appendMacroRun,
  getMacroRun,
  listMacroRuns,
  appendMacroRunLedgerEntry,
  readMacroRunLedger,
} from "./runs/ledger.js";
export { executeMacroInDocument, renderMacroDisplayBlock } from "./runs/document.js";

export { createInMemoryProjectIndex } from "./project/index.js";
export type {
  ProjectIndex,
  InMemoryProjectIndex,
  ProjectIndexDocumentRef,
  ProjectIndexSearchOptions,
  ProjectIndexSearchResult,
  WikilinkResolveReason,
  WikilinkResolution,
} from "./project/index.js";

export {
  NodeProjectFileReader,
  NodeProjectFileWriter,
  ensureParentDirectory,
  normalizeProjectRoot,
  toAbsoluteProjectPath,
  toRelativeProjectPath,
} from "./project/files.js";

export {
  CheckpointNotImplementedError,
  openProject,
  listChapters,
  listScenes,
  listNotes,
  readDocument,
  writeDocument,
  getStoryState,
  setStoryState,
  getSceneState,
  setSceneState,
  getChapterState,
  setChapterState,
  getProjectNoteFrontmatterPath,
  setProjectNoteFrontmatterPath,
  resolveWikilink,
  getBacklinks,
  search,
  listClarosBlocks,
  executeProjectMacroInDocument,
  listProjectMacroRuns,
  getProjectMacroRun,
  checkpoint,
  getCheckpointStatus,
  listCheckpoints,
  restoreCheckpoint,
} from "./project/workspace.js";
export type {
  ClarosProject,
  CheckpointOptions,
  CheckpointRef,
  CheckpointStatus,
  DocumentRef,
  HistoryOptions,
  LinkRef,
  LinkResolution,
  OpenProjectOptions,
  ProjectExecuteMacroInDocumentOptions,
  RestoreCheckpointOptions,
  SearchOptions,
  SearchResult,
  TimelineRef,
} from "./project/workspace.js";

export type {
  ChapterRef,
  ClarosBlockRef,
  MarkdownDocument,
  NoteFrontmatter,
  NoteRef,
  ProjectFileReader,
  ProjectFileWriter,
  ProjectManifest,
  SceneFrontmatter,
  SceneRef,
  SourceRange,
  WikilinkRef,
} from "@claros/story-format";

export type {
  DocumentInsertionPoint,
  ExecuteMacroInDocumentOptions,
  ExecuteMacroInDocumentResult,
  MacroRunDisplay,
  MacroRunEffect,
  MacroRunFilter,
  MacroRunLedgerEntry,
  MacroRunLedgerEntryInput,
  MacroRunRoll,
  UserPromptFn,
} from "./runs/types.js";
