# Claros MVP Editor Interface Contract

**Status:** Accepted planning contract  
**Created:** 2026-05-18  
**Audience:** Silas / local editor implementation tasks; future agent implementation specs  
**Governing ADRs:** ADR-023, ADR-024, ADR-025, ADR-026, ADR-027

---

## Purpose

This document defines the stable package/API boundary the editor can develop against. The web editor is not the agent-owned MVP implementation target, but it should be able to consume these interfaces as they land.

The editor should not depend on raw internals of the emergence engine, filesystem adapters, or index implementation.

---

## Product Model

- Claros is local-first.
- Files are canonical.
- The editor presents chapters/scenes/notes, not raw paths by default.
- Autosave writes files; checkpoints create Git commits.
- Emergence results are writer-facing `[!claros]` Markdown blockquotes linked to a YAML run ledger.

---

## Shared Base Types

These types are defined in `@claros/story-format` and re-exported from `@claros/story-state`.

```ts
export interface SourceRange {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
}

export type DocumentInsertionPoint =
  | { kind: "offset"; offset: number }
  | { kind: "end-of-document" }
  | { kind: "after-block"; blockOffset: number }
  | { kind: "replace-range"; start: number; end: number };

export interface MacroRunFilter {
  document?: string;
  macroId?: string;
  sceneId?: string;
  chapterId?: string;
  since?: string;
  limit?: number;
}

/**
 * Re-exported from @claros/emergence-engine via @claros/story-state.
 * Editor consumers import from @claros/story-state only.
 */
export type UserPromptFn = (prompt: MacroParamPrompt) => Promise<unknown>;
```

---

## Core API Surface

```ts
export async function openProject(
  root: string,
  options?: OpenProjectOptions
): Promise<ClarosProject>;

export interface ClarosProject {
  readonly root: string;
  readonly manifest: ProjectManifest;

  listChapters(): ChapterRef[];
  listScenes(): SceneRef[];
  listNotes(): NoteRef[];

  readDocument(ref: DocumentRef): Promise<MarkdownDocument>;
  writeDocument(ref: DocumentRef, document: MarkdownDocument | string): Promise<void>;

  getStoryState(path: string): Promise<unknown>;
  setStoryState(path: string, value: unknown): Promise<void>;
  getSceneState(sceneId: string, path: string): Promise<unknown>;
  setSceneState(sceneId: string, path: string, value: unknown): Promise<void>;
  getChapterState(chapterId: string, path: string): Promise<unknown>;
  setChapterState(chapterId: string, path: string, value: unknown): Promise<void>;

  /**
   * Read/write arbitrary module namespace paths in note frontmatter.
   * Path examples: "osr.hp.current", "mythic.status", "title"
   * All are async (Promise). Writes preserve body and unknown frontmatter keys.
   */
  getNoteFrontmatterPath(note: NoteRef | string, path: string): Promise<unknown>;
  setNoteFrontmatterPath(note: NoteRef | string, path: string, value: unknown): Promise<void>;

  resolveWikilink(link: string, from?: DocumentRef): LinkResolution;
  getBacklinks(ref: DocumentRef): LinkRef[];
  search(query: string, options?: SearchOptions): SearchResult[];

  listClarosBlocks(ref?: DocumentRef): ClarosBlockRef[];
  executeMacroInDocument(
    options: ExecuteMacroInDocumentOptions
  ): Promise<ExecuteMacroInDocumentResult>;
  listMacroRuns(filter?: MacroRunFilter): Promise<MacroRunLedgerEntry[]>;
  getMacroRun(id: string): Promise<MacroRunLedgerEntry | undefined>;

  checkpoint(message?: string, options?: CheckpointOptions): Promise<CheckpointRef>;
  getCheckpointStatus(): Promise<CheckpointStatus>;
  listCheckpoints(options?: HistoryOptions): Promise<CheckpointRef[]>;
  restoreCheckpoint(id: string, options?: RestoreCheckpointOptions): Promise<TimelineRef>;
}
```

Exact names may be refined in implementation, but capabilities should remain stable.

---

## Document Model

```ts
export type DocumentRef = SceneRef | NoteRef | { path: string };

export interface MarkdownDocument {
  path: string;
  raw: string;
  frontmatter?: Record<string, unknown>;
  body: string;
}
```

Editor assumptions:

- `readDocument` returns canonical file content.
- `writeDocument` autosaves to canonical files using atomic write semantics.
- If the editor edits prose/body, it can write raw document content.
- If APIs mutate frontmatter, they preserve the body exactly.

---

## Emergence APIs

```ts
export interface ExecuteMacroInDocumentOptions {
  document: DocumentRef;
  macroId: string;
  params?: Record<string, unknown>;
  insertAt?: DocumentInsertionPoint;
  userPrompt?: UserPromptFn;
}

export interface ExecuteMacroInDocumentResult {
  run: MacroRunLedgerEntry;
  document?: MarkdownDocument;
  block?: ClarosBlockRef;
}

export interface ClarosBlockRef {
  kind: "claros-block";
  fromPath: string;
  title?: string;
  runId?: string;
  raw: string;
  range: SourceRange;
}
```

Editor behavior:

- Use command palette/slash action to invoke a macro.
- Prompt for required params.
- Call `executeMacroInDocument`.
- Insert or display the returned `[!claros]` block.
- Use `listMacroRuns` for macro/emergence log views.

The editor must treat the manuscript block as user-editable. The ledger remains provenance only.

---

## Checkpoint APIs

```ts
export interface CheckpointStatus {
  dirty: boolean;
  changedPaths: string[];
  currentTimeline: string;
  head?: string;
}

export interface CheckpointOptions {
  trigger?:
    | "manual"
    | "scene-transition"
    | "chapter-transition"
    | "session-end"
    | "pre-restore"
    | "pre-structural-change";
}

export interface RestoreCheckpointOptions {
  mode?: "new-timeline"; // default for MVP
  name?: string;
}
```

Editor behavior:

- Show uncheckpointed work, not unsaved work.
- Do not create checkpoints for every autosave.
- Offer manual checkpoint actions.
- Trigger checkpoints at scene/chapter/session transitions where appropriate.
- Restore creates a new timeline/branch by default.

---

## Required Editor-Safe Guarantees

- The editor can build its sidebar from `listChapters`, `listScenes`, and `listNotes`.
- The editor can read/write documents without knowing filesystem details.
- The editor can resolve wikilinks/backlinks without owning an index implementation.
- The editor can execute emergence macros without manually constructing `MacroInvocationContext`.
- The editor can render `[!claros]` blocks and macro log views from API data.
- The editor can checkpoint/restore without exposing raw Git by default.
- The editor does not need to import `@claros/emergence-engine` directly; all needed types are re-exported from `@claros/story-state`.

---

## Out of Scope for MVP Contract

- collaborative Yjs sync
- deterministic replay across module upgrades
- complete module dependency lockfiles
- raw Git branch UI
- rich WYSIWYG document model ownership by editor-core
