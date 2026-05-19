# Claros MVP Editor Interface Contract

Status: implemented boundary for current MVP workspace integration.

This contract documents the stable editor-facing API provided by
`@claros/story-state` today.

## Boundary

Editor surfaces should consume:

- `openProject(root)`
- Returned `ClarosProject` instance methods
- Shared types re-exported from `@claros/story-state`

Editor surfaces should not depend on:

- raw filesystem internals
- in-memory index internals
- direct imports from `@claros/emergence-engine`

## Core Types

```ts
export type DocumentRef = SceneRef | NoteRef | { path: string };

export interface MarkdownDocument {
  path: string;
  raw: string;
  frontmatter?: Record<string, unknown>;
  body: string;
}

export type DocumentInsertionPoint =
  | { kind: "offset"; offset: number }
  | { kind: "end-of-document" }
  | { kind: "after-block"; blockOffset: number }
  | { kind: "replace-range"; start: number; end: number };
```

## `openProject` and `ClarosProject`

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

  getNoteFrontmatterPath(note: NoteRef | string, path: string): Promise<unknown>;
  setNoteFrontmatterPath(note: NoteRef | string, path: string, value: unknown): Promise<void>;

  resolveWikilink(link: string, from?: DocumentRef): LinkResolution;
  getBacklinks(ref: DocumentRef): LinkRef[];
  search(query: string, options?: SearchOptions): SearchResult[];

  listClarosBlocks(ref?: DocumentRef): ClarosBlockRef[];
  executeMacroInDocument(
    options: ProjectExecuteMacroInDocumentOptions
  ): Promise<ExecuteMacroInDocumentResult>;
  listMacroRuns(filter?: MacroRunFilter): Promise<MacroRunLedgerEntry[]>;
  getMacroRun(id: string): Promise<MacroRunLedgerEntry | undefined>;

  checkpoint(message?: string, options?: CheckpointOptions): Promise<CheckpointRef>;
  getCheckpointStatus(): Promise<CheckpointStatus>;
  listCheckpoints(options?: HistoryOptions): Promise<CheckpointRef[]>;
  restoreCheckpoint(id: string, options?: RestoreCheckpointOptions): Promise<TimelineRef>;
}
```

## Document Guarantees

- `readDocument` returns canonical markdown file content.
- `writeDocument` performs atomic file writes.
- Workspace writes refresh in-memory index data.
- Frontmatter-only note mutations preserve markdown body bytes exactly.

## Emergence and Run Ledger Contract

`executeMacroInDocument`:

- executes macro in document context
- appends ledger entry to `state/runs/emergence.yaml`
- stores markdown display block in run ledger entry
- optionally inserts `[!claros]` block in document when `insertAt` is provided

Result surface:

```ts
export interface ExecuteMacroInDocumentResult {
  run: MacroRunLedgerEntry;
  document?: MarkdownDocument;
  block?: ClarosBlockRef;
  macroResult: MacroResult;
}
```

Run filtering surface:

```ts
export interface MacroRunFilter {
  document?: string;
  macroId?: string;
  sceneId?: string;
  chapterId?: string;
  since?: string;
  limit?: number;
}
```

## Checkpoint Contract Status

Shape is available now for editor integration, but internals are deferred.

Current behavior:

- `getCheckpointStatus()` returns placeholder status (`dirty: false`, empty
  changed paths, `currentTimeline: "working"`)
- `listCheckpoints()` returns `[]`
- `checkpoint()` throws `CheckpointNotImplementedError`
- `restoreCheckpoint()` throws `CheckpointNotImplementedError`

Treat checkpoint internals as deferred until Iter 14 implementation lands.

## Out of Scope for This Contract

- collaborative sync (Yjs)
- full Git UX/branch management in editor
- deterministic replay/lockfile guarantees for module upgrades
