import { load } from "js-yaml";
import { parseNoteFrontmatter } from "../frontmatter/parser.js";
import type { NoteFrontmatter } from "../frontmatter/types.js";
import type {
  ChapterRef,
  ClarosBlockRef,
  MarkdownDocument,
  NoteRef,
  ProjectDirEntry,
  ProjectFileReader,
  ProjectFormatSnapshot,
  ProjectManifest,
  SceneFrontmatter,
  SceneRef,
  SourcePosition,
  SourceRange,
  WikilinkRef,
} from "./types.js";

const CHAPTER_DIR_RE = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SCENE_FILE_RE = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const WIKILINK_RE = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;
const CLAROS_RUN_RE = /\[claros-run:\s*([A-Za-z0-9_-]+)\]/i;
const CLAROS_CALLOUT_RE = /^\s*\[!claros\](.*)$/i;

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

interface IndexedLine {
  text: string;
  startOffset: number;
  endOffset: number;
  endOffsetWithNewline: number;
}

interface ScannedMarkdownFile {
  path: string;
  raw: string;
  document: MarkdownDocument;
}

export async function scanProjectFormat(
  root: string,
  fs: ProjectFileReader
): Promise<ProjectFormatSnapshot> {
  const normalizedRoot = normalizePath(root);
  const manifestPath = joinPath(normalizedRoot, "claros.yaml");
  const manuscriptPath = joinPath(normalizedRoot, "manuscript");
  const notesPath = joinPath(normalizedRoot, "notes");

  const manifestStat = await fs.stat(manifestPath);
  if (!manifestStat.exists || manifestStat.isDirectory) {
    throw new ProjectFormatError("Missing required file: claros.yaml");
  }

  const manuscriptStat = await fs.stat(manuscriptPath);
  if (!manuscriptStat.exists || !manuscriptStat.isDirectory) {
    throw new ProjectFormatError("Missing required directory: manuscript/");
  }

  const manifest = parseManifest(await fs.readFile(manifestPath));
  validateManifestPaths(manifest);

  const chapters = await scanChapters(normalizedRoot, manuscriptPath, fs);
  const { scenes, markdownFiles: sceneFiles } = await scanScenes(normalizedRoot, fs, chapters);
  const { notes, markdownFiles: noteFiles } = await scanNotes(normalizedRoot, notesPath, fs);

  const markdownFiles = [...sceneFiles, ...noteFiles];

  return {
    root: normalizedRoot,
    manifest,
    chapters,
    scenes,
    notes,
    wikilinks: markdownFiles.flatMap((file) => extractWikilinks(file.path, file.raw)),
    clarosBlocks: markdownFiles.flatMap((file) => extractClarosBlocks(file.path, file.raw)),
  };
}

export function parseMarkdownDocument(path: string, raw: string): MarkdownDocument {
  const { frontmatter, body } = parseNoteFrontmatter(raw);
  const hasFrontmatter = raw !== body;

  return {
    path,
    raw,
    frontmatter: hasFrontmatter ? (frontmatter as Record<string, unknown>) : undefined,
    body,
  };
}

export function extractWikilinks(path: string, raw: string): WikilinkRef[] {
  const lineStarts = buildLineStarts(raw);
  const wikilinks: WikilinkRef[] = [];

  for (const match of raw.matchAll(WIKILINK_RE)) {
    const matched = match[0];
    const startOffset = match.index ?? 0;
    const endOffset = startOffset + matched.length;

    wikilinks.push({
      raw: matched,
      target: match[1].trim(),
      alias: match[2]?.trim() || undefined,
      fromPath: path,
      range: offsetsToRange(startOffset, endOffset, lineStarts),
    });
  }

  return wikilinks;
}

export function extractClarosBlocks(path: string, raw: string): ClarosBlockRef[] {
  const lines = indexLines(raw);
  const lineStarts = buildLineStarts(raw);
  const clarosBlocks: ClarosBlockRef[] = [];

  let index = 0;
  while (index < lines.length) {
    const quoted = parseQuotedLine(lines[index].text);
    if (quoted === null) {
      index += 1;
      continue;
    }

    const blockStartIndex = index;
    const quotedLines: string[] = [];

    while (index < lines.length) {
      const maybeQuoted = parseQuotedLine(lines[index].text);
      if (maybeQuoted === null) {
        break;
      }
      quotedLines.push(maybeQuoted);
      index += 1;
    }

    const firstNonEmptyQuotedLine = quotedLines.find((line) => line.trim().length > 0);
    if (firstNonEmptyQuotedLine === undefined) {
      continue;
    }

    const normalizedHeader = firstNonEmptyQuotedLine.trim();
    if (!CLAROS_CALLOUT_RE.test(normalizedHeader)) {
      continue;
    }

    const title = normalizedHeader.slice("[!claros]".length).trim() || undefined;
    const runId = extractClarosRunId(quotedLines.join("\n"));
    const startOffset = lines[blockStartIndex].startOffset;
    const endOffset = lines[index - 1].endOffsetWithNewline;

    clarosBlocks.push({
      kind: "claros-block",
      fromPath: path,
      title,
      runId,
      raw: raw.slice(startOffset, endOffset),
      range: offsetsToRange(startOffset, endOffset, lineStarts),
    });
  }

  return clarosBlocks;
}

export function extractClarosRunId(raw: string): string | undefined {
  return CLAROS_RUN_RE.exec(raw)?.[1];
}

export function stripClarosMarkers(raw: string): string {
  const lines = raw.split(/\r?\n/);

  const stripped = lines.flatMap((line) => {
    const quoted = parseQuotedLine(line);
    if (quoted === null) {
      return [line];
    }

    const markerOnlyMatch = /^\s*\[claros-run:\s*[A-Za-z0-9_-]+\]\s*$/i.exec(quoted);
    if (markerOnlyMatch !== null) {
      return [];
    }

    let nextQuoted = quoted;
    const headerMatch = CLAROS_CALLOUT_RE.exec(nextQuoted);
    if (headerMatch !== null) {
      nextQuoted = (headerMatch[1] ?? "").trimStart();
    }

    nextQuoted = nextQuoted.replace(/\s*\[claros-run:\s*[A-Za-z0-9_-]+\]\s*/gi, " ").trimEnd();
    return [`> ${nextQuoted}`.trimEnd()];
  });

  return stripped.join("\n");
}

async function scanChapters(
  root: string,
  manuscriptPath: string,
  fs: ProjectFileReader
): Promise<ChapterRef[]> {
  const entries = await readSortedDir(manuscriptPath, fs);
  const chapters: ChapterRef[] = [];

  for (const entry of entries) {
    const entryPath = joinPath(manuscriptPath, entry.name);

    if (!entry.isDirectory) {
      if (entry.name.toLowerCase().endsWith(".md")) {
        throw new ProjectFormatError(
          `Direct markdown files under manuscript/ are invalid: ${relativePath(root, entryPath)}`
        );
      }
      continue;
    }

    const match = CHAPTER_DIR_RE.exec(entry.name);
    if (match === null) {
      throw new ProjectFormatError(
        `Chapter folders must match <sequence>-<kebab-slug>: ${relativePath(root, entryPath)}`
      );
    }

    const sequence = Number.parseInt(match[1], 10);
    const slug = match[2];
    const chapterMetadata = await readOptionalYamlObject(joinPath(entryPath, "chapter.yaml"), fs);
    const titleValue = chapterMetadata.title;
    const title =
      typeof titleValue === "string" && titleValue.trim().length > 0
        ? titleValue
        : `Chapter ${sequence}`;

    chapters.push({
      kind: "chapter",
      id: entry.name,
      path: relativePath(root, entryPath),
      sequence,
      slug,
      title,
      metadata: chapterMetadata,
    });
  }

  chapters.sort(compareChapterRefs);
  return chapters;
}

async function scanScenes(
  root: string,
  fs: ProjectFileReader,
  chapters: ChapterRef[]
): Promise<{ scenes: SceneRef[]; markdownFiles: ScannedMarkdownFile[] }> {
  const scenes: SceneRef[] = [];
  const markdownFiles: ScannedMarkdownFile[] = [];

  for (const chapter of chapters) {
    const chapterPath = joinPath(root, chapter.path);
    const entries = await readSortedDir(chapterPath, fs);

    for (const entry of entries) {
      if (entry.isDirectory || entry.name === "chapter.yaml") {
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }

      const scenePath = joinPath(chapterPath, entry.name);
      const match = SCENE_FILE_RE.exec(entry.name);
      if (match === null) {
        throw new ProjectFormatError(
          `Scene files must match <sequence>-<kebab-slug>.md: ${relativePath(root, scenePath)}`
        );
      }

      const raw = await fs.readFile(scenePath);
      const relative = relativePath(root, scenePath);
      const document = parseMarkdownDocument(relative, raw);
      const frontmatter = (document.frontmatter ?? {}) as SceneFrontmatter;
      const sceneStem = entry.name.slice(0, -3);

      scenes.push({
        kind: "scene",
        id: `${chapter.id}/${sceneStem}`,
        path: relative,
        chapterId: chapter.id,
        sequence: Number.parseInt(match[1], 10),
        slug: match[2],
        title: typeof frontmatter.title === "string" ? frontmatter.title : undefined,
        frontmatter,
      });

      markdownFiles.push({ path: relative, raw, document });
    }
  }

  scenes.sort(compareSceneRefs);
  return { scenes, markdownFiles };
}

async function scanNotes(
  root: string,
  notesPath: string,
  fs: ProjectFileReader
): Promise<{ notes: NoteRef[]; markdownFiles: ScannedMarkdownFile[] }> {
  const notesStat = await fs.stat(notesPath);
  if (!notesStat.exists || !notesStat.isDirectory) {
    return { notes: [], markdownFiles: [] };
  }

  const noteFiles = await collectMarkdownFiles(notesPath, fs);
  const notes: NoteRef[] = [];
  const markdownFiles: ScannedMarkdownFile[] = [];

  for (const absolutePath of noteFiles) {
    const raw = await fs.readFile(absolutePath);
    const relative = relativePath(root, absolutePath);
    const document = parseMarkdownDocument(relative, raw);
    const frontmatter = (document.frontmatter ?? {}) as NoteFrontmatter;

    notes.push({
      kind: "note",
      path: relative,
      slug: basenameWithoutExtension(relative),
      title: typeof frontmatter.title === "string" ? frontmatter.title : undefined,
      aliases: normalizeStringList(frontmatter.aliases),
      tags: normalizeStringList(frontmatter.tags),
      frontmatter,
    });

    markdownFiles.push({ path: relative, raw, document });
  }

  notes.sort((left, right) => left.path.localeCompare(right.path));
  return { notes, markdownFiles };
}

async function collectMarkdownFiles(rootPath: string, fs: ProjectFileReader): Promise<string[]> {
  const markdownFiles: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await readSortedDir(currentPath, fs);
    for (const entry of entries) {
      const entryPath = joinPath(currentPath, entry.name);
      if (entry.isDirectory) {
        await walk(entryPath);
        continue;
      }
      if (entry.name.toLowerCase().endsWith(".md")) {
        markdownFiles.push(entryPath);
      }
    }
  }

  await walk(rootPath);
  return markdownFiles;
}

async function readSortedDir(path: string, fs: ProjectFileReader): Promise<ProjectDirEntry[]> {
  const entries = await fs.readDir(path);
  return [...entries].sort((left, right) => left.name.localeCompare(right.name));
}

async function readOptionalYamlObject(
  path: string,
  fs: ProjectFileReader
): Promise<Record<string, unknown>> {
  const stat = await fs.stat(path);
  if (!stat.exists || stat.isDirectory) {
    return {};
  }

  return parseYamlObject(await fs.readFile(path));
}

function parseManifest(raw: string): ProjectManifest {
  return parseYamlObject(raw) as ProjectManifest;
}

function parseYamlObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = load(raw);
  } catch {
    return {};
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, unknown>;
}

function validateManifestPaths(manifest: ProjectManifest): void {
  const paths = manifest.paths;
  if (paths === null || typeof paths !== "object" || Array.isArray(paths)) {
    return;
  }

  const expectedPaths: Record<string, string> = {
    manuscript: "manuscript",
    notes: "notes",
    state: "state",
    assets: "assets",
    claros: ".claros",
  };

  for (const [key, expectedPath] of Object.entries(expectedPaths)) {
    const configuredPath = (paths as Record<string, unknown>)[key];
    if (typeof configuredPath === "string" && configuredPath !== expectedPath) {
      throw new ProjectFormatError(
        `Alternate core folder paths are not supported for MVP: paths.${key}=${configuredPath}`
      );
    }
  }
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function compareChapterRefs(left: ChapterRef, right: ChapterRef): number {
  return left.sequence - right.sequence || left.slug.localeCompare(right.slug);
}

function compareSceneRefs(left: SceneRef, right: SceneRef): number {
  return (
    chapterSequence(left.chapterId) - chapterSequence(right.chapterId) ||
    left.chapterId.localeCompare(right.chapterId) ||
    left.sequence - right.sequence ||
    left.slug.localeCompare(right.slug)
  );
}

function chapterSequence(chapterId: string): number {
  const match = CHAPTER_DIR_RE.exec(chapterId);
  return match === null ? Number.POSITIVE_INFINITY : Number.parseInt(match[1], 10);
}

function parseQuotedLine(line: string): string | null {
  const match = /^\s*>\s?(.*)$/.exec(line);
  return match?.[1] ?? null;
}

function indexLines(raw: string): IndexedLine[] {
  const lines: IndexedLine[] = [];
  const lineMatches = raw.matchAll(/.*(?:\r?\n|$)/g);

  for (const match of lineMatches) {
    const fullLine = match[0];
    if (fullLine.length === 0) {
      continue;
    }

    const startOffset = match.index ?? 0;
    const endOffsetWithNewline = startOffset + fullLine.length;
    const text = fullLine.replace(/\r?\n$/, "");
    const endOffset = startOffset + text.length;

    lines.push({ text, startOffset, endOffset, endOffsetWithNewline });
  }

  return lines;
}

function buildLineStarts(raw: string): number[] {
  const starts = [0];
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function offsetsToRange(startOffset: number, endOffset: number, lineStarts: number[]): SourceRange {
  return {
    start: offsetToPosition(startOffset, lineStarts),
    end: offsetToPosition(endOffset, lineStarts),
  };
}

function offsetToPosition(offset: number, lineStarts: number[]): SourcePosition {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const currentLineStart = lineStarts[middle];
    const nextLineStart =
      middle + 1 < lineStarts.length ? lineStarts[middle + 1] : Number.POSITIVE_INFINITY;

    if (offset < currentLineStart) {
      high = middle - 1;
      continue;
    }

    if (offset >= nextLineStart) {
      low = middle + 1;
      continue;
    }

    return {
      line: middle + 1,
      column: offset - currentLineStart + 1,
      offset,
    };
  }

  return { line: 1, column: 1, offset };
}

function basenameWithoutExtension(path: string): string {
  const filename = path.split("/").at(-1) ?? path;
  return filename.replace(/\.md$/i, "");
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (normalized === "") {
    return ".";
  }
  if (normalized === "/") {
    return "/";
  }
  return normalized.replace(/\/+$/, "");
}

function joinPath(base: string, segment: string): string {
  return normalizePath(`${base}/${segment}`);
}

function relativePath(root: string, target: string): string {
  const rootParts = splitPath(root);
  const targetParts = splitPath(target);
  let index = 0;

  while (
    index < rootParts.length &&
    index < targetParts.length &&
    rootParts[index] === targetParts[index]
  ) {
    index += 1;
  }

  return targetParts.slice(index).join("/");
}

function splitPath(path: string): string[] {
  return normalizePath(path)
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
}
