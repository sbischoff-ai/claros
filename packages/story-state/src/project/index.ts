import {
  extractClarosBlocks,
  extractWikilinks,
  parseMarkdownDocument,
  type ChapterRef,
  type ClarosBlockRef,
  type NoteFrontmatter,
  type NoteRef,
  type ProjectFormatSnapshot,
  type ProjectManifest,
  type SceneFrontmatter,
  type SceneRef,
  type WikilinkRef,
} from "@claros/story-format";
import type { MacroRunFilter, MacroRunLedgerEntry } from "../runs/types.js";

const RESERVED_NOTE_FRONTMATTER_KEYS = new Set(["title", "type", "aliases", "tags"]);
const CHAPTER_ID_RE = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const SCENE_STEM_RE = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export type ProjectIndexDocumentRef = { path: string };

export interface ProjectIndexSearchOptions {
  limit?: number;
  kinds?: Array<"scene" | "note">;
}

export interface ProjectIndexSearchResult {
  path: string;
  kind: "scene" | "note";
  score: number;
  title?: string;
  ref: SceneRef | NoteRef;
}

export type WikilinkResolveReason = "explicit-path" | "title" | "alias" | "slug";

export type WikilinkResolution =
  | {
      status: "resolved";
      reason: WikilinkResolveReason;
      path: string;
      ref: SceneRef | NoteRef;
    }
  | {
      status: "ambiguous";
      reason: Exclude<WikilinkResolveReason, "explicit-path">;
      target: string;
      candidates: NoteRef[];
    }
  | {
      status: "unresolved";
      target: string;
    };

export interface ProjectIndex {
  build(snapshot: ProjectFormatSnapshot, runs?: MacroRunLedgerEntry[]): Promise<void>;
  updateDocument(path: string, raw: string): Promise<void>;
  removeDocument(path: string): Promise<void>;
  updateRuns(runs: MacroRunLedgerEntry[]): Promise<void>;
  getManifestSummary(): ProjectManifest;
  listChapters(): ChapterRef[];
  listScenes(): SceneRef[];
  listNotes(): NoteRef[];
  listClarosBlocks(): ClarosBlockRef[];
  listMacroRuns(filter?: MacroRunFilter): MacroRunLedgerEntry[];
  resolveWikilink(target: string, from?: ProjectIndexDocumentRef): WikilinkResolution;
  getOutgoingLinks(ref: ProjectIndexDocumentRef): WikilinkRef[];
  getBacklinks(ref: ProjectIndexDocumentRef): WikilinkRef[];
  findByTag(tag: string): NoteRef[];
  search(query: string, options?: ProjectIndexSearchOptions): ProjectIndexSearchResult[];
}

export type InMemoryProjectIndex = ProjectIndex;

interface SearchRecord {
  path: string;
  kind: "scene" | "note";
  title?: string;
  tokens: string;
  ref: SceneRef | NoteRef;
}

class InMemoryProjectIndexImpl implements ProjectIndex {
  private chaptersById = new Map<string, ChapterRef>();
  private scenesByPath = new Map<string, SceneRef>();
  private notesByPath = new Map<string, NoteRef>();
  private wikilinksByPath = new Map<string, WikilinkRef[]>();
  private clarosBlocksByPath = new Map<string, ClarosBlockRef[]>();
  private runs: MacroRunLedgerEntry[] = [];

  private titleToNotes = new Map<string, NoteRef[]>();
  private aliasToNotes = new Map<string, NoteRef[]>();
  private slugToNotes = new Map<string, NoteRef[]>();
  private tagToNotes = new Map<string, NoteRef[]>();
  private backlinksByPath = new Map<string, WikilinkRef[]>();
  private searchRecords: SearchRecord[] = [];
  private manifestSummary: ProjectManifest = {};

  async build(snapshot: ProjectFormatSnapshot, runs?: MacroRunLedgerEntry[]): Promise<void> {
    this.chaptersById = new Map(snapshot.chapters.map((chapter) => [chapter.id, chapter]));
    this.scenesByPath = new Map(snapshot.scenes.map((scene) => [normalizePath(scene.path), scene]));
    this.notesByPath = new Map(snapshot.notes.map((note) => [normalizePath(note.path), note]));
    this.wikilinksByPath = groupByPath(snapshot.wikilinks);
    this.clarosBlocksByPath = groupByPath(snapshot.clarosBlocks);
    this.runs = runs === undefined ? [] : [...runs];
    this.manifestSummary = cloneManifestSummary(snapshot.manifest);
    this.rebuildDerivedIndexes();
  }

  async updateDocument(path: string, raw: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    this.wikilinksByPath.set(normalizedPath, extractWikilinks(normalizedPath, raw));
    this.clarosBlocksByPath.set(normalizedPath, extractClarosBlocks(normalizedPath, raw));

    const note = parseNoteRef(normalizedPath, raw);
    if (note !== undefined) {
      this.notesByPath.set(normalizedPath, note);
      this.scenesByPath.delete(normalizedPath);
      this.rebuildDerivedIndexes();
      return;
    }

    const scene = parseSceneRef(normalizedPath, raw);
    if (scene !== undefined) {
      this.scenesByPath.set(normalizedPath, scene);
      this.notesByPath.delete(normalizedPath);
      if (!this.chaptersById.has(scene.chapterId)) {
        const chapter = makeDerivedChapter(scene.chapterId);
        if (chapter !== undefined) {
          this.chaptersById.set(chapter.id, chapter);
        }
      }
      this.rebuildDerivedIndexes();
      return;
    }

    this.notesByPath.delete(normalizedPath);
    this.scenesByPath.delete(normalizedPath);
    this.rebuildDerivedIndexes();
  }

  async removeDocument(path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    this.scenesByPath.delete(normalizedPath);
    this.notesByPath.delete(normalizedPath);
    this.wikilinksByPath.delete(normalizedPath);
    this.clarosBlocksByPath.delete(normalizedPath);
    this.rebuildDerivedIndexes();
  }

  async updateRuns(runs: MacroRunLedgerEntry[]): Promise<void> {
    this.runs = [...runs];
    this.rebuildDerivedIndexes();
  }

  getManifestSummary(): ProjectManifest {
    return cloneManifestSummary(this.manifestSummary);
  }

  listChapters(): ChapterRef[] {
    return [...this.chaptersById.values()].sort(compareChapterRefs);
  }

  listScenes(): SceneRef[] {
    return [...this.scenesByPath.values()].sort(compareSceneRefs);
  }

  listNotes(): NoteRef[] {
    return [...this.notesByPath.values()].sort((left, right) =>
      left.path.localeCompare(right.path)
    );
  }

  listClarosBlocks(): ClarosBlockRef[] {
    return [...this.clarosBlocksByPath.values()]
      .flatMap((blocks) => blocks)
      .sort(compareSourcePathThenOffset);
  }

  listMacroRuns(filter?: MacroRunFilter): MacroRunLedgerEntry[] {
    const sinceMs = filter?.since === undefined ? undefined : Date.parse(filter.since);

    let filtered = this.runs.filter((entry) => {
      if (filter?.document !== undefined && entry.document !== filter.document) {
        return false;
      }
      if (filter?.macroId !== undefined && entry.macro !== filter.macroId) {
        return false;
      }
      if (filter?.sceneId !== undefined && entry.sceneId !== filter.sceneId) {
        return false;
      }
      if (filter?.chapterId !== undefined && entry.chapterId !== filter.chapterId) {
        return false;
      }
      if (sinceMs !== undefined && !Number.isNaN(sinceMs)) {
        const createdAtMs = Date.parse(entry.createdAt);
        if (Number.isNaN(createdAtMs) || createdAtMs < sinceMs) {
          return false;
        }
      }
      return true;
    });

    if (filter?.limit !== undefined) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  resolveWikilink(target: string, from?: ProjectIndexDocumentRef): WikilinkResolution {
    return this.resolveWikilinkInternal(target, from?.path);
  }

  getOutgoingLinks(ref: ProjectIndexDocumentRef): WikilinkRef[] {
    const path = normalizePath(ref.path);
    return [...(this.wikilinksByPath.get(path) ?? [])];
  }

  getBacklinks(ref: ProjectIndexDocumentRef): WikilinkRef[] {
    const path = normalizePath(ref.path);
    return [...(this.backlinksByPath.get(path) ?? [])];
  }

  findByTag(tag: string): NoteRef[] {
    return [...(this.tagToNotes.get(normalizeToken(tag)) ?? [])];
  }

  search(query: string, options?: ProjectIndexSearchOptions): ProjectIndexSearchResult[] {
    const tokens = tokenize(query);
    if (tokens.length === 0) {
      return [];
    }

    const kinds = options?.kinds === undefined ? undefined : new Set(options.kinds);

    const scored = this.searchRecords
      .filter((record) => (kinds === undefined ? true : kinds.has(record.kind)))
      .map((record) => {
        const score = tokens.reduce(
          (current, token) => (record.tokens.includes(token) ? current + 1 : current),
          0
        );

        return {
          path: record.path,
          kind: record.kind,
          score,
          title: record.title,
          ref: record.ref,
        } satisfies ProjectIndexSearchResult;
      })
      .filter((result) => result.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.path.localeCompare(right.path);
      });

    return options?.limit === undefined ? scored : scored.slice(0, options.limit);
  }

  private rebuildDerivedIndexes(): void {
    this.titleToNotes = new Map();
    this.aliasToNotes = new Map();
    this.slugToNotes = new Map();
    this.tagToNotes = new Map();
    this.searchRecords = [];

    for (const note of this.listNotes()) {
      const title = note.title;
      if (title !== undefined && title.trim().length > 0) {
        pushToMapArray(this.titleToNotes, normalizeToken(title), note);
      }

      for (const alias of note.aliases) {
        pushToMapArray(this.aliasToNotes, normalizeToken(alias), note);
      }

      for (const key of noteSlugKeys(note)) {
        pushToMapArray(this.slugToNotes, key, note);
      }

      for (const tag of note.tags) {
        pushToMapArray(this.tagToNotes, normalizeToken(tag), note);
      }

      const noteType =
        typeof note.frontmatter.type === "string" ? note.frontmatter.type : undefined;
      const moduleNamespaceKeys = getModuleNamespaceKeys(note.frontmatter);
      const noteTokens = [
        note.path,
        note.slug,
        note.title,
        noteType,
        ...note.aliases,
        ...note.tags,
        ...moduleNamespaceKeys,
        ...documentSearchTokens(
          note.path,
          this.clarosBlocksByPath.get(normalizePath(note.path)) ?? [],
          this.runs
        ),
      ];

      this.searchRecords.push({
        path: note.path,
        kind: "note",
        title: note.title,
        tokens: normalizeToken(noteTokens.join(" ")),
        ref: note,
      });
    }

    for (const scene of this.listScenes()) {
      const sceneTokens = [
        scene.path,
        scene.slug,
        scene.title,
        scene.chapterId,
        ...documentSearchTokens(
          scene.path,
          this.clarosBlocksByPath.get(normalizePath(scene.path)) ?? [],
          this.runs
        ),
      ];

      this.searchRecords.push({
        path: scene.path,
        kind: "scene",
        title: scene.title,
        tokens: normalizeToken(sceneTokens.join(" ")),
        ref: scene,
      });
    }

    this.backlinksByPath = new Map();
    for (const links of this.wikilinksByPath.values()) {
      for (const link of links) {
        const resolution = this.resolveWikilinkInternal(link.target, link.fromPath);
        if (resolution.status === "resolved") {
          pushToMapArray(this.backlinksByPath, resolution.path, link);
        }
      }
    }

    for (const [path, links] of this.backlinksByPath.entries()) {
      this.backlinksByPath.set(path, [...links].sort(compareSourcePathThenOffset));
    }
  }

  private resolveWikilinkInternal(target: string, fromPath?: string): WikilinkResolution {
    const normalizedTarget = normalizeLinkTarget(target);
    if (normalizedTarget.length === 0) {
      return { status: "unresolved", target: normalizedTarget };
    }

    const documentPath = this.resolveExplicitPath(normalizedTarget, fromPath);
    if (documentPath !== undefined) {
      const ref = this.notesByPath.get(documentPath) ?? this.scenesByPath.get(documentPath);
      if (ref !== undefined) {
        return {
          status: "resolved",
          reason: "explicit-path",
          path: documentPath,
          ref,
        };
      }
    }

    const byTitle = this.titleToNotes.get(normalizeToken(normalizedTarget)) ?? [];
    if (byTitle.length === 1) {
      return {
        status: "resolved",
        reason: "title",
        path: byTitle[0].path,
        ref: byTitle[0],
      };
    }
    if (byTitle.length > 1) {
      return {
        status: "ambiguous",
        reason: "title",
        target: normalizedTarget,
        candidates: [...byTitle],
      };
    }

    const byAlias = this.aliasToNotes.get(normalizeToken(normalizedTarget)) ?? [];
    if (byAlias.length === 1) {
      return {
        status: "resolved",
        reason: "alias",
        path: byAlias[0].path,
        ref: byAlias[0],
      };
    }
    if (byAlias.length > 1) {
      return {
        status: "ambiguous",
        reason: "alias",
        target: normalizedTarget,
        candidates: [...byAlias],
      };
    }

    const slugMatches = this.slugToNotes.get(slugify(normalizedTarget)) ?? [];
    if (slugMatches.length === 1) {
      return {
        status: "resolved",
        reason: "slug",
        path: slugMatches[0].path,
        ref: slugMatches[0],
      };
    }
    if (slugMatches.length > 1) {
      return {
        status: "ambiguous",
        reason: "slug",
        target: normalizedTarget,
        candidates: [...slugMatches],
      };
    }

    return { status: "unresolved", target: normalizedTarget };
  }

  private resolveExplicitPath(target: string, fromPath?: string): string | undefined {
    const allPaths = new Set([...this.notesByPath.keys(), ...this.scenesByPath.keys()]);

    for (const candidate of explicitPathCandidates(target, fromPath)) {
      if (allPaths.has(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }
}

export function createInMemoryProjectIndex(): ProjectIndex {
  return new InMemoryProjectIndexImpl();
}

function parseNoteRef(path: string, raw: string): NoteRef | undefined {
  if (!isNotePath(path)) {
    return undefined;
  }

  const document = parseMarkdownDocument(path, raw);
  const frontmatter = (document.frontmatter ?? {}) as NoteFrontmatter;

  return {
    kind: "note",
    path,
    slug: basenameWithoutExtension(path),
    title: typeof frontmatter.title === "string" ? frontmatter.title : undefined,
    aliases: normalizeStringList(frontmatter.aliases),
    tags: normalizeStringList(frontmatter.tags),
    frontmatter,
  };
}

function parseSceneRef(path: string, raw: string): SceneRef | undefined {
  const parsed = parseScenePath(path);
  if (parsed === undefined) {
    return undefined;
  }

  const document = parseMarkdownDocument(path, raw);
  const frontmatter = (document.frontmatter ?? {}) as SceneFrontmatter;

  return {
    kind: "scene",
    id: `${parsed.chapterId}/${parsed.sceneStem}`,
    path,
    chapterId: parsed.chapterId,
    sequence: parsed.sequence,
    slug: parsed.slug,
    title: typeof frontmatter.title === "string" ? frontmatter.title : undefined,
    frontmatter,
  };
}

function parseScenePath(
  path: string
): { chapterId: string; sceneStem: string; sequence: number; slug: string } | undefined {
  const parts = normalizePath(path).split("/");
  if (parts.length !== 3 || parts[0] !== "manuscript" || !parts[2].toLowerCase().endsWith(".md")) {
    return undefined;
  }

  const chapterId = parts[1];
  const sceneStem = parts[2].slice(0, -3);
  const match = SCENE_STEM_RE.exec(sceneStem);
  if (match === null) {
    return undefined;
  }

  return {
    chapterId,
    sceneStem,
    sequence: Number.parseInt(match[1], 10),
    slug: match[2],
  };
}

function makeDerivedChapter(chapterId: string): ChapterRef | undefined {
  const match = CHAPTER_ID_RE.exec(chapterId);
  if (match === null) {
    return undefined;
  }

  const sequence = Number.parseInt(match[1], 10);
  const slug = match[2];
  return {
    kind: "chapter",
    id: chapterId,
    path: `manuscript/${chapterId}`,
    sequence,
    slug,
    title: `Chapter ${sequence}`,
    metadata: {},
  };
}

function isNotePath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized.startsWith("notes/") && normalized.toLowerCase().endsWith(".md");
}

function explicitPathCandidates(target: string, fromPath?: string): string[] {
  const normalizedTarget = normalizePath(target);
  const withExtension = normalizedTarget.toLowerCase().endsWith(".md")
    ? normalizedTarget
    : `${normalizedTarget}.md`;

  const candidates = new Set<string>([normalizedTarget, withExtension]);
  if (fromPath !== undefined && (target.startsWith("./") || target.startsWith("../"))) {
    const base = dirname(normalizePath(fromPath));
    const joined = normalizePath(joinRelative(base, target));
    candidates.add(joined);
    if (!joined.toLowerCase().endsWith(".md")) {
      candidates.add(`${joined}.md`);
    }
  }

  return [...candidates];
}

function normalizeLinkTarget(target: string): string {
  const trimmed = target.trim();
  const withoutBrackets =
    trimmed.startsWith("[[") && trimmed.endsWith("]]") ? trimmed.slice(2, -2) : trimmed;
  const beforeAlias = withoutBrackets.split("|")[0]?.trim() ?? "";
  const beforeFragment = beforeAlias.split("#")[0]?.trim() ?? "";
  return beforeFragment;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeToken(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function slugify(value: string): string {
  return normalizeToken(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function noteSlugKeys(note: NoteRef): string[] {
  const withoutExt = note.path.replace(/\.md$/i, "");
  return [slugify(note.slug), slugify(withoutExt), slugify(note.path)];
}

function getModuleNamespaceKeys(frontmatter: NoteFrontmatter): string[] {
  return Object.entries(frontmatter)
    .filter(([key, value]) => {
      if (RESERVED_NOTE_FRONTMATTER_KEYS.has(key)) {
        return false;
      }
      return typeof value === "object" && value !== null && !Array.isArray(value);
    })
    .map(([key]) => key);
}

function documentSearchTokens(
  path: string,
  clarosBlocks: ClarosBlockRef[],
  runs: MacroRunLedgerEntry[]
): string[] {
  const normalizedPath = normalizePath(path);
  const matchingRuns = runs.filter(
    (entry) => entry.document !== undefined && normalizePath(entry.document) === normalizedPath
  );

  return [
    ...clarosBlocks.flatMap((block) => [block.title, block.runId]),
    ...matchingRuns.flatMap((entry) => [entry.id, entry.macro, entry.chapterId, entry.sceneId]),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function cloneManifestSummary(manifest: ProjectManifest): ProjectManifest {
  return structuredClone(manifest);
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
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
  const match = CHAPTER_ID_RE.exec(chapterId);
  return match === null ? Number.POSITIVE_INFINITY : Number.parseInt(match[1], 10);
}

function compareSourcePathThenOffset(
  left: Pick<WikilinkRef, "fromPath" | "range"> | Pick<ClarosBlockRef, "fromPath" | "range">,
  right: Pick<WikilinkRef, "fromPath" | "range"> | Pick<ClarosBlockRef, "fromPath" | "range">
): number {
  return (
    left.fromPath.localeCompare(right.fromPath) ||
    left.range.start.offset - right.range.start.offset
  );
}

function groupByPath<T extends { fromPath: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    pushToMapArray(grouped, normalizePath(item.fromPath), item);
  }
  return grouped;
}

function pushToMapArray<T>(map: Map<string, T[]>, key: string, item: T): void {
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, [item]);
    return;
  }
  existing.push(item);
}

function basenameWithoutExtension(path: string): string {
  const segments = normalizePath(path).split("/");
  const filename = segments[segments.length - 1] ?? path;
  return filename.replace(/\.md$/i, "");
}

function dirname(path: string): string {
  const segments = normalizePath(path).split("/");
  segments.pop();
  return segments.join("/");
}

function joinRelative(base: string, relative: string): string {
  const segments = [...base.split("/"), ...relative.split("/")];
  const normalized: string[] = [];

  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }

  return normalized.join("/");
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
