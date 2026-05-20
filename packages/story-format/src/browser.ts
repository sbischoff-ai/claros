export type { StateData, StateFile, ProjectStateSnapshot, StateAdapter } from "./state/types.js";
export type { NoteFrontmatter } from "./frontmatter/types.js";
export type {
  ProjectDirEntry,
  ProjectFileStat,
  ProjectFileReader,
  ProjectFileWriter,
  ProjectManifest,
  ChapterRef,
  SceneFrontmatter,
  SceneRef,
  NoteRef,
  MarkdownDocument,
  SourcePosition,
  SourceRange,
  WikilinkRef,
  ClarosBlockRef,
  ProjectFormatSnapshot,
} from "./project-format/types.js";

export { parseStateFile, serializeStateFile } from "./state/parser.js";
export { parseNoteFrontmatter, serializeNoteFrontmatter } from "./frontmatter/parser.js";
export { getAtPath, setAtPath } from "./state/paths.js";
export {
  ProjectFormatError,
  scanProjectFormat,
  parseMarkdownDocument,
  extractWikilinks,
  extractClarosBlocks,
  extractClarosRunId,
  stripClarosMarkers,
} from "./project-format/parser.js";
