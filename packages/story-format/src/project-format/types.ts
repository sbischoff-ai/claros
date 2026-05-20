import type { NoteFrontmatter } from "../frontmatter/types.js";

export interface ProjectDirEntry {
  name: string;
  isDirectory: boolean;
}

export interface ProjectFileStat {
  exists: boolean;
  isDirectory: boolean;
}

export interface ProjectFileReader {
  readFile(path: string): Promise<string>;
  readDir(path: string): Promise<ProjectDirEntry[]>;
  stat(path: string): Promise<ProjectFileStat>;
}

export interface ProjectFileWriter {
  writeFileAtomic(path: string, content: string): Promise<void>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  renameFile(fromPath: string, toPath: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

export interface ProjectManifest {
  claros?: number;
  title?: string;
  subtitle?: string;
  author?: unknown;
  exports?: unknown;
  modules?: unknown;
  [key: string]: unknown;
}

export interface ChapterRef {
  kind: "chapter";
  id: string;
  path: string;
  sequence: number;
  slug: string;
  title: string;
  metadata: Record<string, unknown>;
}

export interface SceneFrontmatter {
  title?: string;
  [key: string]: unknown;
}

export interface SceneRef {
  kind: "scene";
  id: string;
  path: string;
  chapterId: string;
  sequence: number;
  slug: string;
  title?: string;
  frontmatter: SceneFrontmatter;
}

export interface NoteRef {
  kind: "note";
  path: string;
  slug: string;
  title?: string;
  aliases: string[];
  tags: string[];
  frontmatter: NoteFrontmatter;
}

export interface MarkdownDocument {
  path: string;
  frontmatter?: Record<string, unknown>;
  body: string;
  raw: string;
}

export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface WikilinkRef {
  raw: string;
  target: string;
  alias?: string;
  fromPath: string;
  range: SourceRange;
}

export interface ClarosBlockRef {
  kind: "claros-block";
  fromPath: string;
  title?: string;
  runId?: string;
  raw: string;
  range: SourceRange;
}

export interface ProjectFormatSnapshot {
  root: string;
  manifest: ProjectManifest;
  chapters: ChapterRef[];
  scenes: SceneRef[];
  notes: NoteRef[];
  wikilinks: WikilinkRef[];
  clarosBlocks: ClarosBlockRef[];
}
